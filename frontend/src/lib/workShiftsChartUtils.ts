import type {
  Activity,
  ActivityAssigneeSlot,
  ActivityType,
  CalendarEvent,
  Document,
  ShiftCode,
  UserAssignee,
} from '@shared/types';
import {
  findEventForActivity,
  getActivityTypeLabel,
  hoursForAssigneeSlot,
  isDateInRange,
  normalizeActivityAssigneeSlots,
  SHIFT_META,
} from '@shared/types';
import type { TypeBucket } from '@/components/clientCharts/utils';
import { truncateLabel } from '@/components/clientCharts/utils';
import { applyChartPalette } from '@/lib/chartColorPalette';
import { buildShiftColorMap, getShiftPaletteColor } from '@/lib/shiftColorPalette';

export type WorkShiftsGroupBy = 'team' | 'shift' | 'type';
export type WorkShiftsValueMeasure = 'hours' | 'hoursSigned' | 'hoursAssigned' | 'income';

export function isWorkShiftsHoursMeasure(
  valueMeasure: WorkShiftsValueMeasure,
): valueMeasure is 'hours' | 'hoursSigned' | 'hoursAssigned' {
  return (
    valueMeasure === 'hours' ||
    valueMeasure === 'hoursSigned' ||
    valueMeasure === 'hoursAssigned'
  );
}

export const WORK_SHIFT_STACK_CODES = ['M', 'T', 'N', 'L', 'V'] as const satisfies readonly ShiftCode[];

export type WorkShiftsStackedBarRow = {
  typeId: string;
  label: string;
  shortName: string;
  total: number;
  /** Suma de horas firmadas (solo relevante en medida híbrida «Horas»). */
  signedTotal: number;
  segments: Partial<Record<ShiftCode, number>>;
  /** Horas firmadas por turno (medida híbrida «Horas»). */
  signedSegments: Partial<Record<ShiftCode, number>>;
};

function emptyShiftSegments(): Record<ShiftCode, number> {
  return { M: 0, T: 0, N: 0, L: 0, V: 0 };
}

type SlottedActivity = {
  activity: Activity;
  slots: ActivityAssigneeSlot[];
};

function collectSlottedActivities(
  activities: Activity[],
  events: CalendarEvent[],
  from: string,
  to: string,
): SlottedActivity[] {
  const items: SlottedActivity[] = [];

  for (const activity of activities) {
    if (activity.date < from || activity.date > to) continue;
    const event = findEventForActivity(activity, events);
    const slots = normalizeActivityAssigneeSlots(activity, event);
    if (slots.length === 0) continue;
    items.push({ activity, slots });
  }

  return items;
}

function distributeIncomeAcrossSlots(
  total: number,
  slots: ActivityAssigneeSlot[],
  assign: (slot: ActivityAssigneeSlot, amount: number) => void,
): void {
  const slotHours = slots.map((slot) => hoursForAssigneeSlot(slot));
  const hoursTotal = slotHours.reduce((sum, hours) => sum + hours, 0);

  if (hoursTotal <= 0) {
    const share = total / slots.length;
    for (const slot of slots) assign(slot, share);
    return;
  }

  for (let index = 0; index < slots.length; index += 1) {
    assign(slots[index]!, total * (slotHours[index]! / hoursTotal));
  }
}

function bucketColor(
  groupBy: WorkShiftsGroupBy,
  key: string,
  activityTypes: ActivityType[],
): string {
  if (groupBy === 'shift') {
    return getShiftPaletteColor(key as ShiftCode, buildShiftColorMap());
  }
  if (groupBy === 'type') {
    return activityTypes.find((type) => type.id === key)?.color ?? '#a3a3a3';
  }
  return '#a3a3a3';
}

function bucketLabel(
  groupBy: WorkShiftsGroupBy,
  key: string,
  assigneesById: Map<string, UserAssignee>,
  activityTypes: ActivityType[],
): string {
  if (groupBy === 'team') return assigneesById.get(key)?.name ?? 'Operario';
  if (groupBy === 'shift') return SHIFT_META[key as ShiftCode]?.label ?? key;
  return getActivityTypeLabel(key, activityTypes);
}

function groupKeyForSlot(
  groupBy: WorkShiftsGroupBy,
  slot: ActivityAssigneeSlot,
  activity: Activity,
): string {
  if (groupBy === 'team') return slot.userId;
  if (groupBy === 'shift') return slot.shift;
  return activity.type;
}

function roundChartHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

function assignedHoursForSlot(
  activity: Activity,
  slot: ActivityAssigneeSlot,
  slots: ActivityAssigneeSlot[],
): number {
  const slotHours = hoursForAssigneeSlot(slot);
  if (slotHours <= 0) return 0;

  const totalSlotHours = slots.reduce((sum, entry) => sum + hoursForAssigneeSlot(entry), 0);
  const activityHours = activity.hours ?? 0;
  if (activityHours <= 0 || totalSlotHours <= activityHours + 0.001) {
    return slotHours;
  }

  return roundChartHours((activityHours * slotHours) / totalSlotHours);
}

function signedHoursFromSignature(
  signature: ActivityAssigneeSlot['workerSignature'],
  fallbackSlotHours: number,
): number {
  if (!signature?.imageDataUrl?.trim()) return 0;
  if (typeof signature.hours === 'number' && signature.hours > 0) {
    return signature.hours;
  }
  return fallbackSlotHours > 0 ? fallbackSlotHours : 0;
}

function signedHoursForSlot(
  activity: Activity,
  slot: ActivityAssigneeSlot,
  slots: ActivityAssigneeSlot[],
): number {
  const slotSigned = signedHoursFromSignature(slot.workerSignature, hoursForAssigneeSlot(slot));
  if (slotSigned > 0) return slotSigned;

  const legacy = activity.workerSignature;
  if (!legacy?.imageDataUrl?.trim() || legacy.userId !== slot.userId) return 0;

  const userSlots = slots.filter((entry) => entry.userId === slot.userId);
  const anySlotSigned = userSlots.some((entry) =>
    Boolean(entry.workerSignature?.imageDataUrl?.trim()),
  );
  if (anySlotSigned) return 0;

  if (userSlots.length <= 1) {
    return signedHoursFromSignature(legacy, assignedHoursForSlot(activity, slot, slots));
  }

  return 0;
}

function slotHoursForMeasure(
  valueMeasure: WorkShiftsValueMeasure,
  activity: Activity,
  slot: ActivityAssigneeSlot,
  slots: ActivityAssigneeSlot[],
): { assigned: number; signed: number; chartValue: number } {
  const assigned = assignedHoursForSlot(activity, slot, slots);
  const signed = signedHoursForSlot(activity, slot, slots);

  if (valueMeasure === 'hoursSigned') {
    return { assigned, signed, chartValue: signed };
  }
  if (valueMeasure === 'hoursAssigned') {
    return { assigned, signed, chartValue: assigned };
  }
  if (valueMeasure === 'hours') {
    return { assigned, signed, chartValue: assigned };
  }

  return { assigned, signed, chartValue: 0 };
}

function rowLabelForKey(
  groupBy: WorkShiftsGroupBy,
  key: string,
  assigneesById: Map<string, UserAssignee>,
  activityTypes: ActivityType[],
): string {
  return bucketLabel(groupBy, key, assigneesById, activityTypes);
}

export function buildWorkShiftsStackedChartRows(
  groupBy: WorkShiftsGroupBy,
  valueMeasure: WorkShiftsValueMeasure,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): WorkShiftsStackedBarRow[] {
  if (groupBy === 'shift') return [];

  const assigneesById = new Map(assignees.map((user) => [user.id, user]));
  const slottedActivities = collectSlottedActivities(activities, events, from, to);
  const rows = new Map<string, Record<ShiftCode, number>>();
  const signedRows = new Map<string, Record<ShiftCode, number>>();

  const addValue = (
    groupKey: string,
    shift: ShiftCode,
    assigned: number,
    signed: number,
    chartValue: number,
  ) => {
    if (chartValue <= 0) return;
    const segments = rows.get(groupKey) ?? emptyShiftSegments();
    segments[shift] = (segments[shift] ?? 0) + chartValue;
    rows.set(groupKey, segments);

    if (valueMeasure === 'hours' && signed > 0) {
      const signedSegments = signedRows.get(groupKey) ?? emptyShiftSegments();
      signedSegments[shift] = (signedSegments[shift] ?? 0) + signed;
      signedRows.set(groupKey, signedSegments);
    }
  };

  if (isWorkShiftsHoursMeasure(valueMeasure)) {
    for (const { activity, slots } of slottedActivities) {
      for (const slot of slots) {
        const { assigned, signed, chartValue } = slotHoursForMeasure(
          valueMeasure,
          activity,
          slot,
          slots,
        );
        if (chartValue <= 0) continue;
        addValue(
          groupKeyForSlot(groupBy, slot, activity),
          slot.shift,
          assigned,
          signed,
          chartValue,
        );
      }
    }
  } else {
    const activityById = new Map(slottedActivities.map(({ activity }) => [activity.id, activity]));
    const slotsByActivityId = new Map(
      slottedActivities.map(({ activity, slots }) => [activity.id, slots]),
    );

    for (const document of documents) {
      if (!isDateInRange(document.date, from, to)) continue;
      if (!document.activityId) continue;

      const activity = activityById.get(document.activityId);
      const slots = slotsByActivityId.get(document.activityId);
      if (!activity || !slots?.length) continue;

      distributeIncomeAcrossSlots(document.total, slots, (slot, amount) => {
        if (amount <= 0) return;
        addValue(groupKeyForSlot(groupBy, slot, activity), slot.shift, amount);
      });
    }
  }

  return [...rows.entries()]
    .map(([typeId, segments]) => {
      const signedSegments = signedRows.get(typeId) ?? emptyShiftSegments();
      const total = WORK_SHIFT_STACK_CODES.reduce(
        (sum, shift) => sum + (segments[shift] ?? 0),
        0,
      );
      const signedTotal = WORK_SHIFT_STACK_CODES.reduce(
        (sum, shift) => sum + (signedSegments[shift] ?? 0),
        0,
      );
      const label = rowLabelForKey(groupBy, typeId, assigneesById, activityTypes);
      return {
        typeId,
        label,
        shortName: truncateLabel(label),
        total,
        signedTotal,
        segments,
        signedSegments,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function getActiveWorkShiftStackCodes(
  rows: WorkShiftsStackedBarRow[],
): ShiftCode[] {
  return WORK_SHIFT_STACK_CODES.filter((shift) =>
    rows.some((row) => (row.segments[shift] ?? 0) > 0),
  );
}

/** Topmost non-zero shift segment for a stacked bar row (visual stack order). */
export function getTopShiftForStackRow(
  row: Record<string, string | number>,
): ShiftCode | null {
  for (let index = WORK_SHIFT_STACK_CODES.length - 1; index >= 0; index -= 1) {
    const shift = WORK_SHIFT_STACK_CODES[index]!;
    if (Number(row[shift] ?? 0) > 0) return shift;
  }
  return null;
}

export function toRechartsStackedRow(
  row: WorkShiftsStackedBarRow,
  valueMeasure: WorkShiftsValueMeasure,
): Record<string, string | number> {
  const chartRow: Record<string, string | number> = {
    typeId: row.typeId,
    label: row.label,
    shortName: row.shortName,
    total: row.total,
    signedTotal: row.signedTotal,
  };

  for (const shift of WORK_SHIFT_STACK_CODES) {
    const assigned = row.segments[shift] ?? 0;
    if (valueMeasure === 'hours') {
      const signed = row.signedSegments[shift] ?? 0;
      chartRow[`${shift}_signed`] = signed;
      chartRow[`${shift}_pending`] = Math.max(0, assigned - signed);
    }
    chartRow[shift] = assigned;
  }

  return chartRow;
}

export function buildWorkShiftsChartBuckets(
  groupBy: WorkShiftsGroupBy,
  valueMeasure: WorkShiftsValueMeasure,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): TypeBucket[] {
  const assigneesById = new Map(assignees.map((user) => [user.id, user]));
  const slottedActivities = collectSlottedActivities(activities, events, from, to);
  const values = new Map<string, number>();
  const signedValues = new Map<string, number>();

  if (isWorkShiftsHoursMeasure(valueMeasure)) {
    for (const { activity, slots } of slottedActivities) {
      for (const slot of slots) {
        const { signed, chartValue } = slotHoursForMeasure(
          valueMeasure,
          activity,
          slot,
          slots,
        );
        if (chartValue <= 0) continue;
        const key = groupKeyForSlot(groupBy, slot, activity);
        values.set(key, (values.get(key) ?? 0) + chartValue);
        if (valueMeasure === 'hours' && signed > 0) {
          signedValues.set(key, (signedValues.get(key) ?? 0) + signed);
        }
      }
    }
  } else {
    const activityById = new Map(slottedActivities.map(({ activity }) => [activity.id, activity]));
    const slotsByActivityId = new Map(
      slottedActivities.map(({ activity, slots }) => [activity.id, slots]),
    );

    for (const document of documents) {
      if (!isDateInRange(document.date, from, to)) continue;
      if (!document.activityId) continue;

      const activity = activityById.get(document.activityId);
      const slots = slotsByActivityId.get(document.activityId);
      if (!activity || !slots?.length) continue;

      distributeIncomeAcrossSlots(document.total, slots, (slot, amount) => {
        if (amount <= 0) return;
        const key = groupKeyForSlot(groupBy, slot, activity);
        values.set(key, (values.get(key) ?? 0) + amount);
      });
    }
  }

  const items = [...values.entries()]
    .filter(([, value]) => value > 0)
    .map(([key, hours]) => ({
      typeId: key,
      label: bucketLabel(groupBy, key, assigneesById, activityTypes),
      hours,
      signedHours: valueMeasure === 'hours' ? (signedValues.get(key) ?? 0) : undefined,
      color: bucketColor(groupBy, key, activityTypes),
    }))
    .sort((a, b) => b.hours - a.hours);

  if (groupBy === 'shift') return items;

  return applyChartPalette(items);
}

export function hasWorkShiftsChartData(
  groupBy: WorkShiftsGroupBy,
  valueMeasure: WorkShiftsValueMeasure,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): boolean {
  return (
    buildWorkShiftsChartBuckets(
      groupBy,
      valueMeasure,
      activities,
      events,
      assignees,
      documents,
      activityTypes,
      from,
      to,
    ).reduce((sum, bucket) => sum + bucket.hours, 0) > 0
  );
}

export function hasAnyWorkShiftsChartData(
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  documents: Document[],
  activityTypes: ActivityType[],
  from: string,
  to: string,
): boolean {
  const dimensions: WorkShiftsGroupBy[] = ['team', 'shift', 'type'];
  const measures: WorkShiftsValueMeasure[] = [
    'hours',
    'hoursSigned',
    'hoursAssigned',
    'income',
  ];

  return dimensions.some((groupBy) =>
    measures.some((valueMeasure) =>
      hasWorkShiftsChartData(
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
    ),
  );
}
