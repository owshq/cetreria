import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { DocumentConceptSummary } from '@shared/types';
import { formatDocumentAmount } from '@shared/types';
import { applyChartPalette } from '@/lib/chartColorPalette';
import { cx } from '@/lib/cx';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './InvoiceConceptsDonutChart.module.css';

const MAX_SLICES = 6;

type ConceptChartDatum = {
  normalizedKey: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
};

type TooltipPayload = {
  payload: ConceptChartDatum;
  color?: string;
};

type Props = {
  concepts: DocumentConceptSummary[];
  totalAmount: number;
  conceptCount: number;
  className?: string;
};

function buildChartData(
  concepts: DocumentConceptSummary[],
  totalAmount: number,
): ConceptChartDatum[] {
  if (concepts.length === 0 || totalAmount <= 0) return [];

  const toDatum = (concept: DocumentConceptSummary): Omit<ConceptChartDatum, 'color'> => ({
    normalizedKey: concept.normalizedKey,
    label: concept.description,
    amount: concept.totalAmount,
    percent: Math.round((concept.totalAmount / totalAmount) * 100),
  });

  let items: Omit<ConceptChartDatum, 'color'>[];

  if (concepts.length <= MAX_SLICES) {
    items = concepts.map(toDatum);
  } else {
    const top = concepts.slice(0, MAX_SLICES).map(toDatum);
    const othersAmount = concepts
      .slice(MAX_SLICES)
      .reduce((sum, concept) => sum + concept.totalAmount, 0);

    items = top;
    if (othersAmount > 0) {
      items.push({
        normalizedKey: '__others__',
        label: 'Otros',
        amount: othersAmount,
        percent: Math.round((othersAmount / totalAmount) * 100),
      });
    }
  }

  return applyChartPalette(items.map((item) => ({ ...item, color: '' })));
}

export function buildConceptColorMap(
  concepts: DocumentConceptSummary[],
  totalAmount: number,
): Map<string, string> {
  const chartData = buildChartData(concepts, totalAmount);
  return new Map(chartData.map((entry) => [entry.normalizedKey, entry.color]));
}

function ConceptDonutTooltip({
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

export default function InvoiceConceptsDonutChart({
  concepts,
  totalAmount,
  conceptCount,
  className,
}: Props) {
  useChartThemeVersion();
  const chartStrokeSurface = getChartStrokeSurface();

  const chartData = useMemo(
    () => buildChartData(concepts, totalAmount),
    [concepts, totalAmount],
  );

  if (chartData.length === 0) return null;

  const showCenterTotal = totalAmount > 0;

  return (
    <div className={cx(styles.wrap, className)} aria-label="Distribuci\u00f3n por concepto de factura">
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
                <Cell key={entry.normalizedKey} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<ConceptDonutTooltip />} wrapperStyle={{ outline: 'none' }} />
          </PieChart>
        </ResponsiveContainer>

        {showCenterTotal && (
          <div className={styles.center} aria-hidden>
            <span className={styles.centerValue}>{formatDocumentAmount(totalAmount)}</span>
            <span className={styles.centerLabel}>total</span>
            <span className={styles.centerCount}>{conceptCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
