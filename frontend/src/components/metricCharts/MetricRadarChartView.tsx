import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { getEffectiveChartAccent } from '@/lib/chartColorPalette';
import { buildScaleMax } from '@/components/clientCharts/utils';
import {
  ANIMATION,
  CHART_FONT,
  CHART_MARGINS,
  getAxisTick,
  getChartStrokeSurface,
  getChartTickFaint,
  getGridStroke,
} from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import {
  formatMetricChartValue,
  type MetricChartDatum,
  type MetricChartValueFormat,
} from '@/lib/metricChartData';
import styles from '@/components/clientCharts/ClientActivityTypeChart.module.css';
import MetricChartTooltip from './MetricChartTooltip';

type MetricRadarChartViewProps = {
  data: MetricChartDatum[];
  valueFormat: MetricChartValueFormat;
};

export default function MetricRadarChartView({ data, valueFormat }: MetricRadarChartViewProps) {
  useChartThemeVersion();
  const maxValue = Math.max(...data.map((entry) => entry.value), 0);
  const scaleMax =
    valueFormat === 'hours'
      ? buildScaleMax(maxValue)
      : Math.max(valueFormat === 'income' ? 100 : 4, Math.ceil(maxValue * 1.12) || 4);
  const accent = getEffectiveChartAccent();
  const axisTick = getAxisTick();
  const gridStroke = getGridStroke();
  const chartStrokeSurface = getChartStrokeSurface();
  const tickFaint = getChartTickFaint();

  return (
    <div className={styles.chartSurface} style={{ height: 228 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="52%" outerRadius="72%" margin={CHART_MARGINS.radar}>
          <defs>
            <linearGradient id="metric-radar-fill-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.34} />
              <stop offset="100%" stopColor={accent} stopOpacity={0.06} />
            </linearGradient>
          </defs>

          <PolarGrid gridType="polygon" stroke={gridStroke} radialLines={false} />
          <PolarAngleAxis
            dataKey="shortName"
            tick={{ ...axisTick, fontSize: 10, fontWeight: 500 }}
            tickLine={false}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, scaleMax]}
            tick={{ fill: tickFaint, fontSize: 9, fontFamily: CHART_FONT }}
            axisLine={false}
            tickFormatter={(value) => formatMetricChartValue(Number(value), valueFormat)}
          />
          <Tooltip
            content={<MetricChartTooltip valueFormat={valueFormat} />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Radar
            name="Valor"
            dataKey="value"
            stroke={accent}
            strokeWidth={2.5}
            fill="url(#metric-radar-fill-gradient)"
            fillOpacity={1}
            dot={{
              r: 4,
              fill: accent,
              stroke: chartStrokeSurface,
              strokeWidth: 2,
            }}
            activeDot={{
              r: 6,
              fill: accent,
              stroke: chartStrokeSurface,
              strokeWidth: 2,
            }}
            {...ANIMATION}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
