import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatDocumentAmount } from '@shared/types';
import { applyChartPalette } from '@/lib/chartColorPalette';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './InvoiceConceptsDonutChart.module.css';

const MAX_SLICES = 6;

export type ConceptByClientChartItem = {
  id: string;
  label: string;
  amount: number;
};

type ClientChartDatum = ConceptByClientChartItem & {
  percent: number;
  color: string;
};

type TooltipPayload = {
  payload: ClientChartDatum;
  color?: string;
};

type Props = {
  items: ConceptByClientChartItem[];
  totalAmount: number;
  clientCount: number;
};

function buildChartData(items: ConceptByClientChartItem[], totalAmount: number): ClientChartDatum[] {
  if (items.length === 0 || totalAmount <= 0) return [];

  const toDatum = (item: ConceptByClientChartItem): Omit<ClientChartDatum, 'color'> => ({
    ...item,
    percent: Math.round((item.amount / totalAmount) * 100),
  });

  let chartItems: Omit<ClientChartDatum, 'color'>[];

  if (items.length <= MAX_SLICES) {
    chartItems = items.map(toDatum);
  } else {
    const top = items.slice(0, MAX_SLICES).map(toDatum);
    const othersAmount = items.slice(MAX_SLICES).reduce((sum, item) => sum + item.amount, 0);

    chartItems = top;
    if (othersAmount > 0) {
      chartItems.push({
        id: '__others__',
        label: 'Otros',
        amount: othersAmount,
        percent: Math.round((othersAmount / totalAmount) * 100),
      });
    }
  }

  return applyChartPalette(chartItems.map((item) => ({ ...item, color: '' })));
}

function ClientDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  const swatchColor = payload[0].color ?? item.color;

  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipDot} style={{ backgroundColor: swatchColor }} aria-hidden />
      <div className={styles.tooltipBody}>
        <span className={styles.tooltipTitle}>{item.label}</span>
        <span className={styles.tooltipValue}>
          {formatDocumentAmount(item.amount)} {'\u00b7'} {item.percent}%
        </span>
      </div>
    </div>
  );
}

export default function ConceptByClientDonutChart({ items, totalAmount, clientCount }: Props) {
  useChartThemeVersion();
  const chartStrokeSurface = getChartStrokeSurface();

  const chartData = useMemo(() => buildChartData(items, totalAmount), [items, totalAmount]);

  if (chartData.length === 0) return null;

  const showCenterTotal = totalAmount > 0;

  return (
    <div className={styles.wrap} aria-label="Distribuci\u00f3n del concepto por contacto">
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={CHART_MARGINS.donut}>
            <Pie
              data={chartData}
              dataKey="amount"
              nameKey="label"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={chartData.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke={chartStrokeSurface}
              strokeWidth={2}
              {...ANIMATION}
            >
              {chartData.map((entry) => (
                <Cell key={entry.id} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ClientDonutTooltip />} wrapperStyle={{ outline: 'none' }} />
          </PieChart>
        </ResponsiveContainer>

        {showCenterTotal && (
          <div className={styles.center} aria-hidden>
            <span className={styles.centerValue}>{formatDocumentAmount(totalAmount)}</span>
            <span className={styles.centerLabel}>total</span>
            <span className={styles.centerCount}>{clientCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
