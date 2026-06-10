import { format, parseISO } from 'date-fns';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  aggregateEventTimeRange,
  buildAssigneeSlotsFromLegacy,
  formatActivityRelativeTime,
  getActivityAssigneeIds,
  getActivityTypeLabel,
  getWorkerHoursStatus,
  getActivityWorkReportSurfaceStatus,
  getActivityReportedHours,
  getActivityWorkReports,
  isActivityPast,
  normalizeActivityAssigneeSlots,
  resolveEventType,
} from '@shared/types';
import type { WorkspaceScheduleShiftBoundaries } from '@shared/types';
import { isPastActivity } from '@/lib/activityUtils';

const HOUR_RANGE_SEPARATOR = ' \u2013 ';
const META_SEPARATOR = ' \u00b7 ';

export function formatActivityHourRange(
  assigneeSlots: ReturnType<typeof normalizeActivityAssigneeSlots>,
  event?: CalendarEvent | null,
): string | null {
  if (assigneeSlots.length > 0) {
    const { startTime, endTime } = aggregateEventTimeRange(assigneeSlots);
    return `${startTime}${HOUR_RANGE_SEPARATOR}${endTime}`;
  }
  if (event?.startTime && event.endTime) {
    return `${event.startTime}${HOUR_RANGE_SEPARATOR}${event.endTime}`;
  }
  if (event?.startTime) {
    return event.startTime;
  }
  return null;
}

export type ActivityPreviewSignatureSummary = {
  assignedTotal: number;
  signedTotal: number;
  signedCount: number;
  assigneeCount: number;
  pendingCount: number;
  awaitingCount: number;
  allSigned: boolean;
};

export type ActivityPreviewWorkReportSummary = {
  status: ReturnType<typeof getActivityWorkReportSurfaceStatus>;
  reportedHours: number;
  submittedCount: number;
  assigneeCount: number;
};

export type ActivityPreviewMeta = {
  clientName: string;
  past: boolean;
  description: string;
  metaPrimary: string;
  metaSecondary: string | null;
  /** Partes de fecha/hora para mostrar en fila o columna segun el ancho. */
  metaDetails: string[];
  assignedUsers: UserAssignee[];
  assigneeSlots: ReturnType<typeof normalizeActivityAssigneeSlots>;
  typeRef: string | undefined;
  linkedDocCount: number;
  linkedDocuments: Document[];
  activityId: string | undefined;
  visibleAssignees: UserAssignee[];
  hiddenAssigneeCount: number;
  signatureSummary: ActivityPreviewSignatureSummary | null;
  workReportSummary: ActivityPreviewWorkReportSummary | null;
};

type BuildActivityPreviewMetaArgs = {
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  boundaries: WorkspaceScheduleShiftBoundaries;
};

export function buildActivityPreviewMeta({
  event,
  activity,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  boundaries,
}: BuildActivityPreviewMetaArgs): ActivityPreviewMeta {
  const clientId = activity?.clientId ?? event.clientId;
  const client = clientId ? clientsMap.get(clientId) : undefined;
  const past = activity ? isPastActivity(activity, events) : isActivityPast({ event });
  const hours = activity?.hours;
  const description = activity?.description ?? event.description ?? event.title;
  const relativeTime = formatActivityRelativeTime({ activity, event });
  const hoursLabel = hours != null && hours > 0 ? `${hours}h` : null;
  const dateLabel = format(parseISO(event.date), 'dd/MM/yyyy');
  const assigneeIds = activity
    ? getActivityAssigneeIds(activity, event)
    : (event.assignedTo ?? []).filter(Boolean);
  const assignedUsers = assigneeIds
    .map((userId) => assigneesById.get(userId))
    .filter((user): user is UserAssignee => user != null);
  const assigneeSlots = activity
    ? normalizeActivityAssigneeSlots(activity, event, boundaries)
    : buildAssigneeSlotsFromLegacy(event, null, boundaries);
  const hourRangeLabel = formatActivityHourRange(assigneeSlots, event);
  const metaPrimary = relativeTime ?? event.startTime ?? dateLabel;
  const metaDetails = relativeTime
    ? [dateLabel, hourRangeLabel, hoursLabel].filter((part): part is string => Boolean(part))
    : (() => {
        const secondary = [hourRangeLabel, hoursLabel].filter((part): part is string =>
          Boolean(part),
        );
        return secondary.length > 0 ? secondary : event.startTime ? [dateLabel] : [];
      })();
  const metaSecondary =
    metaDetails.length > 0 ? metaDetails.join(META_SEPARATOR) : null;
  const typeRef = activity?.type ?? resolveEventType(event.title, activityTypes)?.id;
  const activityId = activity?.id ?? event.activityId;
  const linkedDocuments = activityId ? (documentsByActivity.get(activityId) ?? []) : [];
  const linkedDocCount = linkedDocuments.length;
  const visibleAssignees = assignedUsers.slice(0, 3);
  const hiddenAssigneeCount = Math.max(assignedUsers.length - visibleAssignees.length, 0);
  const signatureSummary =
    activity && assigneeIds.length > 0
      ? (() => {
          const statuses = assigneeIds.map((userId) =>
            getWorkerHoursStatus(activity, event, userId, boundaries),
          );
          const signedCount = statuses.filter((status) => status.isSigned).length;
          const assignedTotal = Math.round(
            statuses.reduce((sum, status) => sum + status.assignedHours, 0) * 10,
          ) / 10;
          const signedTotal = Math.round(
            statuses.reduce((sum, status) => sum + status.signedHours, 0) * 10,
          ) / 10;
          const pendingCount = statuses.filter((status) => status.needsSignature).length;
          const awaitingCount = statuses.filter((status) => status.awaitingSlotEnd).length;
          if (assignedTotal <= 0 && signedTotal <= 0) return null;
          return {
            assignedTotal,
            signedTotal,
            signedCount,
            assigneeCount: assigneeIds.length,
            pendingCount,
            awaitingCount,
            allSigned: pendingCount === 0 && signedCount === assigneeIds.length,
          };
        })()
      : null;

  const workReportSummary =
    activity && past
      ? (() => {
          const reports = getActivityWorkReports(activity);
          const submittedCount = reports.filter((report) => report.status === 'submitted').length;
          return {
            status: getActivityWorkReportSurfaceStatus(activity),
            reportedHours: getActivityReportedHours(activity),
            submittedCount,
            assigneeCount: Math.max(assigneeIds.length, 1),
          };
        })()
      : null;

  return {
    clientName: client?.name || 'Contacto desconocido',
    past,
    description,
    metaPrimary,
    metaSecondary,
    metaDetails,
    assignedUsers,
    assigneeSlots,
    typeRef,
    linkedDocCount,
    linkedDocuments,
    activityId,
    visibleAssignees,
    hiddenAssigneeCount,
    signatureSummary,
    workReportSummary,
  };
}

export function getActivitySidebarListLines(
  meta: ActivityPreviewMeta,
  activityTypes: ActivityType[],
): { clientName: string; summary: string | null; metaLine: string | null } {
  const typeLabel = meta.typeRef ? getActivityTypeLabel(meta.typeRef, activityTypes) : null;
  const description = meta.description.trim();
  const summaryParts = [typeLabel, description].filter((part): part is string => Boolean(part));
  const summary = summaryParts.length > 0 ? summaryParts.join(META_SEPARATOR) : null;
  const metaParts = [meta.metaPrimary, ...meta.metaDetails].filter((part): part is string =>
    Boolean(part),
  );
  const metaLine = metaParts.length > 0 ? metaParts.join(META_SEPARATOR) : null;

  return {
    clientName: meta.clientName,
    summary,
    metaLine,
  };
}

export function formatActivityPreviewWorkReportLabel(
  summary: ActivityPreviewWorkReportSummary,
): string {
  if (summary.status === 'submitted') {
    const hoursLabel =
      summary.reportedHours > 0 ? `${summary.reportedHours}h` : 'Enviado';
    if (summary.submittedCount > 1) {
      return `${hoursLabel} · ${summary.submittedCount}/${summary.assigneeCount}`;
    }
    return hoursLabel;
  }
  if (summary.status === 'draft') return 'Borrador';
  return 'Sin informe';
}

export function formatActivityPreviewWorkReportTitle(
  summary: ActivityPreviewWorkReportSummary,
): string {
  if (summary.status === 'submitted') {
    return `${summary.reportedHours}h en informes enviados · ${summary.submittedCount}/${summary.assigneeCount} operarios`;
  }
  if (summary.status === 'draft') return 'Informe en borrador';
  return 'Sin informe de trabajo enviado';
}

export function formatActivityPreviewSignatureLabel(
  summary: ActivityPreviewSignatureSummary,
): string {
  const hoursLabel = `${summary.signedTotal}/${summary.assignedTotal}h`;
  if (summary.allSigned) return hoursLabel;
  const parts = [hoursLabel];
  if (summary.pendingCount > 0) {
    parts.push(`${summary.pendingCount} pend.`);
  }
  if (summary.awaitingCount > 0 && summary.awaitingCount < summary.pendingCount) {
    parts.push(`${summary.awaitingCount} en curso`);
  }
  return parts.join(' \u00b7 ');
}

export function formatActivityPreviewSignatureTitle(
  summary: ActivityPreviewSignatureSummary,
): string {
  const base = `${summary.signedTotal}h firmadas de ${summary.assignedTotal}h asignadas \u00b7 ${summary.signedCount}/${summary.assigneeCount} operarios con firma`;
  if (summary.pendingCount <= 0) return base;
  const pending = `${summary.pendingCount} pendiente(s)`;
  if (summary.awaitingCount > 0) {
    return `${base} \u00b7 ${pending} (${summary.awaitingCount} en curso)`;
  }
  return `${base} \u00b7 ${pending}`;
}

export function getActivityPreviewSearchHaystack({
  event,
  activity,
  clientsMap,
  activityTypes,
}: {
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
}): string {
  const clientName =
    clientsMap.get(activity?.clientId ?? event.clientId ?? '')?.name ?? '';
  const typeLabel = activity
    ? getActivityTypeLabel(activity.type, activityTypes)
    : (resolveEventType(event.title, activityTypes)?.name ?? '');
  const description = activity?.description ?? event.description ?? event.title;
  return `${clientName} ${typeLabel} ${description}`.toLowerCase();
}

/** Muestra la acción de firma en previsualizaciones (popover, etc.). */
export function canViewerSignActivityHours(
  activity: Activity | undefined,
  event: CalendarEvent,
  viewerUserId: string | undefined,
  boundaries: WorkspaceScheduleShiftBoundaries,
): boolean {
  if (!activity || !viewerUserId) return false;
  const assigneeIds = getActivityAssigneeIds(activity, event);
  if (!assigneeIds.includes(viewerUserId)) return false;
  return getWorkerHoursStatus(activity, event, viewerUserId, boundaries).needsSignature;
}

export function matchesActivityPreviewSearch(
  params: {
    event: CalendarEvent;
    activity: Activity | undefined;
    clientsMap: Map<string, Client>;
    activityTypes: ActivityType[];
  },
  searchTerm: string,
): boolean {
  const term = searchTerm.toLowerCase().trim();
  if (!term) return true;

  const tokens = term.split(/\s+/).filter(Boolean);
  const haystack = getActivityPreviewSearchHaystack(params);
  return tokens.every((token) => haystack.includes(token));
}
