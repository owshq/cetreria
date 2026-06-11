import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  activityUsesWorkReport,
  findActivityDeliveryNoteForWorker,
  findEventForActivity,
  formatHoursMinutes,
  formatWorkReportNotesSummary,
  getActivityReportedHours,
  getActivityTypeLabel,
  getActivityWorkReport,
  getActivityWorkReportExtraItems,
  getActivityWorkReportZones,
  getLineItemConceptText,
  getWorkerHoursStatus,
  isShiftCode,
  normalizeActivityAssigneeSlots,
  resolveWorkerReportHours,
  type ClientScope,
  type WorkerReportHoursSource,
  SHIFT_META,
} from '@shared/types';
import { getActivityDocumentConcepts } from '@/lib/activityTableFields';
import { workerActivitiesInRange } from '@/lib/workerPeriodStats';

export const DETAIL_EMPTY_LABEL = '\u2014';

const DETAIL_LIST_SEPARATOR = ' \u00b7 ';

export type WorkerActivityDetailRow = {
  activityId: string;
  date: string;
  clientName: string;
  typeLabel: string;
  description: string;
  workerName: string;
  /** Horas planificadas de la actividad (`activity.hours`). */
  plannedActivityHours: number;
  /** Alias retrocompatible. */
  plannedHours: number;
  /** Horas asignadas al operario en tramos / slots. */
  assignedHours: number;
  /** Horas reportadas en parte de trabajo enviado. */
  reportedHours: number;
  /** Alias retrocompatible. */
  workReportHours: number;
  /** Horas firmadas (solo relevantes si workerSignaturesEnabled). */
  signedHours: number;
  /** Horas principales del informe con fuente semantica. */
  reportHours: number;
  reportHoursSource: WorkerReportHoursSource;
  reportHoursLabel: string;
  reportStatus: string;
  zones: string;
  /** Alias retrocompatible para exportacion CSV/PDF. */
  zonesWorked: string;
  notes: string;
  /** Alias retrocompatible. */
  workerNotes: string;
  /** Zonas y notas combinadas (retrocompatible). */
  zonesNotes: string;
  deliveryNoteNumber: string | null;
  deliveryNoteDate: string | null;
  linkedDocuments: string;
  invoiceConcepts: string;
  extraConcepts: string;
  shiftLabel: string;
};

export type ActivityDetailHoursOptions = {
  activityTypes: readonly ActivityType[];
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
};

export function buildActivityDocumentsIndex(
  documents: readonly Document[],
): Map<string, Document[]> {
  const docsByActivityId = new Map<string, Document[]>();
  for (const doc of documents) {
    if (!doc.activityId) continue;
    const list = docsByActivityId.get(doc.activityId) ?? [];
    list.push(doc);
    docsByActivityId.set(doc.activityId, list);
  }
  return docsByActivityId;
}

export function formatActivityReportStatus(
  activity: Activity,
  userId: string,
  activityTypes: readonly ActivityType[],
): string {
  if (!activityUsesWorkReport(activity, activityTypes)) return DETAIL_EMPTY_LABEL;
  const report = getActivityWorkReport(activity, userId);
  if (!report) return 'Sin informe';
  if (report.status === 'submitted') return 'Enviado';
  return 'Borrador';
}

export function formatLinkedDocuments(documents: Document[]): string {
  if (documents.length === 0) return DETAIL_EMPTY_LABEL;
  return documents
    .map((doc) => {
      const typeLabel =
        doc.type === 'invoice'
          ? 'Factura'
          : doc.type === 'delivery-note'
            ? 'Albaran'
            : doc.type;
      return `${typeLabel} ${doc.number}`.trim();
    })
    .join(', ');
}

export function formatExtraConcepts(activity: Activity): string {
  const items = getActivityWorkReportExtraItems(activity);
  if (items.length === 0) return DETAIL_EMPTY_LABEL;
  return items
    .map((item) => getLineItemConceptText(item))
    .filter(Boolean)
    .join(', ');
}

export function formatReportZonesForWorker(
  report: ReturnType<typeof getActivityWorkReport>,
): string {
  if (!report) return '';
  const zones = getActivityWorkReportZones(report);
  return zones
    .filter((zone) => zone.title.trim() || zone.notes.trim())
    .map((zone) => zone.title.trim() || 'Zona')
    .join(DETAIL_LIST_SEPARATOR);
}

export function formatReportNotesForWorker(
  report: ReturnType<typeof getActivityWorkReport>,
): string {
  if (!report) return '';
  const zones = getActivityWorkReportZones(report);
  const hasStructuredZones = Array.isArray(report.zones) && report.zones.length > 0;
  const zoneNotes = zones
    .filter((zone) => zone.notes.trim())
    .map((zone) => {
      const title = zone.title.trim() || 'Zona';
      return `${title}: ${zone.notes.trim()}`;
    });
  const generalNotes = report.notes?.trim() ?? '';

  if (hasStructuredZones) {
    return [...zoneNotes, generalNotes].filter(Boolean).join(DETAIL_LIST_SEPARATOR);
  }

  if (zones.length === 1 && zones[0].id === '__legacy__') {
    return zones[0].notes.trim();
  }

  return generalNotes;
}

export function getWorkerScheduleTimeRange(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
): string {
  const slots = normalizeActivityAssigneeSlots(activity, event).filter(
    (slot) => slot.userId === userId,
  );
  if (slots.length === 0) return '';

  return slots
    .map((slot) => {
      const shiftLabel = isShiftCode(slot.shift) ? SHIFT_META[slot.shift].label : slot.shift;
      if (slot.startTime && slot.endTime) {
        return `${shiftLabel} ${slot.startTime}-${slot.endTime}`;
      }
      return shiftLabel;
    })
    .join(DETAIL_LIST_SEPARATOR);
}

export function buildWorkerActivityDetailRow(options: {
  activity: Activity;
  event: CalendarEvent | null | undefined;
  documents: readonly Document[];
  activityDocuments: Document[];
  clientsById: Map<string, Client>;
  userId: string;
  workerName: string;
  activityTypes: readonly ActivityType[];
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
}): WorkerActivityDetailRow {
  const {
    activity,
    event,
    documents,
    activityDocuments,
    clientsById,
    userId,
    workerName,
    activityTypes,
    workerSignaturesEnabled,
    shiftSchedulingEnabled,
  } = options;

  const { assignedHours, signedHours } = getWorkerHoursStatus(activity, event, userId);
  const workReportHours = getActivityReportedHours(activity, userId);
  const plannedActivityHours = activity.hours ?? 0;
  const reportHoursResult = resolveWorkerReportHours(activity, event, userId, {
    activityTypes,
    workerSignaturesEnabled,
    shiftSchedulingEnabled,
  });
  const deliveryNote = findActivityDeliveryNoteForWorker(
    activity.id,
    userId,
    documents,
    activity,
  );
  const invoiceDocs = activityDocuments.filter((doc) => doc.type === 'invoice');
  const report = getActivityWorkReport(activity, userId);
  const zones = formatReportZonesForWorker(report);
  const notes = formatReportNotesForWorker(report);
  const zonesNotes =
    report != null
      ? formatWorkReportNotesSummary(report)
      : [zones, notes].filter(Boolean).join(DETAIL_LIST_SEPARATOR);

  return {
    activityId: activity.id,
    date: activity.date,
    clientName: clientsById.get(activity.clientId)?.name ?? DETAIL_EMPTY_LABEL,
    typeLabel: getActivityTypeLabel(activity.type, activityTypes),
    description: activity.description?.trim() || DETAIL_EMPTY_LABEL,
    workerName,
    plannedActivityHours,
    plannedHours: plannedActivityHours,
    assignedHours,
    reportedHours: workReportHours,
    workReportHours,
    signedHours: workerSignaturesEnabled ? signedHours : 0,
    reportHours: reportHoursResult.hours,
    reportHoursSource: reportHoursResult.source,
    reportHoursLabel: reportHoursResult.label,
    reportStatus: formatActivityReportStatus(activity, userId, activityTypes),
    zones: zones || DETAIL_EMPTY_LABEL,
    zonesWorked: zones || DETAIL_EMPTY_LABEL,
    notes: notes || DETAIL_EMPTY_LABEL,
    workerNotes: notes || DETAIL_EMPTY_LABEL,
    zonesNotes,
    deliveryNoteNumber: deliveryNote?.number ?? null,
    deliveryNoteDate: deliveryNote?.date ?? null,
    linkedDocuments: formatLinkedDocuments(activityDocuments),
    invoiceConcepts:
      getActivityDocumentConcepts(invoiceDocs).join(', ') || DETAIL_EMPTY_LABEL,
    extraConcepts: formatExtraConcepts(activity),
    shiftLabel: shiftSchedulingEnabled
      ? getWorkerScheduleTimeRange(activity, event, userId)
      : '',
  };
}

export function buildWorkerActivityDetailRows(options: {
  activities: readonly Activity[];
  events: readonly CalendarEvent[];
  documents: readonly Document[];
  clients: readonly Client[];
  assignees: readonly UserAssignee[];
  activityTypes: readonly ActivityType[];
  userId: string;
  from: string;
  to: string;
  clientScope: ClientScope;
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
}): WorkerActivityDetailRow[] {
  const {
    activities,
    events,
    documents,
    clients,
    assignees,
    activityTypes,
    userId,
    from,
    to,
    clientScope,
    workerSignaturesEnabled = false,
    shiftSchedulingEnabled = false,
  } = options;

  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const docsByActivityId = buildActivityDocumentsIndex(documents);
  const workerName = assignees.find((user) => user.id === userId)?.name ?? '';

  const periodActivities = workerActivitiesInRange(
    activities,
    events,
    assignees,
    userId,
    from,
    to,
    clientScope,
  ).sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt),
  );

  return periodActivities.map((activity) => {
    const event = findEventForActivity(activity, [...events]) ?? null;
    return buildWorkerActivityDetailRow({
      activity,
      event,
      documents,
      activityDocuments: docsByActivityId.get(activity.id) ?? [],
      clientsById,
      userId,
      workerName,
      activityTypes,
      workerSignaturesEnabled,
      shiftSchedulingEnabled,
    });
  });
}

export function formatWorkerActivityDetailHours(hours: number): string {
  if (hours <= 0) return '';
  return formatHoursMinutes(hours) ?? `${hours}h`;
}

export function formatWorkerActivityDetailText(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return trimmed || DETAIL_EMPTY_LABEL;
}

export function formatWorkerActivityDetailHoursCell(hours: number): string {
  if (hours <= 0) return DETAIL_EMPTY_LABEL;
  return formatWorkerActivityDetailHours(hours) || DETAIL_EMPTY_LABEL;
}

/** Conceptos de factura y extras en una sola celda (solo presentacion). */
/** Columna auxiliar de horas reportadas en parte (solo si la principal mide otra cosa). */
export function workerDetailShowsReportedHoursColumn(options: {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
} = {}): boolean {
  return Boolean(options.workerSignaturesEnabled || options.shiftSchedulingEnabled);
}

export function formatWorkerActivityDetailConcepts(row: WorkerActivityDetailRow): string {
  const parts: string[] = [];
  if (row.invoiceConcepts.trim() && row.invoiceConcepts !== DETAIL_EMPTY_LABEL) {
    parts.push(row.invoiceConcepts.trim());
  }
  if (row.extraConcepts.trim() && row.extraConcepts !== DETAIL_EMPTY_LABEL) {
    parts.push(row.extraConcepts.trim());
  }
  return parts.length > 0 ? parts.join(DETAIL_LIST_SEPARATOR) : DETAIL_EMPTY_LABEL;
}
