import { getLineItemConceptText } from './documentConcepts.js';
import {
  computeDocumentTotals,
  formatDocumentAmount,
  normalizeDocumentLineItem,
  resolveDocumentTotals,
} from './documents.js';
import {
  activityTypeUsesWorkReport,
  resolveActivityType,
} from './activityTypes.js';
import {
  formatActivityInvoiceDeliveryNoteBlockReason,
  formatActivityInvoiceWorkReportBlockReason,
  type WorkReportAssigneeNameLookup,
} from './activityWorkReport.js';
import type { Activity, ActivityType, CalendarEvent, Document, DocumentLineItem } from './types.js';

export const INVOICE_REQUIRES_DELIVERY_NOTE_ERROR =
  'No se puede vincular una factura sin albaran en la misma actividad.';

export const ACTIVITY_SINGLE_INVOICE_ERROR =
  'Solo puede haber una factura vinculada a esta actividad.';

export const DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR =
  'No se puede desvincular o eliminar el albaran mientras haya una factura en la misma actividad.';

export const ACTIVITY_INVOICE_WITHOUT_DELIVERY_NOTE_BANNER =
  'Hay una factura vinculada sin albaran. Desvincula la factura o genera el albaran antes de continuar.';

export const INVOICE_DELIVERY_NOTES_OUT_OF_SYNC_SUMMARY =
  'La factura no coincide con los albaranes: ha habido cambios. Recarga desde albaranes para actualizar las lineas.';

export const ACTIVITY_INVOICE_ZERO_HOUR_PRICE_WARNING =
  'Hay lineas de horas con precio 0 en los albaranes. Revisa los precios antes de emitir la factura.';

export type ActivityInvoiceWithoutDeliveryNoteViolation = {
  activityId: string;
  invoices: Document[];
};

export type InvoiceDeliveryNoteMismatch = {
  code: 'line_count' | 'quantities' | 'subtotal' | 'total';
  message: string;
};

const QUANTITY_TOLERANCE = 0.01;
const MONEY_TOLERANCE = 0.01;

function lineQuantityKey(item: DocumentLineItem): string | null {
  const normalized = normalizeDocumentLineItem(item);
  const concept = getLineItemConceptText(normalized).toLowerCase();
  const description = normalized.description.trim().toLowerCase();
  if (!concept && !description) return null;
  return description ? `${concept}|${description}` : concept;
}

function buildLineQuantityMap(items: readonly DocumentLineItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = lineQuantityKey(item);
    if (!key) continue;
    const normalized = normalizeDocumentLineItem(item);
    map.set(key, (map.get(key) ?? 0) + normalized.quantity);
  }
  return map;
}

function mapsMatchQuantities(
  left: Map<string, number>,
  right: Map<string, number>,
): boolean {
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    const delta = Math.abs((left.get(key) ?? 0) - (right.get(key) ?? 0));
    if (delta > QUANTITY_TOLERANCE) return false;
  }
  return true;
}

export function getDocumentsEffectiveForActivity(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
  excludeDocumentId?: string,
): Document[] {
  const pending = new Set(pendingLinkIds ?? []);
  return documents.filter((doc) => {
    if (doc.id === excludeDocumentId) return false;
    return doc.activityId === activityId || pending.has(doc.id);
  });
}

export function activityHasLinkedDeliveryNoteForPair(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
  excludeDocumentId?: string,
): boolean {
  return getDocumentsEffectiveForActivity(
    documents,
    activityId,
    pendingLinkIds,
    excludeDocumentId,
  ).some((doc) => doc.type === 'delivery-note');
}

export function activityHasLinkedInvoiceForPair(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
  excludeDocumentId?: string,
): boolean {
  return getDocumentsEffectiveForActivity(
    documents,
    activityId,
    pendingLinkIds,
    excludeDocumentId,
  ).some((doc) => doc.type === 'invoice');
}

export function findActivityInvoiceForPair(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
): Document | null {
  return (
    getDocumentsEffectiveForActivity(documents, activityId, pendingLinkIds).find(
      (doc) => doc.type === 'invoice',
    ) ?? null
  );
}

export function findActivityDeliveryNoteForPair(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
): Document | null {
  return findActivityDeliveryNotesForPair(documents, activityId, pendingLinkIds)[0] ?? null;
}

export function findActivityDeliveryNotesForPair(
  documents: readonly Document[],
  activityId: string,
  pendingLinkIds?: readonly string[],
): Document[] {
  return getDocumentsEffectiveForActivity(documents, activityId, pendingLinkIds).filter(
    (doc) => doc.type === 'delivery-note',
  );
}

export function validateSingleActivityInvoice(
  documents: readonly Document[],
  activityId: string | undefined,
  pendingLinkIds?: readonly string[],
  options?: {
    excludeDocumentId?: string;
    addingInvoice?: boolean;
  },
): string | null {
  if (!activityId) return null;

  if (pendingLinkIds) {
    const invoiceCount = documents.filter(
      (doc) => doc.type === 'invoice' && pendingLinkIds.includes(doc.id),
    ).length;
    return invoiceCount > 1 ? ACTIVITY_SINGLE_INVOICE_ERROR : null;
  }

  const effective = getDocumentsEffectiveForActivity(
    documents,
    activityId,
    pendingLinkIds,
    options?.excludeDocumentId,
  );
  const invoiceCount = effective.filter((doc) => doc.type === 'invoice').length;
  const total = invoiceCount + (options?.addingInvoice ? 1 : 0);
  return total > 1 ? ACTIVITY_SINGLE_INVOICE_ERROR : null;
}

export function aggregateDeliveryNoteLineItems(
  deliveryNotes: readonly Document[],
): DocumentLineItem[] {
  return deliveryNotes.flatMap((doc) => doc.items.map(normalizeDocumentLineItem));
}

/** Conceptos para factura: suma de lineas de todos los albaranes de la actividad. */
export function buildInvoiceItemsFromDeliveryNotes(
  deliveryNotes: readonly Document[],
): DocumentLineItem[] {
  return aggregateDeliveryNoteLineItems(deliveryNotes);
}

/** true si alguna linea agregada de albaranes tiene cantidad > 0 y precio 0. */
export function deliveryNotesHaveZeroPricedHourLines(
  deliveryNotes: readonly Document[],
): boolean {
  const items = aggregateDeliveryNoteLineItems(deliveryNotes);
  return items.some((item) => {
    const normalized = normalizeDocumentLineItem(item);
    return normalized.quantity > 0 && normalized.price === 0;
  });
}

export type DeliveryNotesAggregateTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
  lineCount: number;
};

/** Totales agregados de todos los albaranes vinculados (base para la factura). */
export function resolveDeliveryNotesAggregateTotals(
  deliveryNotes: readonly Document[],
): DeliveryNotesAggregateTotals {
  const items = buildInvoiceItemsFromDeliveryNotes(deliveryNotes);
  if (items.length === 0) {
    return { subtotal: 0, taxAmount: 0, total: 0, lineCount: 0 };
  }
  const taxRate = deliveryNotes.find((doc) => doc.taxRate != null)?.taxRate;
  const totals = computeDocumentTotals([...items], taxRate);
  return {
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    lineCount: items.length,
  };
}

export function validateActivityInvoiceRequiresDeliveryNote(
  documents: readonly Document[],
  activityId: string | undefined,
  pendingLinkIds?: readonly string[],
  options?: {
    excludeDocumentId?: string;
    /** Factura que se crea o vincula en esta operacion. */
    includesInvoice?: boolean;
  },
): string | null {
  if (!activityId) return null;

  const effective = getDocumentsEffectiveForActivity(
    documents,
    activityId,
    pendingLinkIds,
    options?.excludeDocumentId,
  );
  const hasInvoice =
    options?.includesInvoice === true || effective.some((doc) => doc.type === 'invoice');
  if (!hasInvoice) return null;

  const hasDeliveryNote = effective.some((doc) => doc.type === 'delivery-note');
  return hasDeliveryNote ? null : INVOICE_REQUIRES_DELIVERY_NOTE_ERROR;
}

export function validateRemovingDeliveryNoteFromActivity(
  documents: readonly Document[],
  activityId: string | undefined,
  removingDeliveryNoteId: string,
): string | null {
  if (!activityId) return null;
  if (
    !activityHasLinkedInvoiceForPair(documents, activityId, undefined, removingDeliveryNoteId)
  ) {
    return null;
  }
  if (
    activityHasLinkedDeliveryNoteForPair(
      documents,
      activityId,
      undefined,
      removingDeliveryNoteId,
    )
  ) {
    return null;
  }
  return DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR;
}

export function getActivityInvoiceWithoutDeliveryNoteBanner(
  documents: readonly Document[],
  activityId: string | undefined,
): string | null {
  if (!activityId) return null;
  const effective = getDocumentsEffectiveForActivity(documents, activityId);
  const hasInvoice = effective.some((doc) => doc.type === 'invoice');
  const hasDeliveryNote = effective.some((doc) => doc.type === 'delivery-note');
  if (hasInvoice && !hasDeliveryNote) {
    return ACTIVITY_INVOICE_WITHOUT_DELIVERY_NOTE_BANNER;
  }
  return null;
}

export function listActivitiesWithInvoiceWithoutDeliveryNote(
  documents: readonly Document[],
): ActivityInvoiceWithoutDeliveryNoteViolation[] {
  const byActivity = new Map<string, Document[]>();

  for (const doc of documents) {
    if (!doc.activityId || (doc.type !== 'invoice' && doc.type !== 'delivery-note')) continue;
    const linked = byActivity.get(doc.activityId) ?? [];
    linked.push(doc);
    byActivity.set(doc.activityId, linked);
  }

  const violations: ActivityInvoiceWithoutDeliveryNoteViolation[] = [];
  for (const [activityId, linked] of byActivity) {
    const invoices = linked.filter((doc) => doc.type === 'invoice');
    const hasDeliveryNote = linked.some((doc) => doc.type === 'delivery-note');
    if (invoices.length > 0 && !hasDeliveryNote) {
      violations.push({ activityId, invoices });
    }
  }

  return violations.sort((a, b) => a.activityId.localeCompare(b.activityId));
}

export function detectInvoiceDeliveryNoteMismatches(
  invoice: Document,
  deliveryNote: Document,
): InvoiceDeliveryNoteMismatch[] {
  return detectInvoiceAgainstAggregatedItems(invoice, deliveryNote.items);
}

export function detectInvoiceActivityDeliveryNotesMismatches(
  invoice: Document,
  deliveryNotes: readonly Document[],
): InvoiceDeliveryNoteMismatch[] {
  return detectInvoiceAgainstAggregatedItems(
    invoice,
    aggregateDeliveryNoteLineItems(deliveryNotes),
  );
}

function detectInvoiceAgainstAggregatedItems(
  invoice: Document,
  deliveryItems: readonly DocumentLineItem[],
): InvoiceDeliveryNoteMismatch[] {
  const mismatches: InvoiceDeliveryNoteMismatch[] = [];

  if (invoice.items.length !== deliveryItems.length) {
    mismatches.push({
      code: 'line_count',
      message: `La factura tiene ${invoice.items.length} lineas y los albaranes ${deliveryItems.length}.`,
    });
  }

  const invoiceQuantities = buildLineQuantityMap(invoice.items);
  const deliveryQuantities = buildLineQuantityMap(deliveryItems);
  if (!mapsMatchQuantities(invoiceQuantities, deliveryQuantities)) {
    mismatches.push({
      code: 'quantities',
      message: 'Las cantidades de las lineas no coinciden entre factura y albaranes.',
    });
  }

  const invoiceTotals = resolveDocumentTotals(invoice);
  const deliveryTotals = resolveDocumentTotals({
    ...invoice,
    items: [...deliveryItems],
  });

  if (
    deliveryTotals.subtotal > MONEY_TOLERANCE &&
    Math.abs(invoiceTotals.subtotal - deliveryTotals.subtotal) > MONEY_TOLERANCE
  ) {
    mismatches.push({
      code: 'subtotal',
      message: `Base imponible distinta (factura ${formatDocumentAmount(invoiceTotals.subtotal)}, albaranes ${formatDocumentAmount(deliveryTotals.subtotal)}).`,
    });
  }

  if (
    deliveryTotals.total > MONEY_TOLERANCE &&
    Math.abs(invoiceTotals.total - deliveryTotals.total) > MONEY_TOLERANCE
  ) {
    mismatches.push({
      code: 'total',
      message: `Total distinto (factura ${formatDocumentAmount(invoiceTotals.total)}, albaranes ${formatDocumentAmount(deliveryTotals.total)}).`,
    });
  }

  return mismatches;
}

export function formatInvoiceDeliveryNoteMismatchBanner(
  invoice: Document,
  deliveryNote: Document,
): string | null {
  const mismatches = detectInvoiceDeliveryNoteMismatches(invoice, deliveryNote);
  if (mismatches.length === 0) return null;
  return mismatches.map((item) => item.message).join(' ');
}

export function formatInvoiceActivityDeliveryNotesMismatchBanner(
  invoice: Document,
  deliveryNotes: readonly Document[],
): string | null {
  const mismatches = detectInvoiceActivityDeliveryNotesMismatches(invoice, deliveryNotes);
  if (mismatches.length === 0) return null;
  return mismatches.map((item) => item.message).join(' ');
}

export function invoiceMatchesActivityDeliveryNotes(
  invoice: Document,
  deliveryNotes: readonly Document[],
): boolean {
  return detectInvoiceActivityDeliveryNotesMismatches(invoice, deliveryNotes).length === 0;
}

export function getInvoiceDeliveryNotesMismatchTooltip(
  invoice: Document,
  deliveryNotes: readonly Document[],
): string | null {
  const detail = formatInvoiceActivityDeliveryNotesMismatchBanner(invoice, deliveryNotes);
  if (!detail) return null;
  return `${INVOICE_DELIVERY_NOTES_OUT_OF_SYNC_SUMMARY} ${detail}`;
}

/** Valida vincular un documento a una actividad (mensajes detallados para facturas). */
export function validateDocumentActivityLink(
  document: Pick<Document, 'id' | 'type' | 'clientId'>,
  activity: Activity,
  documents: readonly Document[],
  options?: {
    event?: CalendarEvent | null;
    activityTypes?: readonly ActivityType[];
    assigneeNamesById?: WorkReportAssigneeNameLookup;
  },
): string | null {
  if (activity.clientId !== document.clientId) {
    return 'La actividad no pertenece al mismo contacto';
  }
  if (document.type !== 'invoice') return null;

  const deliveryError = validateActivityInvoiceRequiresDeliveryNote(
    documents,
    activity.id,
    undefined,
    {
      excludeDocumentId: document.id,
      includesInvoice: true,
    },
  );
  if (deliveryError) return deliveryError;

  const singleInvoiceError = validateSingleActivityInvoice(documents, activity.id, undefined, {
    excludeDocumentId: document.id,
    addingInvoice: true,
  });
  if (singleInvoiceError) return singleInvoiceError;

  const activityTypes = options?.activityTypes ?? [];
  const resolvedType = resolveActivityType(activity.type, activityTypes);
  if (!activityTypeUsesWorkReport(resolvedType)) return null;

  const event = options?.event ?? null;
  const assigneeNamesById = options?.assigneeNamesById;

  const workReportReason = formatActivityInvoiceWorkReportBlockReason(
    activity,
    event,
    assigneeNamesById,
  );
  if (workReportReason) return workReportReason;

  const deliveryNoteReason = formatActivityInvoiceDeliveryNoteBlockReason(
    activity,
    event,
    documents,
    assigneeNamesById,
  );
  if (deliveryNoteReason) return deliveryNoteReason;

  return null;
}
