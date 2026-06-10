import { formatMetricChartValue, type MetricChartValueFormat } from '@/lib/metricChartData';

export const METRIC_CHART_MARGINS = {
  vertical: { top: 12, right: 12, left: 8, bottom: 4 },
  horizontal: { top: 4, right: 16, left: 8, bottom: 8 },
} as const;

export function getMetricValueAxisWidth(
  valueFormat: MetricChartValueFormat,
  scaleMax: number,
): number {
  const sample = formatMetricChartValue(scaleMax, valueFormat);
  const charWidth = valueFormat === 'income' ? 7.2 : 6.5;
  const minWidth = valueFormat === 'income' ? 64 : valueFormat === 'hours' ? 40 : 32;
  return Math.max(minWidth, Math.ceil(sample.length * charWidth) + 10);
}
