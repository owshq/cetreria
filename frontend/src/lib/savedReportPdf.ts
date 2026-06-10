import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity, ActivityType, Client, DatePeriod, Document, MonthlyReport } from '@shared/types';
import {
  formatPeriodDisplayLabel,
  aggregateInvoiceConcepts,
  documentMetricsForRange,
  reportRangeFromMonthlyReport,
} from '@shared/types';
import type { ChartMode } from '@/components/clientCharts/chartTypes';
import { buildTypeBuckets, toChartData } from '@/components/clientCharts/utils';
import type { BuildSummaryReportPdfParams } from './summaryReportPdf';
import {
  buildSummaryReportFileName,
  buildSummaryReportPdfBlob,
  openSummaryReportPdf,
} from './summaryReportPdf';
import { reportsService } from '@/api/reports';
import type { ReportKind } from '@shared/types';

export type SaveReportScope = {
  from: string;
  to: string;
  clientIds?: string | string[];
  reportKind?: ReportKind;
  workerUserId?: string;
  reportLabel?: string;
};

export async function persistReportSnapshot(
  scope: SaveReportScope,
  params: BuildSummaryReportPdfParams,
  onSaved?: () => void | Promise<void>,
): Promise<MonthlyReport> {
  const { chartElement: _chartElement, ...pdfSnapshot } = params;
  const saved = await reportsService.savePeriod({
    from: scope.from,
    to: scope.to,
    clientIds: scope.clientIds,
    reportKind: scope.reportKind,
    workerUserId: scope.workerUserId,
    reportLabel: scope.reportLabel,
    pdfSnapshot,
  });
  if (onSaved) await onSaved();
  return saved;
}

export async function openAndSaveSummaryReportPdf(
  params: BuildSummaryReportPdfParams,
  fileName: string,
  saveScope: SaveReportScope,
  previewTab: Window | null,
  onSaved?: () => void | Promise<void>,
): Promise<MonthlyReport> {
  await openSummaryReportPdf(params, fileName, previewTab);
  return persistReportSnapshot(saveScope, params, onSaved);
}

export async function generateAndSaveSummaryReport(
  params: BuildSummaryReportPdfParams,
  saveScope: SaveReportScope,
  onSaved?: () => void | Promise<void>,
): Promise<{ saved: MonthlyReport; blob: Blob }> {
  const blob = await buildSummaryReportPdfBlob(params);
  const saved = await persistReportSnapshot(saveScope, params, onSaved);
  return { saved, blob };
}

export function pdfParamsFromSavedReport(
  report: MonthlyReport,
  fallback: BuildSummaryReportPdfParams,
): BuildSummaryReportPdfParams {
  if (report.pdfSnapshot && typeof report.pdfSnapshot === 'object') {
    const snapshot = report.pdfSnapshot as BuildSummaryReportPdfParams;
    const rawGenerated = snapshot.generatedAt ?? report.generatedAt;
    const generatedAt =
      rawGenerated instanceof Date
        ? rawGenerated
        : typeof rawGenerated === 'string'
          ? parseISO(rawGenerated)
          : undefined;

    return {
      ...snapshot,
      chartElement: null,
      generatedAt,
    };
  }
  return fallback;
}

export function monthRangeFromReport(report: MonthlyReport): { from: string; to: string } {
  return reportRangeFromMonthlyReport(report);
}

function buildPdfParamsBase(
  client: Client,
  periodActivities: Activity[],
  activityTypes: ActivityType[],
  documents: Document[],
  from: string,
  to: string,
  periodLabel: string,
  chartMode: ChartMode,
  comparison: { period: DatePeriod; from: string; to: string },
  companyName: string,
  generatedAt?: Date,
): BuildSummaryReportPdfParams {
  const chartData = toChartData(buildTypeBuckets(periodActivities, activityTypes));
  const invoiceConcepts = aggregateInvoiceConcepts(documents, from, to, client.id);
  const docMetrics = documentMetricsForRange(documents, from, to, client.id);
  const totalHours = periodActivities.reduce((sum, activity) => sum + activity.hours, 0);

  return {
    reportKind: 'contact' as ReportKind,
    periodLabel,
    dateFrom: from,
    dateTo: to,
    generatedAt,
    companyName,
    metrics: {
      clientScope: client.name,
      clientsOrDocumentsLabel: 'Documentos del periodo',
      clientsOrDocumentsValue: docMetrics.total,
      totalActivities: periodActivities.length,
      totalHours,
      paidAmount: docMetrics.paidAmount,
      paidCount: docMetrics.paid,
      sentCount: docMetrics.sent,
      sentAmount: docMetrics.sentAmount,
      draftCount: docMetrics.draft,
      draftAmount: docMetrics.draftAmount,
    },
    invoiceConcepts,
    chartMode,
    chartData,
    chartElement: null,
    narrative: {
      reportKind: 'contact',
      companyName,
      periodLabel,
      clientScope: client.name,
      totalClients: 1,
      totalWorkers: 0,
      totalActivities: periodActivities.length,
      totalHours,
      paidAmount: docMetrics.paidAmount,
      paidCount: docMetrics.paid,
      sentCount: docMetrics.sent,
      sentAmount: docMetrics.sentAmount,
      draftCount: docMetrics.draft,
      draftAmount: docMetrics.draftAmount,
      invoiceConcepts,
      chartMode,
      chartData,
      comparison,
      activitiesChangePercent: null,
      hoursChangePercent: null,
    },
  };
}

export function buildPdfParamsFromLivePeriod(
  client: Client,
  periodActivities: Activity[],
  activityTypes: ActivityType[],
  documents: Document[],
  from: string,
  to: string,
  periodLabel: string,
  comparisonPeriod: DatePeriod,
  companyName: string,
  chartMode: ChartMode = 'bars',
): BuildSummaryReportPdfParams {
  return buildPdfParamsBase(
    client,
    periodActivities,
    activityTypes,
    documents,
    from,
    to,
    periodLabel,
    chartMode,
    { period: comparisonPeriod, from, to },
    companyName,
  );
}

export function buildPdfParamsFromMonthlyReport(
  report: MonthlyReport,
  client: Client,
  activityTypes: ActivityType[],
  documents: Document[],
  companyName: string,
  chartMode: ChartMode = 'bars',
): BuildSummaryReportPdfParams {
  const { from, to } = monthRangeFromReport(report);
  const monthLabel = format(parseISO(from), 'MMMM yyyy', { locale: es });

  return buildPdfParamsBase(
    client,
    report.activities,
    activityTypes,
    documents,
    from,
    to,
    `Informe generado · ${monthLabel}`,
    chartMode,
    { period: 'custom', from, to },
    companyName,
    parseISO(report.generatedAt),
  );
}

export async function openLivePeriodReportPdf(
  client: Client,
  periodActivities: Activity[],
  activityTypes: ActivityType[],
  documents: Document[],
  from: string,
  to: string,
  periodLabel: string,
  comparisonPeriod: DatePeriod,
  companyName: string,
  chartMode: ChartMode = 'bars',
  previewTab: Window | null = null,
): Promise<void> {
  const params = buildPdfParamsFromLivePeriod(
    client,
    periodActivities,
    activityTypes,
    documents,
    from,
    to,
    periodLabel,
    comparisonPeriod,
    companyName,
    chartMode,
  );
  await openSummaryReportPdf(
    params,
    buildSummaryReportFileName(from, to, 'contact', client.name),
    previewTab,
  );
}

export async function downloadLivePeriodReportPdf(
  client: Client,
  periodActivities: Activity[],
  activityTypes: ActivityType[],
  documents: Document[],
  from: string,
  to: string,
  periodLabel: string,
  comparisonPeriod: DatePeriod,
  companyName: string,
  chartMode: ChartMode = 'bars',
  previewTab: Window | null = null,
  onSaved?: () => void | Promise<void>,
): Promise<MonthlyReport | MonthlyReport[]> {
  const params = buildPdfParamsFromLivePeriod(
    client,
    periodActivities,
    activityTypes,
    documents,
    from,
    to,
    periodLabel,
    comparisonPeriod,
    companyName,
    chartMode,
  );
  return openAndSaveSummaryReportPdf(
    params,
    buildSummaryReportFileName(from, to, 'contact', client.name),
    { from, to, clientIds: client.id, reportKind: 'contact', reportLabel: client.name },
    previewTab,
    onSaved,
  );
}

export async function downloadMonthlyReportPdf(
  report: MonthlyReport,
  client: Client,
  activityTypes: ActivityType[],
  documents: Document[],
  companyName: string,
  chartMode: ChartMode = 'bars',
  previewTab: Window | null = null,
): Promise<void> {
  const { from, to } = monthRangeFromReport(report);
  const params = buildPdfParamsFromMonthlyReport(
    report,
    client,
    activityTypes,
    documents,
    companyName,
    chartMode,
  );
  await openSummaryReportPdf(
    params,
    buildSummaryReportFileName(from, to, 'contact', client.name),
    previewTab,
  );
}
