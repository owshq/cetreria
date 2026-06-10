import {
  differenceInCalendarDays,
  formatDistanceStrict,
  parseISO,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { normalizeActivityAssigneeSlots } from './activityAssignees.js';
import { isActivitySigned, isActivitySignedByWorker } from './activitySignature.js';
import { getActivityAssigneeIds } from './scheduleActivityAssignees.js';
import type { Activity, ActivityAssigneeSlot, CalendarEvent, User } from './types.js';

export type ActivityOwnerUser = Pick<User, 'id' | 'role'> | null | undefined;

export function isActivityPast(
  options: {
    activity?: Activity | null;
    event?: CalendarEvent | null;
  } = {},
  now: Date = new Date(),
): boolean {
  const { activity, event } = options;

  if (event?.date) {
    if (event.endTime) {
      const end = parseISO(`${event.date}T${event.endTime}`);
      if (!Number.isNaN(end.getTime()) && end < now) return true;
    }
    return parseISO(event.date) < startOfDay(now);
  }

  if (activity?.date) {
    return parseISO(activity.date) < startOfDay(now);
  }

  return false;
}

/** Fecha/hora de referencia para mostrar cuánto hace que terminó la actividad. */
export function getActivityEndDate(
  options: {
    activity?: Activity | null;
    event?: CalendarEvent | null;
  } = {},
): Date | null {
  const { activity, event } = options;

  if (event?.date) {
    if (event.endTime) {
      const end = parseISO(`${event.date}T${event.endTime}`);
      if (!Number.isNaN(end.getTime())) return end;
    }
    const day = parseISO(event.date);
    if (!Number.isNaN(day.getTime())) return day;
  }

  if (activity?.date) {
    const day = parseISO(activity.date);
    if (!Number.isNaN(day.getTime())) return day;
  }

  return null;
}

/** Texto relativo legible: «hace 2 horas» o «falta 3 días». */
export function formatActivityRelativeTime(
  options: {
    activity?: Activity | null;
    event?: CalendarEvent | null;
  } = {},
  now: Date = new Date(),
): string | null {
  const { activity, event } = options;
  const past = isActivityPast(options, now);

  if (event?.date && (event.startTime || event.endTime)) {
    const time = past ? event.endTime ?? event.startTime : event.startTime ?? event.endTime;
    if (time) {
      const refDate = parseISO(`${event.date}T${time}`);
      if (!Number.isNaN(refDate.getTime())) {
        const distance = formatDistanceStrict(refDate, now, {
          locale: es,
          roundingMethod: 'round',
        });
        return refDate <= now ? `hace ${distance}` : `falta ${distance}`;
      }
    }
  }

  const dateStr = event?.date ?? activity?.date;
  if (!dateStr) return null;

  const day = startOfDay(parseISO(dateStr));
  if (Number.isNaN(day.getTime())) return null;

  const diffDays = differenceInCalendarDays(day, startOfDay(now));
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'mañana';
  if (diffDays === -1) return 'ayer';
  if (diffDays > 1) {
    if (diffDays < 30) return `falta ${diffDays} días`;
    const distance = formatDistanceStrict(day, now, { locale: es, roundingMethod: 'round' });
    return `falta ${distance}`;
  }

  const daysAgo = Math.abs(diffDays);
  if (daysAgo < 30) return `hace ${daysAgo} días`;

  const distance = formatDistanceStrict(day, now, { locale: es, roundingMethod: 'round' });
  return `hace ${distance}`;
}

/** Operarios: actividades propias, creadas o asignadas (slots, evento o userId). Admin: todas. */
export function canViewActivity(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
  },
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (options.activity.userId === user.id) return true;
  const event = options.event;
  if (event?.createdBy === user.id) return true;
  if (getActivityAssigneeIds(options.activity, event ?? null).includes(user.id)) return true;
  return false;
}

export function canViewCalendarEvent(
  user: ActivityOwnerUser,
  event: CalendarEvent,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (event.createdBy === user.id) return true;
  if (event.assignedTo.includes(user.id)) return true;
  return false;
}

export function canEditActivity(
  user: ActivityOwnerUser,
  options: {
    activity?: Activity | null;
    event?: CalendarEvent | null;
  } = {},
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (isActivityPast(options)) return false;
  if (options.activity?.userId === user.id) return true;
  if (options.event?.createdBy === user.id) return true;
  if (
    options.activity &&
    getActivityAssigneeIds(options.activity, options.event ?? null).includes(user.id)
  ) {
    return true;
  }
  return false;
}

/** Admin u operario asignado: editar inicio/fin de su tramo (no si ya firmo). */
export function canEditAssigneeSlotHours(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    targetUserId: string;
  },
): boolean {
  if (!user) return false;
  if (
    !canViewActivity(user, {
      activity: options.activity,
      event: options.event,
    })
  ) {
    return false;
  }
  if (
    isActivitySignedByWorker(
      options.activity,
      options.event ?? null,
      options.targetUserId,
    )
  ) {
    return false;
  }
  if (user.role === 'admin') return true;
  if (user.id !== options.targetUserId) return false;
  return getActivityAssigneeIds(options.activity, options.event ?? null).includes(user.id);
}

export function isAssigneeSlotScheduleOnlyUpdate(updates: Partial<Activity>): boolean {
  const keys = Object.keys(updates).filter(
    (key) => !['id', 'createdAt', 'workspaceId'].includes(key),
  );
  return keys.length > 0 && keys.every((key) => key === 'assigneeSlots' || key === 'hours');
}

function assigneeSlotScheduleChanged(
  before: ActivityAssigneeSlot,
  after: ActivityAssigneeSlot,
): boolean {
  return (
    before.shift !== after.shift ||
    before.startTime !== after.startTime ||
    before.endTime !== after.endTime
  );
}

/** PUT parcial: solo assigneeSlots/hours cuando el operario ajusta su tramo en actividad pasada. */
export function canUpdateActivityAssigneeSlotHours(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    nextAssigneeSlots: ActivityAssigneeSlot[];
  },
): boolean {
  const existing = normalizeActivityAssigneeSlots(options.activity, options.event ?? null);
  const existingByUser = new Map(existing.map((slot) => [slot.userId, slot]));
  const nextByUser = new Map(options.nextAssigneeSlots.map((slot) => [slot.userId, slot]));

  if (existingByUser.size !== nextByUser.size) return false;
  for (const userId of existingByUser.keys()) {
    if (!nextByUser.has(userId)) return false;
  }

  const changedUserIds = [...existingByUser.keys()].filter((userId) => {
    const before = existingByUser.get(userId)!;
    const after = nextByUser.get(userId)!;
    return assigneeSlotScheduleChanged(before, after);
  });

  if (changedUserIds.length === 0) return false;

  if (user?.role === 'admin') {
    return changedUserIds.every((userId) =>
      canEditAssigneeSlotHours(user, {
        activity: options.activity,
        event: options.event,
        targetUserId: userId,
      }),
    );
  }

  if (changedUserIds.length !== 1 || changedUserIds[0] !== user?.id) {
    return false;
  }

  return canEditAssigneeSlotHours(user, {
    activity: options.activity,
    event: options.event,
    targetUserId: user.id,
  });
}

/** Admin u operario asignado: vincular o crear albaran cuando la actividad ya finalizo. */
export function canManageFinishedActivityDocuments(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
  },
): boolean {
  if (!user) return false;
  if (!isActivityPast(options)) return false;
  if (!canViewActivity(user, options)) return false;
  if (user.role === 'admin') return true;
  return getActivityAssigneeIds(options.activity, options.event ?? null).includes(user.id);
}

/** Operario: solo la suya. Admin: cualquier firma de la actividad. */
export function canCancelWorkerSignature(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    targetUserId: string;
  },
): boolean {
  if (!user) return false;
  if (
    !isActivitySignedByWorker(options.activity, options.event ?? null, options.targetUserId)
  ) {
    return false;
  }
  if (user.role === 'admin') return true;
  if (user.id !== options.targetUserId) return false;
  return canEditActivity(user, options);
}

export function canCancelAllWorkerSignatures(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
  },
): boolean {
  if (user?.role !== 'admin') return false;
  return isActivitySigned(options.activity, options.event ?? null);
}
