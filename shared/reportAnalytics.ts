import type { Activity, Document, MonthlyReport } from './types.js';
import { isDateInRange } from './dateRange.js';
import { sumDocumentTotalByStatus } from './documents.js';
import { matchesClientScope, type ClientScope } from './documentConcepts.js';

export type DocumentMetrics = {
  paid: number;
  sent: number;
  draft: number;
  total: number;
  paidAmount: number;
  sentAmount: number;
  draftAmount: number;
};

export type DocumentTypeMetrics = {
  deliveryNoteCount: number;
  invoiceCount: number;
};

export function countDocumentsByType(documents: readonly Document[]): DocumentTypeMetrics {
  let deliveryNoteCount = 0;
  let invoiceCount = 0;
  for (const document of documents) {
    if (document.type === 'invoice') {
      invoiceCount += 1;
    } else {
      deliveryNoteCount += 1;
    }
  }
  return { deliveryNoteCount, invoiceCount };
}

export function documentTypeMetricsForDocuments(
  documents: readonly Document[],
  clientScope: ClientScope = 'all',
): DocumentTypeMetrics {
  const scopedDocuments = documents.filter((document) =>
    matchesClientScope(document.clientId, clientScope),
  );
  return countDocumentsByType(scopedDocuments);
}

export function documentTypeMetricsForRange(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): DocumentTypeMetrics {
  return countDocumentsByType(getPeriodDocuments(documents, from, to, clientScope));
}

export function reportRangeFromMonthlyReport(report: MonthlyReport): { from: string; to: string } {
  if (report.periodFrom && report.periodTo) {
    return { from: report.periodFrom, to: report.periodTo };
  }
  const monthDate = new Date(report.year, Number(report.month) - 1, 1);
  const end = new Date(report.year, Number(report.month), 0);
  const month = String(Number(report.month)).padStart(2, '0');
  return {
    from: `${report.year}-${month}-01`,
    to: `${report.year}-${month}-${String(end.getDate()).padStart(2, '0')}`,
  };
}

export function reportOverlapsRange(report: MonthlyReport, from: string, to: string): boolean {
  const range = reportRangeFromMonthlyReport(report);
  return range.from <= to && range.to >= from;
}

export function getPeriodDocuments(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): Document[] {
  return documents.filter(
    (doc) => isDateInRange(doc.date, from, to) && matchesClientScope(doc.clientId, clientScope),
  );
}

/** Documentos emitidos dentro del periodo (filtro por document.date). */
export const documentsIssuedInPeriod = getPeriodDocuments;

/** Documentos vinculados a actividades concretas (p. ej. factura de una actividad del periodo). */
export function getDocumentsLinkedToActivities(
  documents: readonly Document[],
  activities: readonly Activity[],
): Document[] {
  const activityIds = new Set(activities.map((activity) => activity.id));
  return documents.filter(
    (document) => document.activityId && activityIds.has(document.activityId),
  );
}

/** Metricas sobre un subconjunto de documentos ya filtrado (sin volver a filtrar por fecha). */
export function documentMetricsForDocuments(
  documents: readonly Document[],
  clientScope: ClientScope = 'all',
): DocumentMetrics {
  const scopedDocuments = documents.filter((document) =>
    matchesClientScope(document.clientId, clientScope),
  );

  return {
    paid: scopedDocuments.filter((doc) => doc.status === 'paid').length,
    sent: scopedDocuments.filter((doc) => doc.status === 'sent').length,
    draft: scopedDocuments.filter((doc) => doc.status === 'draft').length,
    total: scopedDocuments.length,
    paidAmount: sumDocumentTotalByStatus(scopedDocuments, 'paid'),
    sentAmount: sumDocumentTotalByStatus(scopedDocuments, 'sent'),
    draftAmount: sumDocumentTotalByStatus(scopedDocuments, 'draft'),
  };
}

/** Documentos asignados a actividades que aún no están pagados (borrador o enviado). */
export function getUnpaidDocumentsLinkedToActivities(
  documents: readonly Document[],
  activities: readonly Activity[],
): Document[] {
  return getDocumentsLinkedToActivities(documents, activities).filter(
    (document) => document.status !== 'paid',
  );
}

export function documentMetricsForRange(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): DocumentMetrics {
  const periodDocuments = getPeriodDocuments(documents, from, to, clientScope);

  return {
    paid: periodDocuments.filter((doc) => doc.status === 'paid').length,
    sent: periodDocuments.filter((doc) => doc.status === 'sent').length,
    draft: periodDocuments.filter((doc) => doc.status === 'draft').length,
    total: periodDocuments.length,
    paidAmount: sumDocumentTotalByStatus(periodDocuments, 'paid'),
    sentAmount: sumDocumentTotalByStatus(periodDocuments, 'sent'),
    draftAmount: sumDocumentTotalByStatus(periodDocuments, 'draft'),
  };
}

export function getPeriodDocumentClientIds(
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): Set<string> {
  const ids = new Set<string>();
  for (const doc of getPeriodDocuments(documents, from, to, clientScope)) {
    ids.add(doc.clientId);
  }
  return ids;
}

export function mergeClientIdsWithPeriodData(
  activityClientIds: Iterable<string>,
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): Set<string> {
  const ids = new Set(activityClientIds);
  for (const clientId of getPeriodDocumentClientIds(documents, from, to, clientScope)) {
    ids.add(clientId);
  }
  return ids;
}

export function countClientsWithPeriodData(
  activityClientIds: Iterable<string>,
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope = 'all',
): number {
  return mergeClientIdsWithPeriodData(activityClientIds, documents, from, to, clientScope).size;
}

export function clientHasPeriodDocuments(
  documents: readonly Document[],
  clientId: string,
  from: string,
  to: string,
): boolean {
  return documents.some(
    (doc) => doc.clientId === clientId && isDateInRange(doc.date, from, to),
  );
}

export function clientHasPeriodData(
  documents: readonly Document[],
  clientId: string,
  from: string,
  to: string,
  activityCount: number,
): boolean {
  return activityCount > 0 || clientHasPeriodDocuments(documents, clientId, from, to);
}
