import type { MetricChartDatum, MetricChartValueFormat } from '@/lib/metricChartData';
import { formatMetricChartValue } from '@/lib/metricChartData';
import styles from '@/components/clientCharts/ClientActivityTypeChart.module.css';

type MetricChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: MetricChartDatum; color?: string }>;
  valueFormat: MetricChartValueFormat;
};

export default function MetricChartTooltip({
  active,
  payload,
  valueFormat,
}: MetricChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipDot} style={{ backgroundColor: item.color }} aria-hidden />
      <div className={styles.tooltipBody}>
        <span className={styles.tooltipTitle}>{item.label}</span>
        {item.detail ? (
          <span className={styles.tooltipMeta}>{item.detail}</span>
        ) : null}
        <span className={styles.tooltipValue}>
          {formatMetricChartValue(item.value, valueFormat)}
          {item.percent > 0 ? ` · ${item.percent}%` : ''}
        </span>
      </div>
    </div>
  );
}
