import type { Activity, CalendarEvent, Document } from '@shared/types';
import {
  activityUsesWorkReport,
  findEventForActivity,
  getActivityAssigneeIds,
  getActivityReportedHours,
  getActivityWorkReportSurfaceStatus,
  getLineItemConceptText,
  getWorkerHoursStatus,
  isShiftCode,
  normalizeActivityAssigneeSlots,
  sumWorkerHoursStatuses,
  SHIFT_META,
  type ActivityWorkReportSurfaceStatus,
  type ShiftCode,
} from '@shared/types';
import { DOCUMENT_STATUS_LABELS } from '@/lib/documentStatus';
import type { ActivityTableContext } from '@/lib/activityTableView';

export function getActivityDocuments(
  activity: Activity,
  ctx: ActivityTableContext,
): Document[] {
  return ctx.documentsByActivityId.get(activity.id) ?? [];
}

export function getActivityAssigneeShifts(
  activity: Activity,
  ctx: ActivityTableContext,
): ShiftCode[] {
  const event = findEventForActivity(activity, ctx.events);
  const slots = normalizeActivityAssigneeSlots(activity, event, ctx.boundaries);
  const shifts: ShiftCode[] = [];
  for (const slot of slots) {
    if (isShiftCode(slot.shift) && !shifts.includes(slot.shift)) {
      shifts.push(slot.shift);
    }
  }
  return shifts;
}

export function getActivityHoursTotals(
  activity: Activity,
  ctx: ActivityTableContext,
): { assignedHours: number; signedHours: number } {
  const event = findEventForActivity(activity, ctx.events);
  const assigneeIds = getActivityAssigneeIds(activity, event);
  if (assigneeIds.length === 0) {
    const fallback = activity.hours ?? 0;
    return { assignedHours: fallback, signedHours: 0 };
  }

  const statuses = assigneeIds.map((userId) =>
    getWorkerHoursStatus(activity, event, userId, ctx.boundaries),
  );
  const totals = sumWorkerHoursStatuses(statuses);
  return {
    assignedHours: totals.assignedHours,
    signedHours: totals.signedHours,
  };
}

export function formatActivityShiftLabels(
  activity: Activity,
  ctx: ActivityTableContext,
): string {
  return getActivityAssigneeShifts(activity, ctx)
    .map((shift) => SHIFT_META[shift]?.label ?? shift)
    .join(', ');
}

export function formatActivityShiftCodes(
  activity: Activity,
  ctx: ActivityTableContext,
): string {
  return getActivityAssigneeShifts(activity, ctx).join(', ');
}

export function getActivityReportedHoursForTable(
  activity: Activity,
  ctx: ActivityTableContext,
): number {
  if (!activityUsesWorkReport(activity, ctx.activityTypes)) return 0;
  return getActivityReportedHours(activity);
}

export function getActivityWorkReportStatusLabel(
  status: ActivityWorkReportSurfaceStatus,
): string {
  if (status === 'submitted') return 'Enviado';
  if (status === 'draft') return 'Borrador';
  return 'Sin informe';
}

export function sumActivityDocumentTotals(documents: Document[]): number {
  return documents.reduce((sum, doc) => sum + doc.total, 0);
}

export function formatActivityDocumentTotals(documents: Document[]): string {
  if (documents.length === 0) return '';
  return `${sumActivityDocumentTotals(documents).toFixed(2)}€`;
}

export function getActivityDocumentStatuses(documents: Document[]): Document['status'][] {
  const statuses: Document['status'][] = [];
  for (const doc of documents) {
    if (!statuses.includes(doc.status)) statuses.push(doc.status);
  }
  return statuses;
}

export function formatActivityDocumentStatuses(documents: Document[]): string {
  return getActivityDocumentStatuses(documents)
    .map((status) => DOCUMENT_STATUS_LABELS[status])
    .join(', ');
}

export function getActivityDocumentConcepts(documents: Document[]): string[] {
  const concepts: string[] = [];
  for (const doc of documents) {
    for (const item of doc.items) {
      const text = getLineItemConceptText(item);
      if (text && !concepts.includes(text)) concepts.push(text);
    }
  }
  return concepts;
}

export function formatActivityDocumentConcepts(documents: Document[]): string {
  return getActivityDocumentConcepts(documents).join(', ');
}
