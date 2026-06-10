import type { XAxisTickContentProps } from 'recharts';
import { CHART_FONT, getAxisTick, getChartTickFaint } from '@/components/clientCharts/chartTheme';
import type { MetricChartDatum } from '@/lib/metricChartData';

type MetricChartDetailAxisTickProps = XAxisTickContentProps & {
  data: MetricChartDatum[];
};

export default function MetricChartDetailAxisTick({
  x,
  y,
  index,
  payload,
  data,
}: MetricChartDetailAxisTickProps) {
  const entry = data[index];
  const primary = entry?.shortName ?? String(payload.value ?? '');
  const detail = entry?.detail;
  const axisTick = getAxisTick();
  const detailColor = getChartTickFaint();

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill={axisTick.fill}
        fontSize={axisTick.fontSize}
        fontFamily={CHART_FONT}
      >
        {primary}
      </text>
      {detail ? (
        <text
          x={0}
          y={0}
          dy={28}
          textAnchor="middle"
          fill={detailColor}
          fontSize={10}
          fontFamily={CHART_FONT}
          fontWeight={600}
        >
          {detail}
        </text>
      ) : null}
    </g>
  );
}
