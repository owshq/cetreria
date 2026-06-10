import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartTooltip from './ChartTooltip';
import {
  ANIMATION,
  CHART_MARGINS,
  getAxisLine,
  getAxisTick,
  getGridStroke,
  getTooltipCursor,
} from './chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './ClientActivityTypeChart.module.css';
import { buildScaleMax, type ChartDatum } from './utils';

type BarChartViewProps = {
  data: ChartDatum[];
};

export default function BarChartView({ data }: BarChartViewProps) {
  useChartThemeVersion();
  const scaleMax = buildScaleMax(data[0]?.hours ?? 0);
  const chartHeight = 196;
  const axisTick = getAxisTick();
  const axisLine = getAxisLine();
  const gridStroke = getGridStroke();
  const tooltipCursor = getTooltipCursor();

  return (
    <div className={styles.chartSurface} style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={CHART_MARGINS.vertical} barCategoryGap="22%">
          <defs>
            {data.map((entry) => (
              <linearGradient
                key={entry.typeId}
                id={`bar-gradient-${entry.typeId}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                <stop offset="100%" stopColor={entry.color} stopOpacity={0.72} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="shortName"
            axisLine={axisLine}
            tickLine={false}
            tick={axisTick}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            domain={[0, scaleMax]}
            width={32}
            tickFormatter={(value) => `${value}h`}
          />
          <Tooltip
            cursor={tooltipCursor}
            content={<ChartTooltip />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Bar
            dataKey="hours"
            radius={[8, 8, 0, 0]}
            maxBarSize={42}
            {...ANIMATION}
          >
            {data.map((entry) => (
              <Cell key={entry.typeId} fill={`url(#bar-gradient-${entry.typeId})`} />
            ))}
            <LabelList
              dataKey="hours"
              position="top"
              formatter={(value: number) => (value > 0 ? `${value}h` : '')}
              className={styles.barTopLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
