import type { Activity, CalendarEvent, Document, DocumentLineItem } from './types.js';
import { formatHoursMinutes } from './formatHoursMinutes.js';
import { getLineItemConceptText } from './documentConcepts.js';
import { normalizeDocumentLineItem } from './documents.js';
import { getActivityAssigneeIds } from './scheduleActivityAssignees.js';
import { getWorkerHoursStatus } from './workerHoursStatus.js';
import type { WorkspaceScheduleShiftBoundaries } from './workspaceScheduleSettings.js';
import {
  canManageFinishedActivityDocuments,
  canViewActivity,
  isActivityPast,
  isActivityStarted,
  type ActivityOwnerUser,
} from './activityPermissions.js';

export type ActivityWorkReportStatus = 'draft' | 'submitted';

/** Imagen adjunta a una zona del informe de trabajo. */
export interface ActivityWorkReportZoneImage {
  id: string;
  storageKey: string;
  mimeType: string;
  filename?: string;
  uploadedAt: string;
}

/** Zona del informe: titulo editable, notas e imagenes. */
export interface ActivityWorkReportZone {
  id: string;
  title: string;
  notes: string;
  images: ActivityWorkReportZoneImage[];
}

/** Parte de trabajo cerrado por un operario (horas reales + notas). */
export interface ActivityWorkReport {
  userId: string;
  userName: string;
  status: ActivityWorkReportStatus;
  /** Minutos trabajados confirmados en el parte. */
  workedMinutes: number;
  /** Notas libres (legacy); preferir zones. */
  notes?: string;
  zones?: ActivityWorkReportZone[];
  submittedAt?: string;
  updatedAt: string;
}

export const MAX_WORK_REPORT_ZONES = 20;
export const MAX_WORK_REPORT_ZONE_IMAGES = 5;

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

function normalizeWorkReportZoneImage(value: unknown): ActivityWorkReportZoneImage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ActivityWorkReportZoneImage>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const storageKey = typeof raw.storageKey === 'string' ? raw.storageKey.trim() : '';
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
  const uploadedAt = typeof raw.uploadedAt === 'string' ? raw.uploadedAt.trim() : '';
  if (!id || !storageKey || !mimeType || !uploadedAt) return null;
  const filename =
    typeof raw.filename === 'string' && raw.filename.trim() ? raw.filename.trim() : undefined;
  return { id, storageKey, mimeType, filename, uploadedAt };
}

export function normalizeWorkReportZone(value: unknown): ActivityWorkReportZone | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ActivityWorkReportZone>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
  const images = Array.isArray(raw.images)
    ? raw.images
        .map(normalizeWorkReportZoneImage)
        .filter((image): image is ActivityWorkReportZoneImage => image !== null)
        .slice(0, MAX_WORK_REPORT_ZONE_IMAGES)
    : [];
  return { id, title, notes, images };
}

export function getActivityWorkReportZones(report: ActivityWorkReport | null | undefined): ActivityWorkReportZone[] {
  if (!report) return [];
  if (Array.isArray(report.zones) && report.zones.length > 0) {
    return report.zones
      .map(normalizeWorkReportZone)
      .filter((zone): zone is ActivityWorkReportZone => zone !== null);
  }
  const legacyNotes = report.notes?.trim();
  if (legacyNotes) {
    return [{ id: '__legacy__', title: 'General', notes: legacyNotes, images: [] }];
  }
  return [];
}

export function formatWorkReportZonesSummary(zones: ActivityWorkReportZone[]): string {
  return zones
    .filter((zone) => zone.title.trim() || zone.notes.trim())
    .map((zone) => {
      const title = zone.title.trim() || 'Zona';
      const note = zone.notes.trim();
      return note ? `${title}: ${note}` : title;
    })
    .join(' · ');
}

export function formatWorkReportNotesSummary(report: ActivityWorkReport | null | undefined): string {
  if (!report) return '';
  const zones = getActivityWorkReportZones(report);
  if (zones.length > 0) {
    const summary = formatWorkReportZonesSummary(zones);
    if (summary) return summary;
  }
  return report.notes?.trim() ?? '';
}

export type WorkReportZoneInput = {
  id?: unknown;
  title?: unknown;
  notes?: unknown;
};

export function parseWorkReportZonesInput(
  value: unknown,
  existing?: ActivityWorkReport | null,
): ActivityWorkReportZone[] | null {
  if (value === undefined) {
    return existing ? getActivityWorkReportZones(existing) : [];
  }
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_WORK_REPORT_ZONES) return null;

  const existingById = new Map(
    getActivityWorkReportZones(existing ?? null).map((zone) => [zone.id, zone]),
  );
  const zones: ActivityWorkReportZone[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const raw = entry as WorkReportZoneInput;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const notes = typeof raw.notes === 'string' ? raw.notes.trim() : '';
    const previous = existingById.get(id);
    zones.push({
      id,
      title,
      notes,
      images: previous?.images ?? [],
    });
  }

  return zones;
}

export function workReportHasZoneContent(zones: ActivityWorkReportZone[]): boolean {
  return zones.some(
    (zone) => zone.title.trim() || zone.notes.trim() || zone.images.length > 0,
  );
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

/** Puede enviar el informe cuando la actividad ya ha finalizado. */
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
  if (!isActivityPast(options, now)) return false;
  if (user.role === 'admin') return true;
  if (!isActivityParticipant(user, options.activity, options.event)) return false;
  return true;
}

/** Puede anotar el informe desde que empieza la actividad; operario: solo su parte no enviada. */
export function canEditActivityWorkReport(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    targetUserId: string;
    documents?: readonly Document[];
  },
  now: Date = new Date(),
): boolean {
  if (!user) return false;
  if (!canViewActivity(user, options)) return false;
  if (!isActivityStarted(options, now)) return false;
  if (
    options.documents &&
    user.id === options.targetUserId &&
    isActivityWorkReportLockedByDeliveryNote(options.activity, user.id, options.documents)
  ) {
    return false;
  }
  if (user.role === 'admin') return true;
  if (user.id !== options.targetUserId) return false;
  if (!isActivityParticipant(user, options.activity, options.event)) return false;
  const existing = getActivityWorkReport(options.activity, user.id);
  return !existing || existing.status !== 'submitted';
}

export function buildActivityWorkReportPayload(input: {
  user: Pick<{ id: string; name: string }, 'id' | 'name'>;
  workedMinutes: number;
  notes?: string;
  zones?: ActivityWorkReportZone[];
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

  const zones =
    input.zones ??
    (input.existing ? getActivityWorkReportZones(input.existing) : undefined);
  const notesSummary =
    zones && workReportHasZoneContent(zones)
      ? formatWorkReportZonesSummary(zones)
      : input.notes;

  return {
    userId: input.user.id,
    userName: input.user.name.trim() || 'Usuario',
    status: input.status,
    workedMinutes: input.workedMinutes,
    notes: notesSummary || input.notes,
    zones: zones && zones.length > 0 ? zones : undefined,
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

/** Vuelve a borrador el informe enviado de un operario (p. ej. tras eliminar su albaran). */
export function reopenActivityWorkReportForWorker(
  activity: Activity,
  userId: string,
  now: Date = new Date(),
): Activity {
  const existing = getActivityWorkReport(activity, userId);
  if (!existing || existing.status !== 'submitted') return activity;
  const report = buildActivityWorkReportPayload({
    user: { id: existing.userId, name: existing.userName },
    workedMinutes: existing.workedMinutes,
    notes: existing.notes,
    zones: getActivityWorkReportZones(existing),
    status: 'draft',
    existing,
    now,
  });
  return upsertActivityWorkReport(activity, report);
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

export const ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR =
  'No se puede facturar hasta que todos los operarios asignados hayan enviado su informe de trabajo.';

export const ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR =
  'No se puede facturar hasta que todos los operarios con informe enviado tengan su albaran emitido.';

export type WorkReportAssigneeNameLookup =
  | Readonly<Record<string, string>>
  | ReadonlyMap<string, string>;

function resolveAssigneeSlotDisplayName(activity: Activity, userId: string): string | null {
  if (!Array.isArray(activity.assigneeSlots)) return null;
  for (const slot of activity.assigneeSlots) {
    if (slot.userId !== userId) continue;
    const rawName = (slot as { userName?: string }).userName;
    if (typeof rawName === 'string' && rawName.trim()) return rawName.trim();
  }
  return null;
}

export function resolveWorkReportAssigneeDisplayName(
  activity: Activity,
  userId: string,
  namesById?: WorkReportAssigneeNameLookup,
): string {
  const report = getActivityWorkReport(activity, userId);
  if (report?.userName?.trim()) return report.userName.trim();
  const slotName = resolveAssigneeSlotDisplayName(activity, userId);
  if (slotName) return slotName;
  if (namesById) {
    const name =
      namesById instanceof Map
        ? namesById.get(userId)
        : (namesById as Readonly<Record<string, string>>)[userId];
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return 'Operario sin nombre';
}

export function formatPendingWorkReportAssigneeLabel(
  activity: Activity,
  event?: CalendarEvent | null,
  namesById?: WorkReportAssigneeNameLookup,
): string | null {
  const pendingIds = getPendingWorkReportAssigneeIds(activity, event);
  if (pendingIds.length === 0) return null;
  return pendingIds
    .map((userId) => resolveWorkReportAssigneeDisplayName(activity, userId, namesById))
    .join(', ');
}

export function formatActivityInvoiceWorkReportBlockReason(
  activity: Activity,
  event?: CalendarEvent | null,
  namesById?: WorkReportAssigneeNameLookup,
): string | null {
  if (allAssigneesSubmittedWorkReports(activity, event ?? null)) return null;
  const pendingLabel = formatPendingWorkReportAssigneeLabel(activity, event, namesById);
  if (!pendingLabel) return ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR;
  return `${ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR} Informes pendientes: ${pendingLabel}.`;
}

export function formatPendingDeliveryNoteAssigneeLabel(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  documents: readonly Document[],
  namesById?: WorkReportAssigneeNameLookup,
): string | null {
  const pendingIds = getPendingDeliveryNoteAssigneeIds(activity, event, documents);
  if (pendingIds.length === 0) return null;
  return pendingIds
    .map((userId) => resolveWorkReportAssigneeDisplayName(activity, userId, namesById))
    .join(', ');
}

export function formatActivityInvoiceDeliveryNoteBlockReason(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  documents: readonly Document[],
  namesById?: WorkReportAssigneeNameLookup,
): string | null {
  if (allSubmittedAssigneesHaveDeliveryNotes(activity, event, documents)) return null;
  const pendingLabel = formatPendingDeliveryNoteAssigneeLabel(activity, event, documents, namesById);
  if (!pendingLabel) return ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR;
  return `${ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR} Albaranes pendientes: ${pendingLabel}.`;
}

export const ACTIVITY_WORK_REPORT_CLIENT_EMAIL_REQUIRED_ERROR =
  'El contacto necesita email para emitir el albaran al enviar el informe.';

/** Operario que recibe los conceptos extra compartidos de la actividad (primer asignado). */
export function resolveActivityExtraItemsOwnerUserId(
  activity: Activity,
  event?: CalendarEvent | null,
): string | null {
  const assignees = getActivityAssigneeIds(activity, event ?? null);
  if (assignees.length > 0) return assignees[0]!;
  return activity.userId ?? null;
}

export function shouldIncludeExtraItemsOnWorkerDeliveryNote(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  workerUserId: string,
): boolean {
  const ownerId = resolveActivityExtraItemsOwnerUserId(activity, event);
  return Boolean(ownerId && ownerId === workerUserId);
}

/** Factura de actividad con informes: exige informes enviados de todos los operarios. */
export function validateActivityInvoiceRequiresCompleteWorkReports(
  activity: Activity,
  event?: CalendarEvent | null,
): string | null {
  if (!allAssigneesSubmittedWorkReports(activity, event ?? null)) {
    return ACTIVITY_INVOICE_PENDING_WORK_REPORTS_ERROR;
  }
  return null;
}

export function allSubmittedAssigneesHaveDeliveryNotes(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  documents: readonly Document[],
): boolean {
  const assignees = getActivityAssigneeIds(activity, event ?? null).filter((userId) =>
    isSubmittedActivityWorkReport(activity, userId),
  );
  if (assignees.length === 0) return false;
  return assignees.every((userId) =>
    Boolean(findActivityDeliveryNoteForWorker(activity.id, userId, documents, activity)),
  );
}

export function getPendingDeliveryNoteAssigneeIds(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  documents: readonly Document[],
): string[] {
  return getActivityAssigneeIds(activity, event ?? null).filter(
    (userId) =>
      isSubmittedActivityWorkReport(activity, userId) &&
      !findActivityDeliveryNoteForWorker(activity.id, userId, documents, activity),
  );
}

/** Factura: informes completos y albaran emitido por cada operario con informe enviado. */
export function validateActivityInvoiceRequiresWorkerDeliveryNotes(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  documents: readonly Document[],
): string | null {
  const workReportError = validateActivityInvoiceRequiresCompleteWorkReports(activity, event);
  if (workReportError) return workReportError;
  if (!allSubmittedAssigneesHaveDeliveryNotes(activity, event, documents)) {
    return ACTIVITY_INVOICE_PENDING_DELIVERY_NOTES_ERROR;
  }
  return null;
}

export function validateWorkReportSubmitClientEmail(
  clientEmail: string | undefined | null,
  createsDeliveryNote: boolean,
): string | null {
  if (!createsDeliveryNote) return null;
  if (!clientEmail?.trim()) return ACTIVITY_WORK_REPORT_CLIENT_EMAIL_REQUIRED_ERROR;
  return null;
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

/** Admin u operario asignado: conceptos extra desde que empieza la actividad. */
export function canEditActivityWorkReportExtraItems(
  user: ActivityOwnerUser,
  options: {
    activity: Activity;
    event?: CalendarEvent | null;
    documents?: readonly Document[];
  },
  now: Date = new Date(),
): boolean {
  if (!user) return false;
  if (!canViewActivity(user, options)) return false;
  if (!isActivityStarted(options, now)) return false;
  if (
    options.documents &&
    isActivityWorkReportExtraItemsLockedByDeliveryNote(options.activity, options.documents)
  ) {
    return false;
  }
  if (user.role === 'admin') return true;
  if (isActivityParticipant(user, options.activity, options.event)) return true;
  return canManageFinishedActivityDocuments(user, options);
}

/** Marcador legacy del albaran separado de conceptos extra (ya no se crea). */
export const ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER = '__activity_extras__';

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
      const noteSuffix = formatWorkReportNotesSummary(report)
        ? ` — ${formatWorkReportNotesSummary(report)}`
        : '';
      return {
        name: label,
        description: `${report.userName}: ${timeLabel}${noteSuffix}`,
        quantity: hours,
        price: 0,
      };
    });
}

/** Lineas del albaran de un operario (horas del informe enviado + conceptos extra compartidos). */
export function buildActivityDeliveryNoteItemsForWorker(
  activity: Activity,
  serviceLabel: string,
  userId: string,
  event?: CalendarEvent | null,
): DocumentLineItem[] {
  if (!isSubmittedActivityWorkReport(activity, userId)) {
    return [];
  }

  const report = getActivityWorkReport(activity, userId)!;
  const label = serviceLabel.trim() || activity.description.trim() || 'Servicio';
  const hours = workedMinutesToHours(report.workedMinutes);
  const timeLabel = formatHoursMinutes(hours) ?? `${hours}h`;
  const noteSuffix = formatWorkReportNotesSummary(report)
    ? ` — ${formatWorkReportNotesSummary(report)}`
    : '';
  const hourItems: DocumentLineItem[] = [
    {
      name: label,
      description: `${report.userName}: ${timeLabel}${noteSuffix}`,
      quantity: hours,
      price: 0,
    },
  ];
  const extraItems = shouldIncludeExtraItemsOnWorkerDeliveryNote(activity, event, userId)
    ? buildActivityDeliveryNoteExtraOnlyItems(activity)
    : [];
  return [...hourItems, ...extraItems];
}

export function buildActivityDeliveryNoteExtraOnlyItems(activity: Activity): DocumentLineItem[] {
  return getActivityWorkReportExtraItems(activity).filter((item) =>
    Boolean(getLineItemConceptText(item)),
  );
}

export function buildActivityDeliveryNoteItems(
  activity: Activity,
  serviceLabel: string,
): DocumentLineItem[] {
  const hourItems = buildActivityDeliveryNoteItemsFromWorkReports(activity, serviceLabel);
  const extraItems = buildActivityDeliveryNoteExtraOnlyItems(activity);
  return [...hourItems, ...extraItems];
}

function activityDeliveryNotesForWorkerLookup(
  activityId: string,
  documents: readonly Document[],
): Document[] {
  return documents.filter(
    (doc) =>
      doc.activityId === activityId &&
      doc.type === 'delivery-note' &&
      doc.workerUserId !== ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER,
  );
}

export function deliveryNoteLineMatchesWorkerName(
  item: DocumentLineItem,
  workerName: string,
): boolean {
  const description = item.description?.trim() ?? '';
  const prefix = `${workerName.trim()}:`;
  return description.startsWith(prefix);
}

function activityWorkReportDeliveryNotes(
  activityId: string,
  documents: readonly Document[],
): Document[] {
  return documents.filter(
    (doc) =>
      doc.activityId === activityId &&
      doc.type === 'delivery-note' &&
      doc.workerUserId !== ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER,
  );
}

/** El informe queda bloqueado mientras exista el albaran emitido del operario. */
export function isActivityWorkReportLockedByDeliveryNote(
  activity: Activity,
  workerUserId: string,
  documents: readonly Document[],
): boolean {
  return Boolean(
    findActivityDeliveryNoteForWorker(activity.id, workerUserId, documents, activity),
  );
}

/** Los conceptos extra forman parte del informe y quedan bloqueados si ya hay albaranes emitidos. */
export function isActivityWorkReportExtraItemsLockedByDeliveryNote(
  activity: Activity,
  documents: readonly Document[],
): boolean {
  return activityWorkReportDeliveryNotes(activity.id, documents).length > 0;
}

/** Resuelve el albaran de un operario, incluyendo documentos legacy sin workerUserId. */
export function findActivityDeliveryNoteForWorker(
  activityId: string,
  workerUserId: string,
  documents: readonly Document[],
  activity?: Activity | null,
): Document | null {
  const activityNotes = activityDeliveryNotesForWorkerLookup(activityId, documents);

  const direct = activityNotes.find((doc) => doc.workerUserId === workerUserId);
  if (direct) return direct;

  const legacyNotes = activityNotes.filter((doc) => !doc.workerUserId);
  if (legacyNotes.length === 0 || !activity) return null;

  const report = getActivityWorkReport(activity, workerUserId);
  if (!report || report.status !== 'submitted') return null;

  const byWorkerLine = legacyNotes.filter((doc) =>
    doc.items.some((item) => deliveryNoteLineMatchesWorkerName(item, report.userName)),
  );
  if (byWorkerLine.length === 1) return byWorkerLine[0] ?? null;

  const submittedReports = getSubmittedActivityWorkReports(activity).filter(
    (entry) => (entry.workedMinutes ?? 0) > 0,
  );
  if (
    legacyNotes.length === 1 &&
    submittedReports.length === 1 &&
    submittedReports[0]?.userId === workerUserId
  ) {
    return legacyNotes[0] ?? null;
  }

  return null;
}

/** Albaranes vinculados a la actividad que no se asignaron a ningun operario. */
export function listUnmatchedActivityDeliveryNotes(
  activityId: string,
  documents: readonly Document[],
  resolvedDocumentIds: ReadonlySet<string>,
): Document[] {
  return documents.filter((doc) => {
    if (doc.activityId !== activityId || doc.type !== 'delivery-note') return false;
    if (doc.workerUserId === ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER) return false;
    return !resolvedDocumentIds.has(doc.id);
  });
}
