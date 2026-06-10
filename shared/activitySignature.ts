import {
  isAssigneeSlotEnded,
  normalizeActivityAssigneeSlots,
  workerSlotHoursOnActivity,
  type ActivityAssigneeSlot,
} from './activityAssignees.js';
import type { Activity, ActivityWorkerSignature, CalendarEvent, User } from './types.js';

export { isActivitySignedByWorker } from './activityAssignees.js';

export function isActivitySigned(
  activity: Pick<Activity, 'workerSignature' | 'assigneeSlots'>,
  event?: CalendarEvent | null,
): boolean {
  const slots = normalizeActivityAssigneeSlots(activity as Activity, event ?? null);
  if (slots.some((slot) => Boolean(slot.workerSignature?.imageDataUrl?.trim()))) {
    return true;
  }
  return Boolean(activity.workerSignature?.imageDataUrl?.trim());
}

export function buildActivityWorkerSignature(
  user: Pick<User, 'id' | 'name' | 'signatureDataUrl'>,
  confirmedHours: number,
): ActivityWorkerSignature | undefined {
  const imageDataUrl = user.signatureDataUrl?.trim();
  if (!imageDataUrl || confirmedHours <= 0) return undefined;
  return {
    userId: user.id,
    userName: user.name.trim() || 'Usuario',
    imageDataUrl,
    signedAt: new Date().toISOString(),
    hours: Math.round(confirmedHours * 60) / 60,
  };
}

/**
 * Firma la actividad para el usuario actual si tiene tramo con horas registradas.
 * Con varios operarios, la firma se guarda en su assigneeSlot.
 */
export function applyWorkerSignatureFromUser<T extends Activity>(
  activity: T,
  user: Pick<User, 'id' | 'name' | 'signatureDataUrl'>,
  event?: CalendarEvent | null,
  confirmedHours?: number,
): T {
  const slots = normalizeActivityAssigneeSlots(activity, event ?? null);
  const existingSlot = slots.find((slot) => slot.userId === user.id);
  if (existingSlot?.workerSignature?.imageDataUrl?.trim()) {
    return activity;
  }

  if (!isAssigneeSlotEnded(activity, event ?? null, user.id)) {
    return activity;
  }

  const slotHours = workerSlotHoursOnActivity(activity, event ?? null, user.id);
  const hoursToConfirm =
    typeof confirmedHours === 'number' && confirmedHours > 0
      ? Math.round(confirmedHours * 60) / 60
      : slotHours;
  if (hoursToConfirm <= 0) return activity;

  const signature = buildActivityWorkerSignature(user, hoursToConfirm);
  if (!signature) return activity;
  if (slots.length > 0) {
    const updatedSlots = slots.map((slot) =>
      slot.userId === user.id ? { ...slot, workerSignature: signature } : slot,
    );
    return { ...activity, assigneeSlots: updatedSlots };
  }

  return { ...activity, workerSignature: signature };
}

export function stripWorkerSignatureFromSlots(
  slots: ActivityAssigneeSlot[],
  userId?: string,
): ActivityAssigneeSlot[] {
  return slots.map((slot) => {
    if (userId != null && slot.userId !== userId) return slot;
    if (!slot.workerSignature) return slot;
    const { workerSignature: _removed, ...rest } = slot;
    return rest;
  });
}

/** Payload para quitar la firma de un operario (slots y firma legacy si aplica). */
export function activityUpdatesCancelWorkerSignature(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
): Partial<Activity> {
  const slots = normalizeActivityAssigneeSlots(activity, event ?? null);
  const updates: Partial<Activity> = {};
  if (slots.length > 0) {
    updates.assigneeSlots = stripWorkerSignatureFromSlots(slots, userId);
  }
  if (activity.workerSignature?.userId === userId) {
    updates.workerSignature = null as unknown as Activity['workerSignature'];
  }
  return updates;
}

/** Payload para quitar todas las firmas de la actividad. */
export function activityUpdatesCancelAllWorkerSignatures(
  activity: Activity,
  event: CalendarEvent | null | undefined,
): Partial<Activity> {
  const slots = normalizeActivityAssigneeSlots(activity, event ?? null);
  const updates: Partial<Activity> = {};
  if (slots.length > 0) {
    updates.assigneeSlots = stripWorkerSignatureFromSlots(slots);
  }
  if (activity.workerSignature?.imageDataUrl?.trim()) {
    updates.workerSignature = null as unknown as Activity['workerSignature'];
  }
  return updates;
}
