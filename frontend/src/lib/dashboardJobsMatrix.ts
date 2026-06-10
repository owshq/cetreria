import { format } from 'date-fns';
import type {
  Activity,
  ActivityAssigneeSlot,
  CalendarEvent,
  ShiftCode,
  UserAssignee,
} from '@shared/types';
import {
  findEventForActivity,
  getWorkerHoursStatus,
  normalizeActivityAssigneeSlots,
} from '@shared/types';

export type DashboardJobsActivityEntry = {
  activity: Activity;
  event: CalendarEvent;
  shift: ShiftCode;
  hourRange: string;
  /** Horas firmadas (contabilizadas). */
  signedHours: number;
  /** Horas del tramo asignado. */
  assignedHours: number;
  /** Sin firmar (aún no confirmadas). */
  needsSignature: boolean;
  /** Tramo en curso: aún no se puede firmar. */
  awaitingSlotEnd: boolean;
  /** Puede firmar ahora (tramo finalizado y sin firma). */
  canSignNow: boolean;
};

export type DashboardJobsDayCell = {
  shift: ShiftCode;
  hourRange: string;
  signedHours: number;
  assignedHours: number;
  pendingCount: number;
  entries: DashboardJobsActivityEntry[];
  primaryEntry: DashboardJobsActivityEntry;
};

export type DashboardJobsWorkerRow = {
  userId: string;
  userName: string;
  cellsByDate: Record<string, DashboardJobsDayCell | undefined>;
  totalSignedHours: number;
  totalAssignedHours: number;
  pendingSignatureCount: number;
};

export type DashboardJobsMatrixData = {
  dates: string[];
  rows: DashboardJobsWorkerRow[];
};

function formatHourRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

function resolvePreviewEvent(
  activity: Activity,
  event: CalendarEvent | undefined,
  slot: ActivityAssigneeSlot,
  userId: string,
): CalendarEvent {
  if (event) return event;

  return {
    id: `activity-${activity.id}`,
    workspaceId: activity.workspaceId,
    title: activity.description,
    description: activity.description,
    date: activity.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    assignedTo: [userId],
    createdBy: activity.userId,
    clientId: activity.clientId,
    activityId: activity.id,
    history: [],
  };
}

function mergeCell(
  existing: DashboardJobsDayCell | undefined,
  incoming: DashboardJobsActivityEntry,
): DashboardJobsDayCell {
  if (!existing) {
    return {
      shift: incoming.shift,
      hourRange: incoming.hourRange,
      signedHours: incoming.signedHours,
      assignedHours: incoming.assignedHours,
      pendingCount: incoming.canSignNow ? 1 : 0,
      entries: [incoming],
      primaryEntry: incoming,
    };
  }

  const entries = [...existing.entries, incoming];
  const signedHours = existing.signedHours + incoming.signedHours;
  const assignedHours = existing.assignedHours + incoming.assignedHours;
  const pendingCount =
    existing.pendingCount + (incoming.canSignNow ? 1 : 0);
  const primaryEntry =
    incoming.assignedHours >= existing.primaryEntry.assignedHours
      ? incoming
      : existing.primaryEntry;
  const hourRanges = [...new Set(entries.map((entry) => entry.hourRange))];

  return {
    shift: primaryEntry.shift,
    hourRange: hourRanges.join(', '),
    signedHours,
    assignedHours,
    pendingCount,
    entries,
    primaryEntry,
  };
}

export function buildDashboardJobsMatrix(
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  from: string,
  to: string,
): DashboardJobsMatrixData {
  const assigneesById = new Map(assignees.map((user) => [user.id, user]));
  const dateSet = new Set<string>();
  const cells = new Map<string, Map<string, DashboardJobsDayCell>>();

  for (const activity of activities) {
    if (activity.date < from || activity.date > to) continue;

    const linkedEvent = findEventForActivity(activity, events);
    const slots = normalizeActivityAssigneeSlots(activity, linkedEvent);
    if (slots.length === 0) continue;

    dateSet.add(activity.date);

    for (const slot of slots) {
      const hoursStatus = getWorkerHoursStatus(activity, linkedEvent, slot.userId);
      const entry: DashboardJobsActivityEntry = {
        activity,
        event: resolvePreviewEvent(activity, linkedEvent, slot, slot.userId),
        shift: slot.shift,
        hourRange: formatHourRange(slot.startTime, slot.endTime),
        signedHours: hoursStatus.signedHours,
        assignedHours: hoursStatus.assignedHours,
        needsSignature: hoursStatus.needsSignature,
        awaitingSlotEnd: hoursStatus.awaitingSlotEnd,
        canSignNow: hoursStatus.canSignNow,
      };
      const userCells = cells.get(slot.userId) ?? new Map<string, DashboardJobsDayCell>();
      userCells.set(activity.date, mergeCell(userCells.get(activity.date), entry));
      cells.set(slot.userId, userCells);
    }
  }

  const dates = [...dateSet].sort();
  const userIds = [...cells.keys()];

  const rows: DashboardJobsWorkerRow[] = userIds.map((userId) => {
    const userCells = cells.get(userId)!;
    let totalSignedHours = 0;
    let totalAssignedHours = 0;
    let pendingSignatureCount = 0;
    const cellsByDate: Record<string, DashboardJobsDayCell | undefined> = {};

    for (const date of dates) {
      const cell = userCells.get(date);
      cellsByDate[date] = cell;
      if (!cell) continue;
      totalSignedHours += cell.signedHours;
      totalAssignedHours += cell.assignedHours;
      pendingSignatureCount += cell.pendingCount;
    }

    return {
      userId,
      userName: assigneesById.get(userId)?.name ?? 'Operario',
      cellsByDate,
      totalSignedHours: Math.round(totalSignedHours * 10) / 10,
      totalAssignedHours: Math.round(totalAssignedHours * 10) / 10,
      pendingSignatureCount,
    };
  });

  return { dates, rows };
}

export function countWorkerRowActivities(
  row: DashboardJobsWorkerRow,
  dates: string[],
): number {
  let total = 0;
  for (const date of dates) {
    const cell = row.cellsByDate[date];
    if (cell) total += cell.entries.length;
  }
  return total;
}

export function sortDashboardJobsWorkerRows(
  rows: DashboardJobsWorkerRow[],
  dates: string[],
  viewerUserId?: string | null,
): DashboardJobsWorkerRow[] {
  return [...rows].sort((a, b) => {
    if (viewerUserId) {
      if (a.userId === viewerUserId && b.userId !== viewerUserId) return -1;
      if (b.userId === viewerUserId && a.userId !== viewerUserId) return 1;
    }
    const activityDiff =
      countWorkerRowActivities(b, dates) - countWorkerRowActivities(a, dates);
    if (activityDiff !== 0) return activityDiff;
    return a.userName.localeCompare(b.userName, 'es');
  });
}

export function formatDashboardJobsHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/** Actividades del periodo con tramo asignado al operario y horas listas para firmar. */
export function getPeriodPendingSignatureActivitiesForUser(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  from: string,
  to: string,
): Activity[] {
  const pending: Activity[] = [];

  for (const activity of activities) {
    if (activity.date < from || activity.date > to) continue;

    const linkedEvent = findEventForActivity(activity, events);
    const status = getWorkerHoursStatus(activity, linkedEvent, userId);
    if (status.canSignNow) pending.push(activity);
  }

  return pending.sort((a, b) => a.date.localeCompare(b.date));
}

/** Actividades de hoy con tramo asignado al operario y horas aún sin firmar. */
export function getTodayPendingSignatureActivitiesForUser(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  today: string = format(new Date(), 'yyyy-MM-dd'),
): Activity[] {
  return getPeriodPendingSignatureActivitiesForUser(
    activities,
    events,
    userId,
    today,
    today,
  );
}
