import type { Activity, CalendarEvent, DocumentLineItem } from './types.js';
import { formatHoursMinutes } from './formatHoursMinutes.js';
import { getLineItemConceptText } from './documentConcepts.js';
import { normalizeDocumentLineItem } from './documents.js';
import { getActivityAssigneeIds } from './scheduleActivityAssignees.js';
import { getWorkerHoursStatus } from './workerHoursStatus.js';
import type { WorkspaceScheduleShiftBoundaries } from './workspaceScheduleSettings.js';
import {
  canEditActivity,
  canManageFinishedActivityDocuments,
  canViewActivity,
  isActivityPast,
  type ActivityOwnerUser,
} from './activityPermissions.js';

export type ActivityWorkReportStatus = 'draft' | 'submitted';

/** Parte de trabajo cerrado por un operario (horas reales + notas). */
export interface ActivityWorkReport {
  userId: string;
  userName: string;
  status: ActivityWorkReportStatus;
  /** Minutos trabajados confirmados en el parte. */
  workedMinutes: number;
  notes?: string;
  submittedAt?: string;
  updatedAt: string;
}

export function workedMinutesToHours(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function hoursMinutesToWorkedMinutes(hours: number, minutes: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return h * 60 + Math.min(59, m);
}

function hoursToWorkedMinutes(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.round(hours * 60);
}

/** true cuando la actividad tiene mas de un operario asignado. */
export function hasMultipleWorkReportAssignees(
  activity: Activity,
  event?: CalendarEvent | null,
): boolean {
  return getActivityAssigneeIds(activity, event ?? null).length > 1;
}

/**
 * Minutos sugeridos al abrir el informe de trabajo.
 * Un operario: horas de la actividad. Varios: horas dedicadas del tramo del operario.
 */
export function getDefaultWorkReportWorkedMinutes(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): number {
  if (!hasMultipleWorkReportAssignees(activity, event)) {
    return hoursToWorkedMinutes(activity.hours ?? 0);
  }

  const { assignedHours } = getWorkerHoursStatus(activity, event, userId, boundaries);
  return hoursToWorkedMinutes(assignedHours);
}

export function parseWorkedMinutesInput(value: unknown): number | null {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.floor(minutes);
}

export function normalizeWorkReportNotes(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getActivityWorkReports(activity: Activity): ActivityWorkReport[] {
  return Array.isArray(activity.workReports) ? activity.workReports : [];
}

export function getActivityWorkReport(
  activity: Activity,
  userId: string,
): ActivityWorkReport | null {
  return getActivityWorkReports(activity).find((report) => report.userId === userId) ?? null;
}

export function getPrimaryWorkReportUserId(
  activity: Activity,
  event?: CalendarEvent | null,
): string | null {
  const reports = getActivityWorkReports(activity);
  const submitted = reports.find((report) => report.status === 'submitted');
  if (submitted) return submitted.userId;
  if (activity.userId) return activity.userId;
  const assignees = getActivityAssigneeIds(activity, event ?? null);
  return assignees[0] ?? null;
}

export type ActivityWorkReportSurfaceStatus = 'none' | 'draft' | 'submitted';

export function getActivityWorkReportSurfaceStatus(
  activity: Activity,
  userId?: string | null,
): ActivityWorkReportSurfaceStatus {
  const reports = getActivityWorkReports(activity);
  if (userId) {
    const report = reports.find((entry) => entry.userId === userId);
    if (!report) return 'none';
    return report.status === 'submitted' ? 'submitted' : 'draft';
  }
  if (reports.some((report) => report.status === 'submitted')) return 'submitted';
  if (reports.some((report) => report.status === 'draft')) return 'draft';
  return 'none';
}

export function getActivityReportedMinutes(
  activity: Activity,
  userId?: string | null,
): number {
  const reports = getActivityWorkReports(activity).filter(
    (report) => report.status === 'submitted' && report.workedMinutes > 0,
  );
  if (userId) {
    return reports.find((report) => report.userId === userId)?.workedMinutes ?? 0;
  }
  return reports.reduce((sum, report) => sum + report.workedMinutes, 0);
}

export function getActivityReportedHours(
  activity: Activity,
  userId?: string | null,
): number {
  return workedMinutesToHours(getActivityReportedMinutes(activity, userId));
}

function isActivityParticipant(
  user: ActivityOwnerUser,
  activity: Activity,
  event?: CalendarEvent | null,
): boolean {
  if (!user) return false;
  if (activity.userId === user.id) return true;
  if (event?.createdBy === user.id) return true;
  return getActivityAssigneeIds(activity, event ?? null).includes(user.id);
}

/** Puede enviar o actualizar el parte aunque la actividad ya sea pasada. */
export function canSubmitActivityWorkReport(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
  },
  now: Date = new Date(),
): boolean {
  if (!user) return false;
  if (!canViewActivity(user, options)) return false;
  if (user.role === 'admin') return true;
  if (!isActivityParticipant(user, options.activity, options.event)) return false;
  return isActivityPast(options, now);
}

/** Operario: solo su parte no enviada; admin: cualquier parte. */
export function canEditActivityWorkReport(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    targetUserId: string;
  },
): boolean {
  if (!user) return false;
  if (!canSubmitActivityWorkReport(user, options)) return false;
  if (user.role === 'admin') return true;
  if (user.id !== options.targetUserId) return false;
  const existing = getActivityWorkReport(options.activity, user.id);
  return !existing || existing.status !== 'submitted';
}

export function buildActivityWorkReportPayload(input: {
  user: Pick<{ id: string; name: string }, 'id' | 'name'>;
  workedMinutes: number;
  notes?: string;
  status: ActivityWorkReportStatus;
  existing?: ActivityWorkReport | null;
  now?: Date;
}): ActivityWorkReport {
  const nowIso = (input.now ?? new Date()).toISOString();
  const submittedAt =
    input.status === 'submitted'
      ? input.existing?.status === 'submitted'
        ? input.existing.submittedAt ?? nowIso
        : nowIso
      : undefined;

  return {
    userId: input.user.id,
    userName: input.user.name.trim() || 'Usuario',
    status: input.status,
    workedMinutes: input.workedMinutes,
    notes: input.notes,
    submittedAt,
    updatedAt: nowIso,
  };
}

export function upsertActivityWorkReport(
  activity: Activity,
  report: ActivityWorkReport,
): Activity {
  const reports = getActivityWorkReports(activity).filter((entry) => entry.userId !== report.userId);
  return { ...activity, workReports: [...reports, report] };
}

export function removeActivityWorkReport(activity: Activity, userId: string): Activity {
  const reports = getActivityWorkReports(activity).filter((entry) => entry.userId !== userId);
  return { ...activity, workReports: reports.length > 0 ? reports : undefined };
}

export function getSubmittedActivityWorkReports(activity: Activity): ActivityWorkReport[] {
  return getActivityWorkReports(activity).filter(
    (report) => report.status === 'submitted' && report.workedMinutes > 0,
  );
}

export function isSubmittedActivityWorkReport(
  activity: Activity,
  userId: string,
): boolean {
  const report = getActivityWorkReport(activity, userId);
  return report?.status === 'submitted' && report.workedMinutes > 0;
}

export function getPendingWorkReportAssigneeIds(
  activity: Activity,
  event?: CalendarEvent | null,
): string[] {
  return getActivityAssigneeIds(activity, event ?? null).filter(
    (userId) => !isSubmittedActivityWorkReport(activity, userId),
  );
}

/** Todos los operarios asignados han enviado informe con horas reales. */
export function allAssigneesSubmittedWorkReports(
  activity: Activity,
  event?: CalendarEvent | null,
): boolean {
  const assignees = getActivityAssigneeIds(activity, event ?? null);
  if (assignees.length === 0) return false;
  return assignees.every((userId) => isSubmittedActivityWorkReport(activity, userId));
}

export type WorkReportExtraItemInput = {
  name?: unknown;
  description?: unknown;
  quantity?: unknown;
  price?: unknown;
};

export function getActivityWorkReportExtraItems(activity: Activity): DocumentLineItem[] {
  if (!Array.isArray(activity.workReportExtraItems)) return [];
  return activity.workReportExtraItems.map(normalizeDocumentLineItem);
}

export function parseWorkReportExtraItemsInput(value: unknown): DocumentLineItem[] | null {
  if (!Array.isArray(value)) return null;
  const items: DocumentLineItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as WorkReportExtraItemInput;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const description = typeof raw.description === 'string' ? raw.description.trim() : '';
    const concept = name || description;
    if (!concept) return null;
    const quantityRaw = typeof raw.quantity === 'number' ? raw.quantity : Number(raw.quantity);
    const priceRaw = typeof raw.price === 'number' ? raw.price : Number(raw.price);
    if (!Number.isFinite(quantityRaw) || quantityRaw <= 0) return null;
    if (!Number.isFinite(priceRaw) || priceRaw < 0) return null;
    items.push(
      normalizeDocumentLineItem({
        name: name || concept,
        description,
        quantity: quantityRaw,
        price: priceRaw,
      }),
    );
  }
  return items;
}

/** Admin u operario con permiso de documentos en actividad finalizada. */
export function canEditActivityWorkReportExtraItems(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
  },
): boolean {
  if (!user) return false;
  if (!canViewActivity(user, options)) return false;
  if (user.role === 'admin') return true;
  if (canEditActivity(user, options)) return true;
  return canManageFinishedActivityDocuments(user, options);
}

export function buildActivityDeliveryNoteItemsFromWorkReports(
  activity: Activity,
  serviceLabel: string,
): DocumentLineItem[] {
  const label = serviceLabel.trim() || activity.description.trim() || 'Servicio';
  return getSubmittedActivityWorkReports(activity)
    .slice()
    .sort((left, right) => left.userName.localeCompare(right.userName, 'es'))
    .map((report) => {
      const hours = workedMinutesToHours(report.workedMinutes);
      const timeLabel = formatHoursMinutes(hours) ?? `${hours}h`;
      const noteSuffix = report.notes?.trim() ? ` — ${report.notes.trim()}` : '';
      return {
        name: label,
        description: `${report.userName}: ${timeLabel}${noteSuffix}`,
        quantity: hours,
        price: 0,
      };
    });
}

export function buildActivityDeliveryNoteItems(
  activity: Activity,
  serviceLabel: string,
): DocumentLineItem[] {
  const hourItems = buildActivityDeliveryNoteItemsFromWorkReports(activity, serviceLabel);
  const extraItems = getActivityWorkReportExtraItems(activity).filter((item) =>
    Boolean(getLineItemConceptText(item)),
  );
  return [...hourItems, ...extraItems];
}
