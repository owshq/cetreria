import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import ChartTooltip from './ChartTooltip';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from './chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './ClientActivityTypeChart.module.css';
import { getTotalHours, type ChartDatum } from './utils';

type DonutChartViewProps = {
  data: ChartDatum[];
};

export default function DonutChartView({ data }: DonutChartViewProps) {
  useChartThemeVersion();
  const totalHours = getTotalHours(data);
  const legendHeight = Math.max(148, data.length * 22 + 118);
  const chartStrokeSurface = getChartStrokeSurface();

  return (
    <div className={styles.donutLayout} style={{ minHeight: legendHeight }}>
      <div className={styles.donutChartWrap}>
        <ResponsiveContainer width="100%" height={168}>
          <PieChart margin={CHART_MARGINS.donut}>
            <Pie
              data={data}
              dataKey="hours"
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
                <Cell key={entry.typeId} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} wrapperStyle={{ outline: 'none' }} />
          </PieChart>
        </ResponsiveContainer>

        <div className={styles.donutCenter} aria-hidden>
          <span className={styles.donutCenterValue}>{totalHours}h</span>
          <span className={styles.donutCenterLabel}>total</span>
        </div>
      </div>

      <ul className={styles.legend}>
        {data.map((entry) => (
          <li key={entry.typeId} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ backgroundColor: entry.color }} />
            <span className={styles.legendText} title={entry.label}>
              {entry.label}
            </span>
            <span className={styles.legendMeta}>
              {entry.hours}h · {entry.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
