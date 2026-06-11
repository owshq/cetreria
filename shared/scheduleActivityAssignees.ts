import type { Activity, CalendarEvent, Document } from './types.js';
import {
  getAssigneeIdsFromSlots,
  hoursForAssigneeSlot,
  hoursForWorkerOnActivity,
  normalizeActivityAssigneeSlots,
} from './activityAssignees.js';
import { isShiftCode, SHIFT_META, type ShiftCode } from './userSchedule.js';
import { getWorkerHoursStatus, sumWorkerHoursStatuses } from './workerHoursStatus.js';
import {
  inferShiftFromTime,
  resolveActivityScheduleFromTimes,
  type WorkspaceScheduleShiftBoundaries,
} from './workspaceScheduleSettings.js';

export type UserDayActivityEntry = {
  activity: Activity;
  shift: ShiftCode;
  startTime: string;
  endTime: string;
  hours: number;
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map((part) => Number.parseInt(part, 10));
  return h * 60 + m;
}

export function findEventForActivity(
  activity: Activity,
  events: readonly CalendarEvent[],
): CalendarEvent | undefined {
  return (
    events.find((event) => event.activityId === activity.id) ??
    events.find(
      (event) =>
        event.clientId === activity.clientId &&
        event.date === activity.date &&
        event.description === activity.description,
    )
  );
}

export function getActivityAssigneeIds(
  activity: Activity,
  event: CalendarEvent | null | undefined,
): string[] {
  if (Array.isArray(activity.assigneeSlots)) {
    const fromSlots = getAssigneeIdsFromSlots(
      activity.assigneeSlots.filter(
        (slot) =>
          Boolean(slot.userId) &&
          isShiftCode(slot.shift) &&
          Boolean(slot.startTime) &&
          Boolean(slot.endTime),
      ),
    );
    if (fromSlots.length > 0) return fromSlots;
  }

  const fromEvent = (event?.assignedTo ?? []).filter(Boolean);
  if (fromEvent.length > 0) return fromEvent;
  if (activity.userId) return [activity.userId];
  return [];
}

export function isUserAssignedToActivity(
  activity: Activity,
  events: readonly CalendarEvent[],
  userId: string,
): boolean {
  const event = findEventForActivity(activity, events as CalendarEvent[]);
  return getActivityAssigneeIds(activity, event).includes(userId);
}

/** Contactos con actividades asignadas al operario (como asignado en turno o evento). */
export function getAssignedClientIdsForUser(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  userId: string,
): string[] {
  const ids = new Set<string>();
  for (const activity of activities) {
    if (isUserAssignedToActivity(activity, events, userId)) {
      ids.add(activity.clientId);
    }
  }
  return [...ids];
}

/** Actividades en las que el operario está asignado. */
export function filterActivitiesAssignedToUser(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  userId: string,
): Activity[] {
  return activities.filter((activity) => isUserAssignedToActivity(activity, events, userId));
}

/** Documentos vinculados a un conjunto de actividades. */
export function filterDocumentsForActivities(
  documents: readonly Document[],
  activities: readonly Activity[],
): Document[] {
  const activityIds = new Set(activities.map((activity) => activity.id));
  return documents.filter(
    (document) => document.activityId && activityIds.has(document.activityId),
  );
}


export function listUserActivitiesOnDate(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  date: string,
): Activity[] {
  return activities.filter((activity) => {
    if (activity.date !== date) return false;
    return isUserAssignedToActivity(activity, events, userId);
  });
}

export function sumActivityHours(activities: Activity[]): number {
  return activities.reduce((total, activity) => total + (activity.hours ?? 0), 0);
}

/** Tramos del operario en un día (varias actividades y/o varios turnos el mismo día). */
export function listUserActivityEntriesOnDate(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  date: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): UserDayActivityEntry[] {
  const entries: UserDayActivityEntry[] = [];

  for (const activity of listUserActivitiesOnDate(activities, events, userId, date)) {
    const event = findEventForActivity(activity, events);
    const userSlots = normalizeActivityAssigneeSlots(activity, event, boundaries).filter(
      (slot) => slot.userId === userId,
    );

    if (userSlots.length > 0) {
      for (const slot of userSlots) {
        const hours = hoursForWorkerOnActivity(activity, event, userId, boundaries);
        if (hours <= 0) continue;
        entries.push({
          activity,
          shift: slot.shift,
          startTime: slot.startTime,
          endTime: slot.endTime,
          hours,
        });
      }
      continue;
    }

    const hours = hoursForWorkerOnActivity(activity, event, userId, boundaries);
    if (hours <= 0) continue;

    const startTime = event?.startTime ?? '09:00';
    const endTime = event?.endTime ?? '10:00';
    const shift =
      resolveActivityScheduleFromTimes(startTime, endTime, boundaries).shift ??
      inferShiftFromTime(startTime, boundaries) ??
      'M';

    entries.push({
      activity,
      shift,
      startTime,
      endTime,
      hours,
    });
  }

  entries.sort((a, b) => {
    const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    if (startDiff !== 0) return startDiff;
    return a.activity.description.localeCompare(b.activity.description, 'es');
  });

  return entries;
}

export function listUserActivityHoursOnDate(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  date: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): { count: number; hours: number } {
  const entries = listUserActivityEntriesOnDate(activities, events, userId, date, boundaries);
  const activityIds = new Set(entries.map((entry) => entry.activity.id));
  return {
    count: activityIds.size,
    hours: entries.reduce((sum, entry) => sum + entry.hours, 0),
  };
}

/** Horas firmadas del operario en un día (jornada laboral contabilizada). */
export function listUserSignedHoursOnDate(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  date: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): number {
  const assignedActivities = listUserActivitiesOnDate(activities, events, userId, date);
  if (assignedActivities.length === 0) return 0;
  return resolveDayWorkerHoursTotals(assignedActivities, events, userId, boundaries).signedHours;
}

export type UserDayShiftDisplay = {
  lockedByActivities: boolean;
  activityEntries: UserDayActivityEntry[];
  displayShifts: ShiftCode[];
  /** Horas de tramos de actividad asignados al operario ese día. */
  displayAssignedHours: number;
  /** Horas firmadas / contabilizadas del día. */
  displaySignedHours: number;
  /** Mostrar fracción firmadas/asignadas (solo cuando hay actividades reales). */
  showActivityHours: boolean;
  /** @deprecated Usar displayAssignedHours */
  displayHours: number;
};

function resolveDayWorkerHoursTotals(
  assignedActivities: Activity[],
  events: CalendarEvent[],
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries>,
): { assignedHours: number; signedHours: number } {
  const statuses = assignedActivities.map((activity) =>
    getWorkerHoursStatus(activity, findEventForActivity(activity, events), userId, boundaries),
  );
  const sum = sumWorkerHoursStatuses(statuses);
  return { assignedHours: sum.assignedHours, signedHours: sum.signedHours };
}

export function formatUserDayShiftHoursCompact(
  display: Pick<UserDayShiftDisplay, 'displaySignedHours' | 'displayAssignedHours'>,
): string {
  return `${display.displaySignedHours}/${display.displayAssignedHours} h`;
}

export function formatUserDayShiftHoursTitle(
  display: Pick<UserDayShiftDisplay, 'displaySignedHours' | 'displayAssignedHours'>,
): string {
  return `${display.displaySignedHours} h firmadas / ${display.displayAssignedHours} h en actividades asignadas`;
}

function inferAssignedActivityShifts(
  assignedActivities: Activity[],
  events: CalendarEvent[],
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries>,
): ShiftCode[] {
  const shiftSet = new Set<ShiftCode>();

  for (const activity of assignedActivities) {
    const event = findEventForActivity(activity, events);
    const slots = normalizeActivityAssigneeSlots(activity, event, boundaries).filter(
      (slot) => slot.userId === userId && isShiftCode(slot.shift),
    );

    if (slots.length > 0) {
      for (const slot of slots) {
        shiftSet.add(slot.shift);
      }
      continue;
    }

    const startTime = event?.startTime ?? '09:00';
    const endTime = event?.endTime ?? '10:00';
    const shift =
      resolveActivityScheduleFromTimes(startTime, endTime, boundaries).shift ??
      inferShiftFromTime(startTime, boundaries) ??
      'M';
    shiftSet.add(shift);
  }

  return [...shiftSet];
}

/** Estado visual y de edición del turno de un día (planificado vs actividades asignadas). */
export function resolveUserDayShiftDisplay(
  activities: Activity[],
  events: CalendarEvent[],
  userId: string,
  date: string,
  plannedShift: ShiftCode | null | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): UserDayShiftDisplay {
  const assignedActivities = listUserActivitiesOnDate(activities, events, userId, date);
  const activityEntries = listUserActivityEntriesOnDate(
    activities,
    events,
    userId,
    date,
    boundaries,
  );
  const lockedByActivities = assignedActivities.length > 0;

  if (lockedByActivities) {
    const { assignedHours, signedHours } = resolveDayWorkerHoursTotals(
      assignedActivities,
      events,
      userId,
      boundaries,
    );
    const inferredShifts = inferAssignedActivityShifts(
      assignedActivities,
      events,
      userId,
      boundaries,
    );
    const entryShifts = activityEntries.map((entry) => entry.shift);
    const displayShifts = [
      ...new Set([...inferredShifts, ...entryShifts]),
    ] as ShiftCode[];

    return {
      lockedByActivities,
      activityEntries,
      displayShifts:
        displayShifts.length > 0 ? displayShifts : plannedShift ? [plannedShift] : [],
      displayAssignedHours: assignedHours,
      displaySignedHours: signedHours,
      showActivityHours: true,
      displayHours: assignedHours,
    };
  }

  return {
    lockedByActivities: false,
    activityEntries,
    displayShifts: plannedShift ? [plannedShift] : [],
    displayAssignedHours: 0,
    displaySignedHours: 0,
    showActivityHours: false,
    displayHours: 0,
  };
}

export const USER_DAY_SHIFT_LOCKED_MESSAGE =
  'Este día tiene actividades asignadas. Elimina o modifica la actividad para cambiar el turno.';
