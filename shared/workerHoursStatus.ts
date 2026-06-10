import {
  hoursForWorkerOnActivity,
  isActivitySignedByWorker,
  isAssigneeSlotEnded,
  workerSlotHoursOnActivity,
} from './activityAssignees.js';
import type { WorkspaceScheduleShiftBoundaries } from './workspaceScheduleSettings.js';
import type { Activity, CalendarEvent } from './types.js';

export type WorkerHoursStatus = {
  assignedHours: number;
  signedHours: number;
  pendingHours: number;
  isSigned: boolean;
  /** Horas asignadas sin firmar (independiente de si ya puede firmar). */
  needsSignature: boolean;
  /** El tramo aún no ha llegado a su hora de fin. */
  awaitingSlotEnd: boolean;
  /** Puede firmar: pendiente, tramo finalizado y sin firma. */
  canSignNow: boolean;
};

export function getWorkerHoursStatus(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  now: Date = new Date(),
): WorkerHoursStatus {
  const assignedHours = workerSlotHoursOnActivity(activity, event, userId, boundaries);
  const signedHours = hoursForWorkerOnActivity(activity, event, userId, boundaries);
  const isSigned = isActivitySignedByWorker(activity, event, userId) && signedHours > 0;
  const pendingHours = Math.max(0, Math.round((assignedHours - signedHours) * 10) / 10);
  const needsSignature = assignedHours > 0 && !isSigned;
  const slotEnded = isAssigneeSlotEnded(activity, event, userId, boundaries, now);

  return {
    assignedHours,
    signedHours,
    pendingHours,
    isSigned,
    needsSignature,
    awaitingSlotEnd: needsSignature && !slotEnded,
    canSignNow: needsSignature && slotEnded,
  };
}

export function sumWorkerHoursStatuses(statuses: WorkerHoursStatus[]): {
  assignedHours: number;
  signedHours: number;
  pendingHours: number;
  pendingCount: number;
} {
  let assignedHours = 0;
  let signedHours = 0;
  let pendingCount = 0;

  for (const status of statuses) {
    assignedHours += status.assignedHours;
    signedHours += status.signedHours;
    if (status.canSignNow) pendingCount += 1;
  }

  return {
    assignedHours: Math.round(assignedHours * 10) / 10,
    signedHours: Math.round(signedHours * 10) / 10,
    pendingHours: Math.round(Math.max(0, assignedHours - signedHours) * 10) / 10,
    pendingCount,
  };
}
