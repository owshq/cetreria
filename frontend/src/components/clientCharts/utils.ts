import type { Activity, ActivityType, CalendarEvent, Document, UserAssignee } from '@shared/types';
import {
  getActivityAssigneeIds,
  getActivityTypeLabel,
  hoursForWorkerOnActivity,
  isDateInRange,
} from '@shared/types';
import { findEventForActivity } from '@/lib/activityUtils';
import { applyChartPalette } from '@/lib/chartColorPalette';

export type TypeBucket = {
  typeId: string;
  label: string;
  hours: number;
  color: string;
};

export type ChartDatum = TypeBucket & {
  shortName: string;
  percent: number;
};

export function truncateLabel(label: string, max = 10): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function buildScaleMax(maxHours: number): number {
  if (maxHours <= 0) return 4;
  const padded = maxHours * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export type ActivityValueMeasure = 'hours' | 'income';
export type ActivityGroupBy = 'type' | 'team';

export function assigneeIdsForActivity(
  activity: Activity,
  events: CalendarEvent[],
  assigneesById: Map<string, UserAssignee>,
): string[] {
  const event = findEventForActivity(activity, events);
  return getActivityAssigneeIds(activity, event).filter((userId) => assigneesById.has(userId));
}

export function buildActivityChartBuckets(
  groupBy: ActivityGroupBy,
  valueMeasure: ActivityValueMeasure,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): TypeBucket[] {
  if (groupBy === 'type') {
    return valueMeasure === 'hours'
      ? buildTypeBuckets(activities, activityTypes)
      : buildIncomeTypeBuckets(activities, documents, activityTypes, from, to);
  }
  return valueMeasure === 'hours'
    ? buildTeamBuckets(activities, events, assignees)
    : buildIncomeTeamBuckets(activities, documents, events, assignees, from, to);
}

export function buildTypeBuckets(
  activities: Activity[],
  activityTypes: ActivityType[],
): TypeBucket[] {
  const hoursByType = new Map<string, number>();
  for (const activity of activities) {
    hoursByType.set(activity.type, (hoursByType.get(activity.type) ?? 0) + activity.hours);
  }

  return applyChartPalette(
    [...hoursByType.entries()]
      .filter(([, hours]) => hours > 0)
      .map(([typeId, hours]) => ({
        typeId,
        label: getActivityTypeLabel(typeId, activityTypes),
        hours,
        color: activityTypes.find((type) => type.id === typeId)?.color ?? '#a3a3a3',
      }))
      .sort((a, b) => b.hours - a.hours),
  );
}

export function buildIncomeTypeBuckets(
  activities: Activity[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): TypeBucket[] {
  const activityTypeById = new Map(activities.map((activity) => [activity.id, activity.type]));
  const incomeByType = new Map<string, number>();

  for (const document of documents) {
    if (!isDateInRange(document.date, from, to)) continue;
    if (!document.activityId) continue;
    const typeId = activityTypeById.get(document.activityId) ?? 'none';
    incomeByType.set(typeId, (incomeByType.get(typeId) ?? 0) + document.total);
  }

  return applyChartPalette(
    [...incomeByType.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([typeId, hours]) => ({
        typeId,
        label: typeId === 'none' ? 'Sin actividad' : getActivityTypeLabel(typeId, activityTypes),
        hours,
        color: activityTypes.find((type) => type.id === typeId)?.color ?? '#a3a3a3',
      }))
      .sort((a, b) => b.hours - a.hours),
  );
}

export function toChartData(buckets: TypeBucket[]): ChartDatum[] {
  const totalHours = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);

  return buckets.map((bucket) => ({
    ...bucket,
    shortName: truncateLabel(bucket.label),
    percent: totalHours > 0 ? Math.round((bucket.hours / totalHours) * 100) : 0,
  }));
}

export function getTotalHours(buckets: TypeBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.hours, 0);
}

export function buildTeamBuckets(
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
): TypeBucket[] {
  const assigneesById = new Map(assignees.map((user) => [user.id, user]));
  const hoursByUser = new Map<string, number>();

  for (const activity of activities) {
    const event = findEventForActivity(activity, events);
    const targets = assigneeIdsForActivity(activity, events, assigneesById);
    if (targets.length === 0) continue;

    for (const userId of targets) {
      const hours = hoursForWorkerOnActivity(activity, event, userId);
      if (hours <= 0) continue;
      hoursByUser.set(userId, (hoursByUser.get(userId) ?? 0) + hours);
    }
  }

  return applyChartPalette(
    [...hoursByUser.entries()]
      .filter(([, hours]) => hours > 0)
      .map(([userId, hours]) => ({
        typeId: userId,
        label: assigneesById.get(userId)?.name ?? 'Usuario',
        hours,
        color: '#a3a3a3',
      }))
      .sort((a, b) => b.hours - a.hours),
  );
}

export function buildIncomeTeamBuckets(
  activities: Activity[],
  documents: Document[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  from: string,
  to: string,
): TypeBucket[] {
  const assigneesById = new Map(assignees.map((user) => [user.id, user]));
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const incomeByUser = new Map<string, number>();

  for (const document of documents) {
    if (!isDateInRange(document.date, from, to)) continue;
    if (!document.activityId) continue;

    const activity = activityById.get(document.activityId);
    if (!activity) continue;

    const targets = assigneeIdsForActivity(activity, events, assigneesById);
    if (targets.length === 0) continue;

    const share = document.total / targets.length;
    for (const userId of targets) {
      incomeByUser.set(userId, (incomeByUser.get(userId) ?? 0) + share);
    }
  }

  return applyChartPalette(
    [...incomeByUser.entries()]
      .filter(([, amount]) => amount > 0)
      .map(([userId, hours]) => ({
        typeId: userId,
        label: assigneesById.get(userId)?.name ?? 'Usuario',
        hours,
        color: '#a3a3a3',
      }))
      .sort((a, b) => b.hours - a.hours),
  );
}

export function hasActivityChartData(
  groupBy: ActivityGroupBy,
  valueMeasure: ActivityValueMeasure,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): boolean {
  return (
    getTotalHours(
      buildActivityChartBuckets(
        groupBy,
        valueMeasure,
        activities,
        events,
        assignees,
        documents,
        activityTypes,
        from,
        to,
      ),
    ) > 0
  );
}
