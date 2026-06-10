import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ANIMATION,
  getAxisLine,
  getAxisTick,
  getGridStroke,
  getTooltipCursor,
} from '@/components/clientCharts/chartTheme';
import { buildScaleMax } from '@/components/clientCharts/utils';
import { getEffectiveChartAccent } from '@/lib/chartColorPalette';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import {
  formatMetricChartValue,
  type MetricChartDatum,
  type MetricChartValueFormat,
} from '@/lib/metricChartData';
import {
  getMetricValueAxisWidth,
  METRIC_CHART_MARGINS,
} from './metricChartLayout';
import styles from '@/components/clientCharts/ClientActivityTypeChart.module.css';
import MetricChartTooltip from './MetricChartTooltip';

type LineChartViewProps = {
  data: MetricChartDatum[];
  valueFormat: MetricChartValueFormat;
};

export default function LineChartView({ data, valueFormat }: LineChartViewProps) {
  useChartThemeVersion();
  const accent = data[0]?.color ?? getEffectiveChartAccent();
  const maxValue = Math.max(...data.map((entry) => entry.value), 0);
  const scaleMax =
    valueFormat === 'hours'
      ? buildScaleMax(maxValue)
      : Math.max(valueFormat === 'income' ? 100 : 4, Math.ceil(maxValue * 1.12) || 4);
  const axisTick = getAxisTick();
  const axisLine = getAxisLine();
  const gridStroke = getGridStroke();
  const tooltipCursor = getTooltipCursor();
  const valueAxisWidth = getMetricValueAxisWidth(valueFormat, scaleMax);

  return (
    <div className={styles.chartSurface} style={{ height: 196 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={METRIC_CHART_MARGINS.vertical}>
          <CartesianGrid stroke={gridStroke} strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="shortName"
            axisLine={axisLine}
            tickLine={false}
            tick={axisTick}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={axisTick}
            domain={[0, scaleMax]}
            width={valueAxisWidth}
            tickFormatter={(value) => formatMetricChartValue(Number(value), valueFormat)}
          />
          <Tooltip
            cursor={tooltipCursor}
            content={<MetricChartTooltip valueFormat={valueFormat} />}
            wrapperStyle={{ outline: 'none' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={2.5}
            dot={{
              r: 3,
              fill: accent,
              strokeWidth: 0,
            }}
            activeDot={{
              r: 5,
              fill: accent,
              strokeWidth: 0,
            }}
            {...ANIMATION}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
