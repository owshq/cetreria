import { getLineItemConceptText } from './documentConcepts.js';
import {
  formatDocumentAmount,
  normalizeDocumentLineItem,
  resolveDocumentTotals,
} from './documents.js';
import type { Document, DocumentLineItem } from './types.js';

export const INVOICE_REQUIRES_DELIVERY_NOTE_ERROR =
  'No se puede vincular una factura sin albaran en la misma actividad.';

export const DELIVERY_NOTE_REQUIRED_BY_INVOICE_ERROR =
  'No se puede desvincular o eliminar el albaran mientras haya una factura en la misma actividad.';

export const ACTIVITY_INVOICE_WITHOUT_DELIVERY_NOTE_BANNER =
  'Hay una factura vinculada sin albaran. Desvincula la factura o genera el albaran antes de continuar.';

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
  return (
    getDocumentsEffectiveForActivity(documents, activityId, pendingLinkIds).find(
      (doc) => doc.type === 'delivery-note',
    ) ?? null
  );
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
  const mismatches: InvoiceDeliveryNoteMismatch[] = [];

  if (invoice.items.length !== deliveryNote.items.length) {
    mismatches.push({
      code: 'line_count',
      message: `La factura tiene ${invoice.items.length} lineas y el albaran ${deliveryNote.items.length}.`,
    });
  }

  const invoiceQuantities = buildLineQuantityMap(invoice.items);
  const deliveryQuantities = buildLineQuantityMap(deliveryNote.items);
  if (!mapsMatchQuantities(invoiceQuantities, deliveryQuantities)) {
    mismatches.push({
      code: 'quantities',
      message: 'Las cantidades de las lineas no coinciden entre factura y albaran.',
    });
  }

  const invoiceTotals = resolveDocumentTotals(invoice);
  const deliveryTotals = resolveDocumentTotals(deliveryNote);

  if (
    deliveryTotals.subtotal > MONEY_TOLERANCE &&
    Math.abs(invoiceTotals.subtotal - deliveryTotals.subtotal) > MONEY_TOLERANCE
  ) {
    mismatches.push({
      code: 'subtotal',
      message: `Base imponible distinta (factura ${formatDocumentAmount(invoiceTotals.subtotal)}, albaran ${formatDocumentAmount(deliveryTotals.subtotal)}).`,
    });
  }

  if (
    deliveryTotals.total > MONEY_TOLERANCE &&
    Math.abs(invoiceTotals.total - deliveryTotals.total) > MONEY_TOLERANCE
  ) {
    mismatches.push({
      code: 'total',
      message: `Total distinto (factura ${formatDocumentAmount(invoiceTotals.total)}, albaran ${formatDocumentAmount(deliveryTotals.total)}).`,
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
