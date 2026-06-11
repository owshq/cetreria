import type { Activity, Document, DocumentLineItem, InvoiceConceptSetting } from './types.js';
import { findActivityDeliveryNoteForWorker } from './activityWorkReport.js';
import { isDateInRange } from './dateRange.js';
import {
  computeDocumentTotals,
  isBillableDocumentType,
  normalizeDocumentLineItem,
} from './documents.js';
import { DEFAULT_DOCUMENT_TAX_RATE } from './workspaceBilling.js';

export interface DocumentConceptSummary {
  description: string;
  normalizedKey: string;
  totalAmount: number;
  totalQuantity: number;
  invoiceCount: number;
  lineCount: number;
}

export type ClientScope = 'all' | string | readonly string[];

export const DEFAULT_CONCEPT_EMOJI = '🧾';

export function getInvoiceConceptLabel(
  setting: Pick<InvoiceConceptSetting, 'label' | 'normalizedKey'>,
): string {
  const label = setting.label?.trim();
  if (label) return label;
  return setting.normalizedKey.trim();
}

export function normalizeConceptKey(text: string): string {
  return text.trim().toLowerCase();
}

/** Texto del concepto de una línea (campo `name`; fallback a `description` en datos antiguos). */
export function getLineItemConceptText(
  item: Pick<DocumentLineItem, 'name' | 'description'>,
): string {
  return item.name?.trim() || item.description?.trim() || '';
}

export function resolveConceptEmoji(
  normalizedKey: string,
  settings: readonly Pick<InvoiceConceptSetting, 'normalizedKey' | 'emoji'>[],
): string {
  const match = settings.find((setting) => setting.normalizedKey === normalizedKey);
  return match?.emoji ?? DEFAULT_CONCEPT_EMOJI;
}

export function normalizeInvoiceConceptDefaultPrice(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

export function resolveInvoiceConceptDefaultPrice(
  normalizedKey: string,
  settings: readonly Pick<InvoiceConceptSetting, 'normalizedKey' | 'defaultPrice'>[],
): number {
  const key = normalizeConceptKey(normalizedKey);
  if (!key) return 0;
  const match = settings.find((setting) => setting.normalizedKey === key);
  return match ? normalizeInvoiceConceptDefaultPrice(match.defaultPrice) : 0;
}

export function matchesClientScope(
  entityClientId: string,
  scope: ClientScope = 'all',
): boolean {
  if (scope === 'all') return true;
  if (Array.isArray(scope)) return scope.length === 0 || scope.includes(entityClientId);
  return entityClientId === scope;
}

/** Ámbito efectivo para métricas/exportación: un cliente, una selección o todos. */
export function resolveClientScope(
  selectedClientIds: readonly string[],
  singleClientId?: string,
): ClientScope {
  if (singleClientId) return singleClientId;
  if (selectedClientIds.length > 0) return selectedClientIds;
  return 'all';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Base imponible de una línea (sin IVA). Usar solo para métricas de total neto. */
export function lineItemNetAmount(item: { quantity: number; price: number }): number {
  return item.quantity * item.price;
}

/** @deprecated Usar {@link lineItemNetAmount} para base o {@link lineItemGrossAmount} para importe con IVA. */
export function lineItemAmount(item: { quantity: number; price: number }): number {
  return lineItemNetAmount(item);
}

/** Importe de línea con IVA, prorrateado según subtotal/total calculados del documento. */
export function lineItemGrossAmount(
  doc: Pick<Document, 'items' | 'subtotal' | 'taxRate' | 'taxAmount' | 'total'>,
  item: { quantity: number; price: number },
): number {
  const net = lineItemNetAmount(item);
  const items = doc.items.map(normalizeDocumentLineItem);
  const taxRate = doc.taxRate ?? DEFAULT_DOCUMENT_TAX_RATE;
  const totals = computeDocumentTotals(items, taxRate);

  if (totals.subtotal <= 0) {
    return roundMoney(net * (1 + taxRate / 100));
  }

  return roundMoney((net / totals.subtotal) * totals.total);
}

/** Concepto reutilizable extraído de líneas de factura/albarán en todo el workspace. */
export interface DocumentConceptOption {
  description: string;
  normalizedKey: string;
  lineCount: number;
}

/** Lista única de conceptos usados en facturas y albaranes (sin filtro de fechas). */
export function collectDocumentConcepts(
  documents: readonly Document[],
): DocumentConceptOption[] {
  const map = new Map<string, { display: string; lineCount: number }>();

  for (const doc of documents) {
    if (!isBillableDocumentType(doc.type)) continue;

    for (const item of doc.items) {
      const conceptText = getLineItemConceptText(item);
      const key = normalizeConceptKey(conceptText);
      if (!key) continue;

      const existing = map.get(key);
      if (existing) {
        existing.lineCount += 1;
      } else {
        map.set(key, {
          display: conceptText,
          lineCount: 1,
        });
      }
    }
  }

  return mapToDocumentConceptOptions(map);
}

/** Catálogo para buscadores: documentos, ajustes del workspace y etiquetas extra. */
export function buildDocumentConceptCatalog(
  documents: readonly Document[],
  settings: readonly Pick<InvoiceConceptSetting, 'label' | 'normalizedKey'>[] = [],
  extraLabels: readonly string[] = [],
): DocumentConceptOption[] {
  const map = new Map<string, { display: string; lineCount: number }>();

  for (const option of collectDocumentConcepts(documents)) {
    map.set(option.normalizedKey, {
      display: option.description,
      lineCount: option.lineCount,
    });
  }

  for (const label of extraLabels) {
    const trimmed = label.trim();
    const key = normalizeConceptKey(trimmed);
    if (!key || map.has(key)) continue;
    map.set(key, { display: trimmed, lineCount: 0 });
  }

  for (const setting of settings) {
    const label = getInvoiceConceptLabel(setting);
    const key = normalizeConceptKey(label);
    if (!key || map.has(key)) continue;
    map.set(key, { display: label, lineCount: 0 });
  }

  return mapToDocumentConceptOptions(map);
}

function mapToDocumentConceptOptions(
  map: Map<string, { display: string; lineCount: number }>,
): DocumentConceptOption[] {
  return Array.from(map.entries())
    .map(([normalizedKey, data]) => ({
      description: data.display,
      normalizedKey,
      lineCount: data.lineCount,
    }))
    .sort(
      (a, b) =>
        b.lineCount - a.lineCount || a.description.localeCompare(b.description, 'es'),
    );
}

/** Documentos vinculados a actividades por activityId (sin filtro por document.date). */
export function documentsLinkedToActivities(
  documents: readonly Document[],
  activities: readonly Pick<Activity, 'id'>[],
  clientScope: ClientScope = 'all',
): Document[] {
  const activityIds = new Set(activities.map((activity) => activity.id));
  return documents.filter(
    (document) =>
      Boolean(document.activityId) &&
      activityIds.has(document.activityId!) &&
      matchesClientScope(document.clientId, clientScope),
  );
}

export function summarizeDocumentConcepts(
  documents: readonly Document[],
  types: readonly Document['type'][],
): DocumentConceptSummary[] {
  const typeSet = new Set(types);
  const scopedDocuments = documents.filter((doc) => typeSet.has(doc.type));

  const map = new Map<
    string,
    {
      display: string;
      totalAmount: number;
      totalQuantity: number;
      invoiceIds: Set<string>;
      lineCount: number;
    }
  >();

  for (const doc of scopedDocuments) {
    for (const item of doc.items) {
      const conceptText = getLineItemConceptText(item);
      const key = normalizeConceptKey(conceptText);
      if (!key) continue;

      const amount = lineItemGrossAmount(doc, item);
      const existing = map.get(key);

      if (existing) {
        existing.totalAmount += amount;
        existing.totalQuantity += item.quantity;
        existing.invoiceIds.add(doc.id);
        existing.lineCount += 1;
      } else {
        map.set(key, {
          display: conceptText,
          totalAmount: amount,
          totalQuantity: item.quantity,
          invoiceIds: new Set([doc.id]),
          lineCount: 1,
        });
      }
    }
  }

  return Array.from(map.entries())
    .map(([normalizedKey, data]) => ({
      description: data.display,
      normalizedKey,
      totalAmount: data.totalAmount,
      totalQuantity: data.totalQuantity,
      invoiceCount: data.invoiceIds.size,
      lineCount: data.lineCount,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

/** Conceptos de factura emitidos dentro del periodo (informes financieros). */
export function aggregateDocumentConcepts(
  documents: readonly Document[],
  from: string,
  to: string,
  types: readonly Document['type'][],
  clientScope: ClientScope = 'all',
): DocumentConceptSummary[] {
  const typeSet = new Set(types);
  const periodDocuments = documents.filter(
    (doc) =>
      typeSet.has(doc.type) &&
      isDateInRange(doc.date, from, to) &&
      matchesClientScope(doc.clientId, clientScope),
  );

  return summarizeDocumentConcepts(periodDocuments, types);
}

export function aggregateInvoiceConcepts(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): DocumentConceptSummary[] {
  return aggregateDocumentConcepts(documents, from, to, ['invoice'], clientScope);
}

export function aggregateDeliveryNoteConcepts(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): DocumentConceptSummary[] {
  return aggregateDocumentConcepts(documents, from, to, ['delivery-note'], clientScope);
}

/** Conceptos facturados de documentos vinculados a actividades del periodo. */
export function invoiceConceptsForActivities(
  documents: readonly Document[],
  activities: readonly Pick<Activity, 'id'>[],
  clientScope: ClientScope = 'all',
): DocumentConceptSummary[] {
  const linkedInvoices = documentsLinkedToActivities(documents, activities, clientScope).filter(
    (document) => document.type === 'invoice',
  );
  return summarizeDocumentConcepts(linkedInvoices, ['invoice']);
}

/** Conceptos pendientes/no facturados de albaranes vinculados a actividades del periodo. */
export function deliveryNoteConceptsForActivities(
  documents: readonly Document[],
  activities: readonly Pick<Activity, 'id'>[],
  clientScope: ClientScope = 'all',
): DocumentConceptSummary[] {
  const linkedNotes = documentsLinkedToActivities(documents, activities, clientScope).filter(
    (document) => document.type === 'delivery-note',
  );
  return summarizeDocumentConcepts(linkedNotes, ['delivery-note']);
}

export type DeliveryNotesForActivitiesOptions = {
  workerUserId?: string;
  clientScope?: ClientScope;
};

/** Albaranes vinculados a actividades del periodo (eje activity.id). */
export function deliveryNotesForActivities(
  activities: readonly Activity[],
  documents: readonly Document[],
  options: DeliveryNotesForActivitiesOptions = {},
): Document[] {
  const { workerUserId, clientScope = 'all' } = options;
  const notes: Document[] = [];
  const seen = new Set<string>();

  for (const activity of activities) {
    const note = workerUserId
      ? findActivityDeliveryNoteForWorker(activity.id, workerUserId, documents, activity)
      : documentsLinkedToActivities(documents, [activity], clientScope).find(
          (document) => document.type === 'delivery-note',
        ) ?? null;

    if (!note || seen.has(note.id)) continue;
    if (!matchesClientScope(note.clientId, clientScope)) continue;
    seen.add(note.id);
    notes.push(note);
  }

  return notes.sort((left, right) => left.date.localeCompare(right.date));
}

/** Facturas vinculadas a actividades del periodo por activityId. */
export function invoicesForActivities(
  activities: readonly Pick<Activity, 'id'>[],
  documents: readonly Document[],
  clientScope: ClientScope = 'all',
): Document[] {
  return documentsLinkedToActivities(documents, activities, clientScope).filter(
    (document) => document.type === 'invoice',
  );
}

export function getTopInvoiceConcept(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): DocumentConceptSummary | null {
  const concepts = aggregateInvoiceConcepts(documents, from, to, clientScope);
  return concepts[0] ?? null;
}

export interface ConceptDocumentEntry {
  document: Document;
  conceptAmount: number;
  conceptQuantity: number;
}

export interface ConceptClientBreakdown {
  clientId: string;
  totalAmount: number;
  totalQuantity: number;
  invoiceCount: number;
}

/** Facturas del periodo que incluyen el concepto indicado, con importe/cantidad de ese concepto. */
export function getConceptDocumentsForPeriod(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
  normalizedKey: string,
): ConceptDocumentEntry[] {
  const key = normalizeConceptKey(normalizedKey);
  if (!key) return [];

  const entries: ConceptDocumentEntry[] = [];

  for (const doc of documents) {
    if (doc.type !== 'invoice') continue;
    if (!isDateInRange(doc.date, from, to)) continue;
    if (!matchesClientScope(doc.clientId, clientScope)) continue;

    let conceptAmount = 0;
    let conceptQuantity = 0;
    let hasMatch = false;

    for (const item of doc.items) {
      const itemKey = normalizeConceptKey(getLineItemConceptText(item));
      if (itemKey !== key) continue;
      hasMatch = true;
      conceptAmount += lineItemGrossAmount(doc, item);
      conceptQuantity += item.quantity;
    }

    if (hasMatch) {
      entries.push({ document: doc, conceptAmount, conceptQuantity });
    }
  }

  return entries.sort(
    (a, b) => new Date(b.document.date).getTime() - new Date(a.document.date).getTime(),
  );
}

/** Reparto del concepto por contacto en el periodo. */
export function aggregateConceptByClient(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
  normalizedKey: string,
): ConceptClientBreakdown[] {
  const map = new Map<
    string,
    { totalAmount: number; totalQuantity: number; invoiceIds: Set<string> }
  >();

  for (const { document, conceptAmount, conceptQuantity } of getConceptDocumentsForPeriod(
    documents,
    from,
    to,
    clientScope,
    normalizedKey,
  )) {
    const existing = map.get(document.clientId);
    if (existing) {
      existing.totalAmount += conceptAmount;
      existing.totalQuantity += conceptQuantity;
      existing.invoiceIds.add(document.id);
    } else {
      map.set(document.clientId, {
        totalAmount: conceptAmount,
        totalQuantity: conceptQuantity,
        invoiceIds: new Set([document.id]),
      });
    }
  }

  return Array.from(map.entries())
    .map(([clientId, data]) => ({
      clientId,
      totalAmount: data.totalAmount,
      totalQuantity: data.totalQuantity,
      invoiceCount: data.invoiceIds.size,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
