import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  describeMetricChartQuery,
  METRIC_CHART_TITLES,
  type DashboardMetricKey,
  type MetricChartField,
} from '@/lib/metricChartConfig';
import { formatMetricChartValue, type MetricChartBuildResult } from '@/lib/metricChartData';

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildMetricChartReportCsv(
  metric: DashboardMetricKey,
  xAxis: MetricChartField,
  yAxis: MetricChartField,
  from: string,
  to: string,
  chart: MetricChartBuildResult,
): string {
  const title = `Gráfico · ${METRIC_CHART_TITLES[metric]} · ${describeMetricChartQuery(xAxis, yAxis)}`;
  const fromLabel = format(parseISO(from), 'd MMM yyyy', { locale: es });
  const toLabel = format(parseISO(to), 'd MMM yyyy', { locale: es });
  const periodLabel = from === to ? fromLabel : `${fromLabel} – ${toLabel}`;

  const lines = [
    `${escapeCsv('Informe')};${escapeCsv(title)}`,
    `${escapeCsv('Periodo')};${escapeCsv(periodLabel)}`,
    '',
    `${escapeCsv('Etiqueta')};${escapeCsv('Valor')};${escapeCsv('% del total')}`,
  ];

  for (const row of chart.data) {
    lines.push(
      [
        escapeCsv(row.label),
        escapeCsv(formatMetricChartValue(row.value, chart.valueFormat)),
        escapeCsv(`${row.percent.toFixed(1)}%`),
      ].join(';'),
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadMetricChartReport(
  metric: DashboardMetricKey,
  xAxis: MetricChartField,
  yAxis: MetricChartField,
  from: string,
  to: string,
  chart: MetricChartBuildResult,
): void {
  const csvContent = `\uFEFF${buildMetricChartReportCsv(metric, xAxis, yAxis, from, to, chart)}`;
  const querySlug = slugify(describeMetricChartQuery(xAxis, yAxis));
  const metricSlug = slugify(METRIC_CHART_TITLES[metric]);
  const filename = `informe_${metricSlug}_${querySlug}_${from}_${to}.csv`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}
