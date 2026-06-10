import { addDays, isValid, parseISO } from 'date-fns';
import { hoursFromTimeRange } from './dateUtils.js';
import type { Activity, ActivityWorkerSignature, CalendarEvent } from './types.js';
import {
  inferShiftFromTime,
  resolveActivityScheduleFromTimes,
  type WorkspaceScheduleShiftBoundaries,
} from './workspaceScheduleSettings.js';
import type { ShiftCode } from './userSchedule.js';
import { isShiftCode } from './userSchedule.js';

export type ActivityAssigneeSlot = {
  userId: string;
  shift: ShiftCode;
  startTime: string;
  endTime: string;
  /** Firma del operario al confirmar las horas de su tramo. */
  workerSignature?: ActivityWorkerSignature;
};

export function hoursForAssigneeSlot(slot: Pick<ActivityAssigneeSlot, 'startTime' | 'endTime'>): number {
  return hoursFromTimeRange(slot.startTime, slot.endTime);
}

export function buildAssigneeSlotsFromLegacy(
  event: CalendarEvent | null | undefined,
  activity: Activity | null | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): ActivityAssigneeSlot[] {
  const userIds =
    event?.assignedTo?.length ? event.assignedTo : activity?.userId ? [activity.userId] : [];
  if (userIds.length === 0) return [];

  const startTime = event?.startTime ?? '09:00';
  const endTime = event?.endTime ?? '10:00';
  const shift =
    resolveActivityScheduleFromTimes(startTime, endTime, boundaries).shift ??
    inferShiftFromTime(startTime, boundaries) ??
    'M';

  return userIds.map((userId) => ({
    userId,
    shift,
    startTime,
    endTime,
  }));
}

function validAssigneeSlots(slots: ActivityAssigneeSlot[]): ActivityAssigneeSlot[] {
  return slots.filter(
    (slot) =>
      slot.userId &&
      isShiftCode(slot.shift) &&
      slot.startTime &&
      slot.endTime,
  );
}

export function normalizeActivityAssigneeSlots(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): ActivityAssigneeSlot[] {
  if (Array.isArray(activity.assigneeSlots)) {
    return validAssigneeSlots(activity.assigneeSlots);
  }
  return buildAssigneeSlotsFromLegacy(event, activity, boundaries);
}

export function getAssigneeIdsFromSlots(slots: ActivityAssigneeSlot[]): string[] {
  return slots.map((slot) => slot.userId);
}

export function totalHoursFromAssigneeSlots(slots: ActivityAssigneeSlot[]): number {
  return slots.reduce((sum, slot) => sum + hoursForAssigneeSlot(slot), 0);
}

function timeToMinutes(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map((part) => Number.parseInt(part, 10));
  if ([h, m].some((n) => Number.isNaN(n))) return null;
  return h * 60 + m;
}

/** Rango visual del evento de calendario que cubre todos los operarios. */
export function aggregateEventTimeRange(
  slots: ActivityAssigneeSlot[],
): { startTime: string; endTime: string } {
  if (slots.length === 0) return { startTime: '09:00', endTime: '10:00' };
  if (slots.length === 1) {
    return { startTime: slots[0]!.startTime, endTime: slots[0]!.endTime };
  }

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;

  for (const slot of slots) {
    const start = timeToMinutes(slot.startTime);
    const endRaw = timeToMinutes(slot.endTime);
    if (start == null || endRaw == null) continue;
    let end = endRaw;
    if (end <= start) end += 24 * 60;
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, end);
  }

  if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) {
    return { startTime: '09:00', endTime: '10:00' };
  }

  const startH = Math.floor(minStart / 60) % 24;
  const startM = minStart % 60;
  const endTotal = maxEnd >= 24 * 60 ? maxEnd - 24 * 60 : maxEnd;
  const endH = Math.floor(endTotal / 60) % 24;
  const endM = endTotal % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    startTime: `${pad(startH)}:${pad(startM)}`,
    endTime: `${pad(endH)}:${pad(endM)}`,
  };
}

export function isActivitySignedByWorker(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
): boolean {
  const slots = normalizeActivityAssigneeSlots(activity, event);
  if (
    slots.some(
      (slot) =>
        slot.userId === userId && Boolean(slot.workerSignature?.imageDataUrl?.trim()),
    )
  ) {
    return true;
  }

  const legacy = activity.workerSignature;
  if (!legacy?.imageDataUrl?.trim() || legacy.userId !== userId) return false;
  return slots.filter((slot) => slot.userId === userId).length <= 1;
}

export function getAssigneeSlotForUser(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): ActivityAssigneeSlot | null {
  const slots = normalizeActivityAssigneeSlots(activity, event, boundaries);
  return slots.find((slot) => slot.userId === userId) ?? null;
}

/** Fecha/hora en que termina el tramo del operario (activityDate + endTime; turnos nocturnos +1 día). */
export function getAssigneeSlotEndDateTime(
  activityDate: string,
  slot: Pick<ActivityAssigneeSlot, 'startTime' | 'endTime'>,
): Date | null {
  const dateStr = activityDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const end = parseISO(`${dateStr}T${slot.endTime}`);
  if (!isValid(end)) return null;

  const startM = timeToMinutes(slot.startTime);
  const endM = timeToMinutes(slot.endTime);
  if (startM != null && endM != null && endM <= startM) {
    return addDays(end, 1);
  }
  return end;
}

/** true cuando ya pasó la fecha y la hora de fin del tramo asignado al operario. */
export function isAssigneeSlotEnded(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  now: Date = new Date(),
): boolean {
  const slot = getAssigneeSlotForUser(activity, event, userId, boundaries);
  if (!slot) return false;

  const dateStr = event?.date ?? activity.date;
  if (!dateStr) return false;

  const end = getAssigneeSlotEndDateTime(dateStr, slot);
  if (!end) return false;

  return now.getTime() >= end.getTime();
}

/**
 * Horas del tramo del operario (turno), sin exigir firma.
 * Si varios operarios comparten la misma franja sin tramos propios, reparte activity.hours.
 */
export function workerSlotHoursOnActivity(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): number {
  const slots = normalizeActivityAssigneeSlots(activity, event, boundaries);
  const userSlots = slots.filter((slot) => slot.userId === userId);
  if (userSlots.length === 0) return 0;

  const userSlotHours = userSlots.reduce((sum, slot) => sum + hoursForAssigneeSlot(slot), 0);
  if (userSlotHours <= 0) return 0;

  const totalSlotHours = slots.reduce((sum, slot) => sum + hoursForAssigneeSlot(slot), 0);
  const activityHours = activity.hours ?? 0;
  if (activityHours <= 0 || totalSlotHours <= activityHours + 0.001) {
    return userSlotHours;
  }

  return Math.round(((activityHours * userSlotHours) / totalSlotHours) * 2) / 2;
}

function signedHoursFromSignature(
  signature: ActivityWorkerSignature,
  fallbackSlotHours: number,
): number {
  if (typeof signature.hours === 'number' && signature.hours > 0) {
    return signature.hours;
  }
  return fallbackSlotHours > 0 ? fallbackSlotHours : 0;
}

/**
 * Horas contabilizadas del operario: solo las declaradas en su firma (tramo confirmado).
 * Sin firma → 0. Firmas antiguas sin campo hours usan el tramo actual como respaldo.
 */
export function hoursForWorkerOnActivity(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): number {
  const slots = normalizeActivityAssigneeSlots(activity, event, boundaries);
  let total = 0;

  for (const slot of slots.filter((entry) => entry.userId === userId)) {
    const signature = slot.workerSignature;
    if (!signature?.imageDataUrl?.trim()) continue;
    total += signedHoursFromSignature(signature, hoursForAssigneeSlot(slot));
  }
  if (total > 0) return total;

  const legacy = activity.workerSignature;
  if (legacy?.userId === userId && legacy.imageDataUrl?.trim()) {
    return signedHoursFromSignature(
      legacy,
      workerSlotHoursOnActivity(activity, event, userId, boundaries),
    );
  }

  return 0;
}
