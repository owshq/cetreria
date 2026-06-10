import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  WorkspaceScheduleShiftBoundaries,
} from '@shared/types';
import {
  activityUsesWorkReport,
  DOCUMENT_TYPE_LABELS,
  findEventForActivity,
  getActivityAssigneeIds,
  getActivityTypeLabel,
  getActivityWorkReport,
  getWorkerHoursStatus,
} from '@shared/types';
import { isAllTeamUsers } from '@/lib/activitiesTeamFilter';
import { activityMatchesTeamUser } from '@/lib/activitiesTeamScope';

export type ActivityAssociationGapBannerContent = {
  rangeLabel: string;
  text: string;
};

export type ActivityAssociationGapItem = {
  activity: Activity;
  lacksUsers: boolean;
  /** Cualquier hueco de documento o informe de trabajo pendiente. */
  lacksDocuments: boolean;
  lacksInvoice: boolean;
  lacksDeliveryNote: boolean;
  /** Operario: informe de trabajo no enviado (requisito previo al albaran). */
  lacksWorkReport: boolean;
  /** Tipo de documento principal que falta (para busqueda y etiquetas). */
  missingDocumentType: Document['type'] | null;
  lacksSignature: boolean;
};

export type ActivityDocumentGapCounts = {
  withoutInvoice: number;
  withoutDeliveryNote: number;
  withoutWorkReport: number;
};

export type ActivityAssociationGapCounts = {
  /** Actividades con al menos un hueco (sin operarios, sin documentos o sin firmar). */
  total: number;
  withoutUsers: number;
  /** Actividades con factura, albaran o informe de trabajo pendiente. */
  withoutDocuments: number;
  withoutInvoice: number;
  withoutDeliveryNote: number;
  withoutWorkReport: number;
  withoutSignatures: number;
};

export type ActivityAssociationGapBannerContext = {
  signatureSubjectLabel: string;
  viewerIsAdmin?: boolean;
};

export type ActivityDocumentGapOptions = {
  viewerIsAdmin: boolean;
  activityTypes: ActivityType[];
  operatorUserId?: string;
};

export function resolveViewerRequiredDocumentType(isAdmin: boolean): Document['type'] {
  return isAdmin ? 'invoice' : 'delivery-note';
}

export function activityHasLinkedDocumentType(
  activityId: string,
  documentsByActivity: Map<string, Document[]>,
  documentType: Document['type'],
): boolean {
  return (documentsByActivity.get(activityId) ?? []).some((doc) => doc.type === documentType);
}

function activityLacksSubmittedWorkReport(
  activity: Activity,
  operatorUserId: string | undefined,
  activityTypes: ActivityType[],
): boolean {
  if (!activityUsesWorkReport(activity, activityTypes) || !operatorUserId) return false;
  const report = getActivityWorkReport(activity, operatorUserId);
  return !report || report.status !== 'submitted';
}

export type ActivityDocumentGapInfo = Pick<
  ActivityAssociationGapItem,
  'lacksInvoice' | 'lacksDeliveryNote' | 'lacksWorkReport' | 'missingDocumentType' | 'lacksDocuments'
>;

export function getActivityDocumentGaps(
  activity: Activity,
  documentsByActivity: Map<string, Document[]>,
  options: ActivityDocumentGapOptions,
): ActivityDocumentGapInfo {
  return resolveActivityDocumentGaps(activity, documentsByActivity, options);
}

export function formatActivityDocumentGapCellLabel(
  gaps: ActivityDocumentGapInfo,
  viewerIsAdmin: boolean,
  compact = true,
): string | null {
  if (!gaps.lacksDocuments) return null;
  if (viewerIsAdmin && gaps.lacksInvoice) {
    return compact ? 'Sin fact.' : 'Sin factura';
  }
  if (gaps.lacksDeliveryNote) {
    return compact ? 'Sin alb.' : 'Sin albarán';
  }
  if (gaps.lacksWorkReport) {
    return compact ? 'Sin inf.' : 'Sin informe';
  }
  return null;
}

function resolveActivityDocumentGaps(
  activity: Activity,
  documentsByActivity: Map<string, Document[]>,
  options: ActivityDocumentGapOptions,
): ActivityDocumentGapInfo {
  const lacksInvoice = !activityHasLinkedDocumentType(activity.id, documentsByActivity, 'invoice');
  const lacksDeliveryNote = !activityHasLinkedDocumentType(
    activity.id,
    documentsByActivity,
    'delivery-note',
  );

  if (options.viewerIsAdmin) {
    const lacksDocuments = lacksInvoice || lacksDeliveryNote;
    return {
      lacksInvoice,
      lacksDeliveryNote,
      lacksWorkReport: false,
      missingDocumentType: lacksInvoice
        ? 'invoice'
        : lacksDeliveryNote
          ? 'delivery-note'
          : null,
      lacksDocuments,
    };
  }

  const lacksWorkReport = activityLacksSubmittedWorkReport(
    activity,
    options.operatorUserId,
    options.activityTypes,
  );
  const lacksDeliveryNoteGap = lacksWorkReport ? false : lacksDeliveryNote;

  return {
    lacksInvoice: false,
    lacksDeliveryNote: lacksDeliveryNoteGap,
    lacksWorkReport,
    missingDocumentType: lacksWorkReport
      ? null
      : lacksDeliveryNoteGap
        ? 'delivery-note'
        : null,
    lacksDocuments: lacksWorkReport || lacksDeliveryNoteGap,
  };
}

export function resolveActivitySignatureUserId(
  teamUserId: string,
  currentUserId: string | null | undefined,
): string | undefined {
  if (!currentUserId) return undefined;
  if (isAllTeamUsers(teamUserId)) return currentUserId;
  return teamUserId;
}

export function resolveActivitySignatureSubjectLabel(
  teamUserId: string,
  assigneeName?: string | null,
): string {
  if (!isAllTeamUsers(teamUserId) && assigneeName?.trim()) {
    return assigneeName.trim();
  }
  return 'Tú';
}

function activityLacksSignableSignature(
  activity: Activity,
  event: CalendarEvent | undefined,
  signatureUserId: string | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): boolean {
  if (!signatureUserId) return false;
  if (!getActivityAssigneeIds(activity, event).includes(signatureUserId)) {
    return false;
  }

  return getWorkerHoursStatus(activity, event, signatureUserId, boundaries).canSignNow;
}

export function countActivityAssociationGaps(
  activities: Activity[],
  events: CalendarEvent[],
  documentsByActivity: Map<string, Document[]>,
  teamUserId: string,
  teamAssigneeIds: Set<string>,
  currentUserId: string | null | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  documentGapOptions: ActivityDocumentGapOptions = { viewerIsAdmin: false, activityTypes: [] },
): ActivityAssociationGapCounts {
  const signatureUserId = resolveActivitySignatureUserId(teamUserId, currentUserId);
  const operatorUserId = documentGapOptions.operatorUserId ?? currentUserId ?? undefined;
  let withoutUsers = 0;
  let withoutDocuments = 0;
  let withoutInvoice = 0;
  let withoutDeliveryNote = 0;
  let withoutWorkReport = 0;
  let withoutSignatures = 0;
  let total = 0;

  for (const activity of activities) {
    if (
      !isAllTeamUsers(teamUserId) &&
      !activityMatchesTeamUser(activity, events, teamUserId, teamAssigneeIds)
    ) {
      continue;
    }

    const event = findEventForActivity(activity, events);
    const lacksUsers = getActivityAssigneeIds(activity, event).length === 0;
    const documentGaps = resolveActivityDocumentGaps(activity, documentsByActivity, {
      ...documentGapOptions,
      operatorUserId,
    });
    const lacksSignature = activityLacksSignableSignature(
      activity,
      event,
      signatureUserId,
      boundaries,
    );

    if (!lacksUsers && !documentGaps.lacksDocuments && !lacksSignature) continue;

    total += 1;
    if (lacksUsers) withoutUsers += 1;
    if (documentGaps.lacksDocuments) withoutDocuments += 1;
    if (documentGaps.lacksInvoice) withoutInvoice += 1;
    if (documentGaps.lacksDeliveryNote) withoutDeliveryNote += 1;
    if (documentGaps.lacksWorkReport) withoutWorkReport += 1;
    if (lacksSignature) withoutSignatures += 1;
  }

  return {
    total,
    withoutUsers,
    withoutDocuments,
    withoutInvoice,
    withoutDeliveryNote,
    withoutWorkReport,
    withoutSignatures,
  };
}

function resolveActivityAssociationGap(
  activity: Activity,
  events: CalendarEvent[],
  documentsByActivity: Map<string, Document[]>,
  signatureUserId: string | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  documentGapOptions: ActivityDocumentGapOptions = { viewerIsAdmin: false, activityTypes: [] },
): ActivityAssociationGapItem | null {
  const event = findEventForActivity(activity, events);
  const lacksUsers = getActivityAssigneeIds(activity, event).length === 0;
  const documentGaps = resolveActivityDocumentGaps(activity, documentsByActivity, {
    ...documentGapOptions,
    operatorUserId: documentGapOptions.operatorUserId ?? signatureUserId,
  });
  const lacksSignature = activityLacksSignableSignature(
    activity,
    event,
    signatureUserId,
    boundaries,
  );

  if (!lacksUsers && !documentGaps.lacksDocuments && !lacksSignature) return null;

  return {
    activity,
    lacksUsers,
    lacksDocuments: documentGaps.lacksDocuments,
    lacksInvoice: documentGaps.lacksInvoice,
    lacksDeliveryNote: documentGaps.lacksDeliveryNote,
    lacksWorkReport: documentGaps.lacksWorkReport,
    missingDocumentType: documentGaps.missingDocumentType,
    lacksSignature,
  };
}

export function listActivityAssociationGaps(
  activities: Activity[],
  events: CalendarEvent[],
  documentsByActivity: Map<string, Document[]>,
  teamUserId: string,
  teamAssigneeIds: Set<string>,
  currentUserId: string | null | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  documentGapOptions: ActivityDocumentGapOptions = { viewerIsAdmin: false, activityTypes: [] },
): ActivityAssociationGapItem[] {
  const signatureUserId = resolveActivitySignatureUserId(teamUserId, currentUserId);
  const items: ActivityAssociationGapItem[] = [];

  for (const activity of activities) {
    if (
      !isAllTeamUsers(teamUserId) &&
      !activityMatchesTeamUser(activity, events, teamUserId, teamAssigneeIds)
    ) {
      continue;
    }

    const gap = resolveActivityAssociationGap(
      activity,
      events,
      documentsByActivity,
      signatureUserId,
      boundaries,
      documentGapOptions,
    );
    if (gap) items.push(gap);
  }

  return items.sort((a, b) => {
    const dateCompare = a.activity.date.localeCompare(b.activity.date);
    if (dateCompare !== 0) return dateCompare;
    return a.activity.createdAt.localeCompare(b.activity.createdAt);
  });
}

export function listActivityAssociationGapsFromActivities(
  activities: Activity[],
  events: CalendarEvent[],
  documentsByActivity: Map<string, Document[]>,
  signatureUserId: string | undefined,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
  documentGapOptions: ActivityDocumentGapOptions = { viewerIsAdmin: false, activityTypes: [] },
): ActivityAssociationGapItem[] {
  const items: ActivityAssociationGapItem[] = [];

  for (const activity of activities) {
    const gap = resolveActivityAssociationGap(
      activity,
      events,
      documentsByActivity,
      signatureUserId,
      boundaries,
      documentGapOptions,
    );
    if (gap) items.push(gap);
  }

  return items.sort((a, b) => {
    const dateCompare = a.activity.date.localeCompare(b.activity.date);
    if (dateCompare !== 0) return dateCompare;
    return a.activity.createdAt.localeCompare(b.activity.createdAt);
  });
}

export function getActivityAssociationGapSearchHaystack(
  item: ActivityAssociationGapItem,
  event: CalendarEvent | undefined,
  clientsMap: Map<string, Client>,
  activityTypes: ActivityType[],
): string {
  const { activity, lacksUsers, lacksDocuments, lacksSignature } = item;
  const clientName = clientsMap.get(activity.clientId)?.name ?? '';
  const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
  const eventText = event ? `${event.title} ${event.description ?? ''}` : '';
  const missingDocLabel =
    item.missingDocumentType != null
      ? DOCUMENT_TYPE_LABELS[item.missingDocumentType].toLowerCase()
      : 'documento';
  const gapLabels = [
    lacksUsers ? 'sin operario operarios asignado asignados' : '',
    item.lacksInvoice ? 'sin factura facturas vinculada vinculadas' : '',
    item.lacksDeliveryNote ? 'sin albaran albarán vinculado vinculados' : '',
    item.lacksWorkReport
      ? 'sin informe informe de trabajo trabajo enviado completar parte'
      : '',
    lacksDocuments && !item.lacksInvoice && !item.lacksDeliveryNote && !item.lacksWorkReport
      ? `sin ${missingDocLabel} documento documentos vinculado vinculados vinculada`
      : '',
    lacksSignature ? 'sin firma firmar firmada pendiente tramo finalizado' : '',
  ].join(' ');

  return `${clientName} ${typeLabel} ${activity.description} ${activity.date} ${eventText} ${gapLabels}`.toLowerCase();
}

export function matchesActivityAssociationGapSearch(
  item: ActivityAssociationGapItem,
  searchTerm: string,
  event: CalendarEvent | undefined,
  clientsMap: Map<string, Client>,
  activityTypes: ActivityType[],
): boolean {
  const term = searchTerm.toLowerCase().trim();
  if (!term) return true;

  const tokens = term.split(/\s+/).filter(Boolean);
  const haystack = getActivityAssociationGapSearchHaystack(
    item,
    event,
    clientsMap,
    activityTypes,
  );
  return tokens.every((token) => haystack.includes(token));
}

export function formatActivityAssociationGapRangeLabel(from: string, to: string): string {
  const fromLabel = format(parseISO(from), 'd MMM yyyy', { locale: es });
  if (from === to) return fromLabel;
  const toLabel = format(parseISO(to), 'd MMM yyyy', { locale: es });
  return `${fromLabel} – ${toLabel}`;
}

function formatUsersGapPhrase(count: number): string {
  return count === 1
    ? '1 actividad no tiene operario asignado.'
    : `${count} actividades no tienen operario asignado.`;
}

function formatInvoiceGapPhrase(count: number): string {
  return count === 1
    ? '1 actividad no tiene factura vinculada.'
    : `${count} actividades no tienen factura vinculada.`;
}

function formatDeliveryNoteGapPhrase(count: number): string {
  return count === 1
    ? '1 actividad no tiene albarán vinculado.'
    : `${count} actividades no tienen albarán vinculado.`;
}

function formatWorkReportGapPhrase(count: number): string {
  return count === 1
    ? '1 actividad sin informe de trabajo enviado.'
    : `${count} actividades sin informe de trabajo enviado.`;
}

function formatDocumentGapPhrases(counts: ActivityDocumentGapCounts, viewerIsAdmin: boolean): string {
  const sentences: string[] = [];
  if (viewerIsAdmin && counts.withoutInvoice > 0) {
    sentences.push(formatInvoiceGapPhrase(counts.withoutInvoice));
  }
  if (counts.withoutDeliveryNote > 0) {
    sentences.push(formatDeliveryNoteGapPhrase(counts.withoutDeliveryNote));
  }
  if (!viewerIsAdmin && counts.withoutWorkReport > 0) {
    sentences.push(formatWorkReportGapPhrase(counts.withoutWorkReport));
  }
  return sentences.join(' ');
}

function formatSignatureGapPhrase(count: number, subjectLabel: string): string {
  const subject = subjectLabel.trim() || 'Tú';
  const verb = subject === 'Tú' ? 'Puedes firmar' : `${subject} puede firmar`;
  const noun = count === 1 ? '1 actividad' : `${count} actividades`;
  const detail =
    count === 1
      ? 'su tramo asignado ya ha terminado'
      : 'sus tramos asignados ya han terminado';

  return `${verb} ${noun}: ${detail}.`;
}

function formatActivityAssociationGapMixedText(
  counts: ActivityAssociationGapCounts,
  context: ActivityAssociationGapBannerContext,
): string {
  const { withoutUsers, withoutSignatures } = counts;
  const sentences: string[] = [];

  if (withoutUsers > 0) {
    sentences.push(formatUsersGapPhrase(withoutUsers));
  }
  const documentText = formatDocumentGapPhrases(
    {
      withoutInvoice: counts.withoutInvoice,
      withoutDeliveryNote: counts.withoutDeliveryNote,
      withoutWorkReport: counts.withoutWorkReport,
    },
    context.viewerIsAdmin === true,
  );
  if (documentText) {
    sentences.push(documentText);
  }
  if (withoutSignatures > 0) {
    sentences.push(formatSignatureGapPhrase(withoutSignatures, context.signatureSubjectLabel));
  }

  return sentences.join(' ');
}

export function formatActivityAssociationGapBanner(
  counts: ActivityAssociationGapCounts,
  from: string,
  to: string,
  context: ActivityAssociationGapBannerContext,
): ActivityAssociationGapBannerContent | null {
  const { total, withoutUsers, withoutDocuments, withoutSignatures } = counts;
  if (total === 0) return null;

  const documentText = formatDocumentGapPhrases(
    {
      withoutInvoice: counts.withoutInvoice,
      withoutDeliveryNote: counts.withoutDeliveryNote,
      withoutWorkReport: counts.withoutWorkReport,
    },
    context.viewerIsAdmin === true,
  );
  const activeGapKinds = [
    withoutUsers > 0,
    withoutDocuments > 0,
    withoutSignatures > 0,
  ].filter(Boolean).length;

  let text: string;

  if (activeGapKinds === 1 && withoutDocuments > 0 && documentText) {
    text = documentText;
  } else if (activeGapKinds === 1) {
    if (withoutUsers > 0) {
      text = formatUsersGapPhrase(withoutUsers);
    } else if (withoutSignatures > 0) {
      text = formatSignatureGapPhrase(withoutSignatures, context.signatureSubjectLabel);
    } else {
      text = documentText;
    }
  } else {
    text = formatActivityAssociationGapMixedText(counts, context);
  }

  return {
    rangeLabel: formatActivityAssociationGapRangeLabel(from, to),
    text,
  };
}

export function formatActivityDocumentGapBanner(
  counts: ActivityDocumentGapCounts,
  from: string,
  to: string,
  viewerIsAdmin: boolean,
): ActivityAssociationGapBannerContent | null {
  const text = formatDocumentGapPhrases(counts, viewerIsAdmin);
  if (!text) return null;

  return {
    rangeLabel: formatActivityAssociationGapRangeLabel(from, to),
    text,
  };
}

export function countActivityDocumentGaps(
  activities: Iterable<Activity>,
  documentsByActivity: Map<string, Document[]>,
  options: ActivityDocumentGapOptions,
): ActivityDocumentGapCounts {
  let withoutInvoice = 0;
  let withoutDeliveryNote = 0;
  let withoutWorkReport = 0;

  for (const activity of activities) {
    const gaps = resolveActivityDocumentGaps(activity, documentsByActivity, options);
    if (gaps.lacksInvoice) withoutInvoice += 1;
    if (gaps.lacksDeliveryNote) withoutDeliveryNote += 1;
    if (gaps.lacksWorkReport) withoutWorkReport += 1;
  }

  return { withoutInvoice, withoutDeliveryNote, withoutWorkReport };
}

export function formatMissingDocumentSummary(
  counts: ActivityDocumentGapCounts,
  viewerIsAdmin: boolean,
): string | null {
  const parts: string[] = [];
  if (viewerIsAdmin && counts.withoutInvoice > 0) {
    parts.push(
      counts.withoutInvoice === 1
        ? '1 sin factura'
        : `${counts.withoutInvoice} sin factura`,
    );
  }
  if (counts.withoutDeliveryNote > 0) {
    parts.push(
      counts.withoutDeliveryNote === 1
        ? '1 sin albarán'
        : `${counts.withoutDeliveryNote} sin albarán`,
    );
  }
  if (!viewerIsAdmin && counts.withoutWorkReport > 0) {
    parts.push(
      counts.withoutWorkReport === 1
        ? '1 sin informe'
        : `${counts.withoutWorkReport} sin informe`,
    );
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
