import { formatDocumentAmount, type MetricComparisonContext } from '@shared/types';
import type { PeriodMetricButtonConfig } from '@/components/PeriodMetricsChartSection';
import {
  COMBINED_PERIOD_CHART_PRESETS,
  CLIENT_PERIOD_CHART_PRESETS,
} from '@/lib/metricChartConfig';
import { formatChangePercent, type MetricDeltaTone } from '@/lib/metricDelta';
import dashboardStyles from '@/pages/Dashboard.module.css';

const EM_DASH = '\u2014';
const MIDDLE_DOT = '\u00b7';

export type PaidPeriodMetricInput = {
  paidAmount: number;
  paidAmountChangePercent: number | null;
  draftCount: number;
  sentAmount?: number;
};

export type PendingPeriodMetricInput = {
  pendingDocuments: number;
  pendingDocumentsAmount: number;
  pendingDocumentsPercent: number | null;
};

export type WorkPeriodMetricInput = {
  activityCount: number;
  activitiesChangePercent: number | null;
  periodHours: number;
  hoursChangePercent: number | null;
  avgHoursPerActivity: number | null;
  avgRevenuePerHour?: number | null;
};

export type DocumentsPeriodMetricInput = PaidPeriodMetricInput &
  PendingPeriodMetricInput & {
    extraSubLine?: string;
  };

export function formatPendingShare(
  percent: number | null | undefined,
  pending: number,
): { text: string; tone: MetricDeltaTone } {
  if (percent == null) {
    return {
      text: pending === 0 ? 'Sin documentos en el periodo' : `${pending} sin pagar`,
      tone: 'neutral',
    };
  }
  return {
    text: `${percent}% sin pagar`,
    tone: 'warning',
  };
}

function formatAvgHours(value: number | null): string {
  if (value == null) return EM_DASH;
  return `${value.toLocaleString('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}h`;
}

function formatAvgRevenuePerHour(value: number | null | undefined): string {
  if (value == null) return EM_DASH;
  return `${formatDocumentAmount(value)}/h`;
}

/** Documentos: cobrado + pendiente en una sola tarjeta. */
export function buildDocumentsPeriodMetric(
  stats: DocumentsPeriodMetricInput,
  comparison: MetricComparisonContext,
): PeriodMetricButtonConfig {
  const paidDelta = formatChangePercent(stats.paidAmountChangePercent, comparison);
  const pendingShare = formatPendingShare(
    stats.pendingDocumentsPercent,
    stats.pendingDocuments,
  );

  return {
    id: 'documents',
    chartMetric: 'documents',
    chartPreset: COMBINED_PERIOD_CHART_PRESETS.documents[0],
    chartPresets: [...COMBINED_PERIOD_CHART_PRESETS.documents],
    title: 'Documentos',
    value: formatDocumentAmount(stats.paidAmount),
    delta: paidDelta,
    valueDeltas: [paidDelta, pendingShare],
    sub: (
      <>
        <div className={dashboardStyles.statBoxAmount}>
          Pend. {formatDocumentAmount(stats.pendingDocumentsAmount)} {MIDDLE_DOT}{' '}
          {stats.pendingDocuments} sin pagar
        </div>
        {stats.extraSubLine ? (
          <div className={dashboardStyles.statBoxAmount}>{stats.extraSubLine}</div>
        ) : null}
      </>
    ),
  };
}

/** Trabajo: actividades + horas en una sola tarjeta. */
export function buildWorkPeriodMetric(
  stats: WorkPeriodMetricInput,
  comparison: MetricComparisonContext,
  options?: { title?: string },
): PeriodMetricButtonConfig {
  const hoursDelta = formatChangePercent(stats.hoursChangePercent, comparison);
  const activitiesDelta = formatChangePercent(
    stats.activitiesChangePercent,
    comparison,
  );

  return {
    id: 'work',
    chartMetric: 'hours',
    chartPreset: COMBINED_PERIOD_CHART_PRESETS.work[0],
    chartPresets: [...COMBINED_PERIOD_CHART_PRESETS.work],
    title: options?.title ?? 'Trabajo',
    value: `${stats.activityCount} ${MIDDLE_DOT} ${stats.periodHours}h`,
    delta: activitiesDelta,
    valueDeltas: [activitiesDelta, hoursDelta],
    sub: (
      <>
        <div className={dashboardStyles.statBoxAmount}>
          Media h/act.: {formatAvgHours(stats.avgHoursPerActivity)}
          {stats.avgRevenuePerHour != null
            ? ` ${MIDDLE_DOT} ingresos/h: ${formatAvgRevenuePerHour(stats.avgRevenuePerHour)}`
            : ''}
        </div>
      </>
    ),
  };
}

/** @deprecated Usar buildDocumentsPeriodMetric */
export function buildPaidPeriodMetric(
  stats: PaidPeriodMetricInput,
  comparison: MetricComparisonContext,
  options?: { paidTitle?: string },
): PeriodMetricButtonConfig {
  return {
    id: 'paid',
    chartMetric: 'documents',
    chartPreset: CLIENT_PERIOD_CHART_PRESETS.paid,
    title: options?.paidTitle ?? 'Cobrado',
    value: formatDocumentAmount(stats.paidAmount),
    delta: formatChangePercent(stats.paidAmountChangePercent, comparison),
    sub: (
      <>
        {stats.draftCount > 0 ? (
          <div className={dashboardStyles.statBoxAmount}>
            {stats.draftCount} {stats.draftCount === 1 ? 'borrador' : 'borradores'}
          </div>
        ) : null}
      </>
    ),
  };
}

/** @deprecated Usar buildDocumentsPeriodMetric */
export function buildPendingPeriodMetric(
  stats: PendingPeriodMetricInput,
  comparison: MetricComparisonContext,
  options?: { title?: string; id?: string },
): PeriodMetricButtonConfig {
  const pendingShare = formatPendingShare(
    stats.pendingDocumentsPercent,
    stats.pendingDocuments,
  );

  const title = options?.title ?? 'Documentos pendientes';

  return {
    id: options?.id ?? 'pending',
    chartMetric: 'documents',
    chartPreset: CLIENT_PERIOD_CHART_PRESETS.pending,
    title,
    ...(options?.title ? {} : { titleShort: 'Docs. pendientes' }),
    value: formatDocumentAmount(stats.pendingDocumentsAmount),
    delta: pendingShare,
    sub: (
      <div className={dashboardStyles.statBoxAmount}>
        {stats.pendingDocuments}{' '}
        {stats.pendingDocuments === 1 ? 'documento' : 'documentos'}
      </div>
    ),
  };
}
