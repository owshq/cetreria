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
import MetricChartDetailAxisTick from './MetricChartDetailAxisTick';
import {
  ANIMATION,
  getAxisLine,
  getAxisTick,
  getGridStroke,
  getTooltipCursor,
} from '@/components/clientCharts/chartTheme';
import { buildScaleMax } from '@/components/clientCharts/utils';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import {
  formatMetricChartValue,
  type MetricChartDatum,
  type MetricChartValueFormat,
} from '@/lib/metricChartData';
import type { MetricChartOrientation } from '@/lib/metricChartConfig';
import {
  getMetricValueAxisWidth,
  METRIC_CHART_MARGINS,
} from './metricChartLayout';
import styles from '@/components/clientCharts/ClientActivityTypeChart.module.css';
import MetricChartTooltip from './MetricChartTooltip';

type MetricBarChartViewProps = {
  data: MetricChartDatum[];
  valueFormat: MetricChartValueFormat;
  orientation?: MetricChartOrientation;
};

export default function MetricBarChartView({
  data,
  valueFormat,
  orientation = 'vertical',
}: MetricBarChartViewProps) {
  useChartThemeVersion();
  const maxValue = Math.max(...data.map((entry) => entry.value), 0);
  const scaleMax =
    valueFormat === 'hours'
      ? buildScaleMax(maxValue)
      : Math.max(valueFormat === 'income' ? 100 : 4, Math.ceil(maxValue * 1.12));
  const axisTick = getAxisTick();
  const axisLine = getAxisLine();
  const gridStroke = getGridStroke();
  const tooltipCursor = getTooltipCursor();
  const isHorizontal = orientation === 'horizontal';
  const hasDetailLabels = data.some((entry) => entry.detail);
  const chartHeight = isHorizontal
    ? Math.max(196, data.length * 38 + 36)
    : hasDetailLabels
      ? 228
      : 196;
  const valueAxisWidth = getMetricValueAxisWidth(valueFormat, scaleMax);

  return (
    <div className={styles.chartSurface} style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={isHorizontal ? 'vertical' : 'horizontal'}
          margin={
            isHorizontal
              ? METRIC_CHART_MARGINS.horizontal
              : hasDetailLabels
                ? { ...METRIC_CHART_MARGINS.vertical, bottom: 40 }
                : METRIC_CHART_MARGINS.vertical
          }
          barCategoryGap={isHorizontal ? '18%' : '22%'}
        >
          <defs>
            {data.map((entry) => (
              <linearGradient
                key={entry.id}
                id={`metric-bar-gradient-${entry.id}`}
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

          <CartesianGrid
            stroke={gridStroke}
            strokeDasharray="4 4"
            vertical={!isHorizontal}
            horizontal={isHorizontal}
          />
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                domain={[0, scaleMax]}
                axisLine={axisLine}
                tickLine={false}
                tick={axisTick}
                height={valueFormat === 'income' ? 36 : 30}
                tickFormatter={(value) => formatMetricChartValue(Number(value), valueFormat)}
              />
              <YAxis
                type="category"
                dataKey="shortName"
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                width={72}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="shortName"
                axisLine={axisLine}
                tickLine={false}
                tick={
                  hasDetailLabels
                    ? (props) => <MetricChartDetailAxisTick {...props} data={data} />
                    : axisTick
                }
                height={hasDetailLabels ? 44 : undefined}
                interval={0}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={axisTick}
                domain={[0, scaleMax]}
                width={valueAxisWidth}
                tickFormatter={(value) => formatMetricChartValue(Number(value), valueFormat)}
              />
            </>
          )}
          <Tooltip
            cursor={tooltipCursor}
            content={<MetricChartTooltip valueFormat={valueFormat} />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Bar
            dataKey="value"
            radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
            maxBarSize={isHorizontal ? 16 : 42}
            {...ANIMATION}
          >
            {data.map((entry) => (
              <Cell key={entry.id} fill={`url(#metric-bar-gradient-${entry.id})`} />
            ))}
            <LabelList
              dataKey="value"
              position={isHorizontal ? 'right' : 'top'}
              formatter={(value: number) =>
                value > 0 ? formatMetricChartValue(value, valueFormat) : ''
              }
              className={isHorizontal ? styles.barEndLabel : styles.barTopLabel}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
