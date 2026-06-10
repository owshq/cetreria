import type { Activity, Document } from '@shared/types';
import {
  aggregateInvoiceConcepts,
  documentMetricsForRange,
  getPreviousDateRange,
  getUnpaidDocumentsLinkedToActivities,
  isDateInRange,
  matchesClientScope,
  percentChange,
  sumDocumentTotals,
  type ClientScope,
} from '@shared/types';

export type ClientPeriodStats = {
  activityCount: number;
  activitiesChangePercent: number | null;
  periodHours: number;
  hoursChangePercent: number | null;
  avgHoursPerActivity: number | null;
  avgRevenuePerHour: number | null;
  paidAmount: number;
  sentAmount: number;
  draftCount: number;
  paidAmountChangePercent: number | null;
  pendingDocuments: number;
  pendingDocumentsAmount: number;
  pendingDocumentsPercent: number | null;
  conceptCount: number;
  conceptsPerThousandIncome: number | null;
};

function activitiesInRange(
  activities: readonly Activity[],
  clientScope: ClientScope,
  from: string,
  to: string,
): Activity[] {
  return activities.filter(
    (activity) =>
      matchesClientScope(activity.clientId, clientScope) &&
      isDateInRange(activity.date, from, to),
  );
}

export function computeClientPeriodStats(
  activities: readonly Activity[],
  documents: readonly Document[],
  clientScope: ClientScope,
  from: string,
  to: string,
): ClientPeriodStats {
  const periodActivities = activitiesInRange(activities, clientScope, from, to);
  const activityCount = periodActivities.length;
  const periodHours = periodActivities.reduce((sum, activity) => sum + activity.hours, 0);

  const documentMetrics = documentMetricsForRange(documents, from, to, clientScope);
  const totalDocuments = documentMetrics.total;
  const scopedDocuments = documents.filter((document) =>
    matchesClientScope(document.clientId, clientScope),
  );
  const unpaidActivityDocuments = getUnpaidDocumentsLinkedToActivities(
    scopedDocuments,
    periodActivities,
  );
  const pendingDocuments = unpaidActivityDocuments.length;

  const prevRange = getPreviousDateRange(from, to);
  const prevActivities = activitiesInRange(
    activities,
    clientScope,
    prevRange.from,
    prevRange.to,
  );
  const prevHours = prevActivities.reduce((sum, activity) => sum + activity.hours, 0);
  const prevDocumentMetrics = documentMetricsForRange(
    documents,
    prevRange.from,
    prevRange.to,
    clientScope,
  );

  const concepts = aggregateInvoiceConcepts(documents, from, to, clientScope);
  const conceptCount = concepts.length;
  const conceptsPerThousandIncome =
    documentMetrics.paidAmount > 0 && conceptCount > 0
      ? (conceptCount / documentMetrics.paidAmount) * 1000
      : null;

  return {
    activityCount,
    activitiesChangePercent: percentChange(activityCount, prevActivities.length),
    periodHours,
    hoursChangePercent: percentChange(periodHours, prevHours),
    avgHoursPerActivity: activityCount > 0 ? periodHours / activityCount : null,
    avgRevenuePerHour:
      periodHours > 0 ? documentMetrics.paidAmount / periodHours : null,
    paidAmount: documentMetrics.paidAmount,
    sentAmount: documentMetrics.sentAmount,
    draftCount: documentMetrics.draft,
    paidAmountChangePercent: percentChange(
      documentMetrics.paidAmount,
      prevDocumentMetrics.paidAmount,
    ),
    pendingDocuments,
    pendingDocumentsAmount: sumDocumentTotals(unpaidActivityDocuments),
    pendingDocumentsPercent:
      totalDocuments > 0
        ? Math.round((pendingDocuments / totalDocuments) * 100)
        : null,
    conceptCount,
    conceptsPerThousandIncome,
  };
}
