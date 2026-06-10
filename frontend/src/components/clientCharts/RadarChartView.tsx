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
import ChartTooltip from './ChartTooltip';
import { ANIMATION, CHART_FONT, CHART_MARGINS, getAxisTick, getChartStrokeSurface, getChartTickFaint, getGridStroke } from './chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './ClientActivityTypeChart.module.css';
import { buildScaleMax, type ChartDatum } from './utils';

type RadarChartViewProps = {
  data: ChartDatum[];
};

export default function RadarChartView({ data }: RadarChartViewProps) {
  useChartThemeVersion();
  const scaleMax = buildScaleMax(data[0]?.hours ?? 0);
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
            <linearGradient id="radar-fill-gradient" x1="0" y1="0" x2="0" y2="1">
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
            tickFormatter={(value) => `${value}h`}
          />
          <Tooltip content={<ChartTooltip />} wrapperStyle={{ outline: 'none' }} />
          <Radar
            name="Horas"
            dataKey="hours"
            stroke={accent}
            strokeWidth={2.5}
            fill="url(#radar-fill-gradient)"
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
