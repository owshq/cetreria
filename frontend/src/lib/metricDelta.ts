import {
  formatMetricChangePercent,
  getComparisonNoDataLabel,
  getComparisonPeriodLabel,
  type MetricChangeTone,
  type MetricComparisonContext,
} from '@shared/types';

export type MetricDeltaTone = MetricChangeTone | 'info' | 'warning';

export type { MetricComparisonContext };

export function formatChangePercent(
  value: number | null | undefined,
  context: MetricComparisonContext,
) {
  return formatMetricChangePercent(value, context);
}

export { getComparisonPeriodLabel, getComparisonNoDataLabel };
