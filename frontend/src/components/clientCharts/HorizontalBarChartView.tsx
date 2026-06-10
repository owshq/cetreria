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

type HorizontalBarChartViewProps = {
  data: ChartDatum[];
};

export default function HorizontalBarChartView({ data }: HorizontalBarChartViewProps) {
  useChartThemeVersion();
  const scaleMax = buildScaleMax(data[0]?.hours ?? 0);
  const chartHeight = Math.max(168, data.length * 38 + 36);
  const axisTick = getAxisTick();
  const axisLine = getAxisLine();
  const gridStroke = getGridStroke();
  const tooltipCursor = getTooltipCursor();

  return (
    <div className={styles.chartSurface} style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={CHART_MARGINS.horizontal}
          barCategoryGap="18%"
        >
          <defs>
            {data.map((entry) => (
              <linearGradient
                key={entry.typeId}
                id={`row-gradient-${entry.typeId}`}
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor={entry.color} stopOpacity={0.88} />
                <stop offset="100%" stopColor={entry.color} stopOpacity={1} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, scaleMax]}
            axisLine={axisLine}
            tickLine={false}
            tick={axisTick}
            tickFormatter={(value) => `${value}h`}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            width={72}
          />
          <Tooltip
            cursor={tooltipCursor}
            content={<ChartTooltip />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Bar
            dataKey="hours"
            radius={[0, 8, 8, 0]}
            maxBarSize={16}
            {...ANIMATION}
          >
            {data.map((entry) => (
              <Cell key={entry.typeId} fill={`url(#row-gradient-${entry.typeId})`} />
            ))}
            <LabelList
              dataKey="hours"
              position="right"
              formatter={(value: number) => `${value}h`}
              className={styles.barEndLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
