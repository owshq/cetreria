import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import {
  formatMetricChartValue,
  type MetricChartDatum,
  type MetricChartValueFormat,
} from '@/lib/metricChartData';
import styles from '@/components/clientCharts/ClientActivityTypeChart.module.css';
import MetricChartTooltip from './MetricChartTooltip';

type MetricDonutChartViewProps = {
  data: MetricChartDatum[];
  valueFormat: MetricChartValueFormat;
};

function getTotalValue(data: MetricChartDatum[]): number {
  return data.reduce((sum, entry) => sum + entry.value, 0);
}

export default function MetricDonutChartView({ data, valueFormat }: MetricDonutChartViewProps) {
  useChartThemeVersion();
  const total = getTotalValue(data);
  const legendHeight = Math.max(148, data.length * 22 + 118);
  const chartStrokeSurface = getChartStrokeSurface();

  return (
    <div className={styles.donutLayout} style={{ minHeight: legendHeight }}>
      <div className={styles.donutChartWrap}>
        <ResponsiveContainer width="100%" height={168}>
          <PieChart margin={CHART_MARGINS.donut}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 3 : 0}
              cornerRadius={6}
              stroke={chartStrokeSurface}
              strokeWidth={2}
              {...ANIMATION}
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={<MetricChartTooltip valueFormat={valueFormat} />}
              wrapperStyle={{ outline: 'none' }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className={styles.donutCenter} aria-hidden>
          <span className={styles.donutCenterValue}>
            {formatMetricChartValue(total, valueFormat)}
          </span>
          <span className={styles.donutCenterLabel}>total</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {data.map((entry) => (
          <li key={entry.id} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: entry.color }} />
            <span className={styles.legendText} title={entry.label}>
              {entry.label}
            </span>
            <span className={styles.legendMeta}>
              {formatMetricChartValue(entry.value, valueFormat)}
              {entry.percent > 0 ? ` · ${entry.percent}%` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
