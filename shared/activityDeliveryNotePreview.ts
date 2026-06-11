import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  DocumentLineItem,
} from './types.js';
import {
  activityTypeCreatesDeliveryNote,
  getActivityTypeLabel,
} from './activityTypes.js';
import {
  buildActivityDeliveryNoteItemsForWorker,
  getActivityWorkReportExtraItems,
  getSubmittedActivityWorkReports,
  type ActivityWorkReport,
  workedMinutesToHours,
} from './activityWorkReport.js';
import { formatHoursMinutes } from './formatHoursMinutes.js';
import { getLineItemConceptText } from './documentConcepts.js';
import {
  billingAddressFromClient,
  computeDocumentTotals,
  normalizeDocumentLineItem,
} from './documents.js';
import { DEFAULT_DOCUMENT_TAX_RATE } from './workspaceBilling.js';

export { activityTypeCreatesDeliveryNote };

export type ActivityDeliveryNotePreviewPendingReport = {
  userId: string;
  userName: string;
  workedMinutes: number;
  notes?: string;
};

export type BuildActivityDeliveryNotePreviewOptions = {
  activity: Activity;
  activityTypes: readonly ActivityType[];
  client: Client;
  workspaceId: string;
  defaultTaxRate?: number;
  existingDeliveryNote?: Document | null;
  extraItemsOverride?: readonly DocumentLineItem[];
  pendingReport?: ActivityDeliveryNotePreviewPendingReport | null;
  event?: CalendarEvent | null;
  /** Albaran de un operario concreto. */
  workerUserId?: string;
  /** Permite previsualizar el albaran aunque aun no haya lineas (solo operario/extras). */
  allowEmptyPreview?: boolean;
};

function buildHourLineItemsFromReports(
  reports: readonly Pick<ActivityWorkReport, 'userName' | 'workedMinutes' | 'notes'>[],
  serviceLabel: string,
): DocumentLineItem[] {
  const label = serviceLabel.trim() || 'Servicio';
  return reports
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

export function buildActivityDeliveryNotePreviewItems(
  activity: Activity,
  activityTypes: readonly ActivityType[],
  options?: {
    extraItemsOverride?: readonly DocumentLineItem[];
    pendingReport?: ActivityDeliveryNotePreviewPendingReport | null;
  },
): DocumentLineItem[] {
  const serviceLabel = getActivityTypeLabel(activity.type, activityTypes as ActivityType[]);
  const submitted = getSubmittedActivityWorkReports(activity);
  const pendingUserId = options?.pendingReport?.userId;
  const reportsForLines = submitted.filter((report) => report.userId !== pendingUserId);

  if (options?.pendingReport && options.pendingReport.workedMinutes > 0) {
    reportsForLines.push({
      userId: options.pendingReport.userId,
      userName: options.pendingReport.userName,
      status: 'submitted',
      workedMinutes: options.pendingReport.workedMinutes,
      notes: options.pendingReport.notes,
      updatedAt: new Date().toISOString(),
    });
  }

  const hourItems = buildHourLineItemsFromReports(reportsForLines, serviceLabel);
  const extraItems = (options?.extraItemsOverride ?? getActivityWorkReportExtraItems(activity))
    .map(normalizeDocumentLineItem)
    .filter((item) => Boolean(getLineItemConceptText(item)));

  return [...hourItems, ...extraItems];
}

export function buildActivityDeliveryNotePreviewDocument(
  options: BuildActivityDeliveryNotePreviewOptions,
): Document | null {
  const activityType =
    options.activityTypes.find(
      (type) => type.id === options.activity.type || type.name === options.activity.type,
    ) ?? null;

  if (!activityTypeCreatesDeliveryNote(activityType)) {
    return null;
  }

  const billingAddress = billingAddressFromClient(options.client);
  if (!billingAddress.email?.trim()) {
    return null;
  }

  const serviceLabel = getActivityTypeLabel(
    options.activity.type,
    options.activityTypes as ActivityType[],
  );
  const items = options.workerUserId
    ? buildActivityDeliveryNoteItemsForWorker(
        options.activity,
        serviceLabel,
        options.workerUserId,
        options.event,
      )
    : buildActivityDeliveryNotePreviewItems(options.activity, options.activityTypes, {
        extraItemsOverride: options.extraItemsOverride,
        pendingReport: options.pendingReport,
      });

  const allowEmptyPreview =
    options.allowEmptyPreview === true &&
    Boolean(options.workerUserId) &&
    !options.existingDeliveryNote;

  if (items.length === 0 && !allowEmptyPreview) {
    return null;
  }

  const taxRate =
    options.existingDeliveryNote?.taxRate ??
    (Number.isFinite(options.defaultTaxRate) ? options.defaultTaxRate! : DEFAULT_DOCUMENT_TAX_RATE);
  const totals = computeDocumentTotals(items, taxRate);

  const defaultNotes =
    options.workerUserId && items.length === 0
      ? 'Albaran pendiente del informe de trabajo del operario.'
      : 'Albaran generado automaticamente a partir de los informes de trabajo.';

  const notes = [
    options.existingDeliveryNote?.notes?.trim() || defaultNotes,
    options.activity.description.trim() || undefined,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    id: options.existingDeliveryNote?.id ?? 'delivery-note-preview',
    workspaceId: options.workspaceId,
    type: 'delivery-note',
    number: options.existingDeliveryNote?.number ?? 'BORRADOR',
    clientId: options.activity.clientId,
    activityId: options.activity.id,
    workerUserId: options.existingDeliveryNote?.workerUserId ?? options.workerUserId,
    date: options.activity.date,
    items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes,
    billingAddress,
    status: options.existingDeliveryNote?.status ?? 'sent',
    templateId: options.existingDeliveryNote?.templateId,
    templateColor: options.existingDeliveryNote?.templateColor,
    createdAt: options.existingDeliveryNote?.createdAt ?? new Date().toISOString(),
  };
}
