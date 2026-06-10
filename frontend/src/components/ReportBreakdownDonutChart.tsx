import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  FilterPillBar,
  FilterPillControls,
  FilterPillSelect,
  useFilterPillMenu,
} from '@/components/FilterPillSelect';
import { formatDocumentAmount } from '@shared/types';
import { applyChartPalette } from '@/lib/chartColorPalette';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import type { ReportBreakdownRow } from '@/lib/reportInstitutionalText';
import { cx } from '@/lib/cx';
import styles from './InvoiceConceptsDonutChart.module.css';

const MAX_SLICES = 6;

export type ReportBreakdownMeasure = 'hours' | 'amount' | 'signatures';

type BreakdownChartDatum = {
  id: string;
  label: string;
  value: number;
  percent: number;
  color: string;
};

type TooltipPayload = {
  payload: BreakdownChartDatum;
  color?: string;
};

type Props = {
  rows: ReportBreakdownRow[];
  measure: ReportBreakdownMeasure;
  ariaLabel: string;
  className?: string;
};

const SIGNATURE_SLICE_COLORS: Record<string, string> = {
  Firmadas: '#16a34a',
  'Sin firma': '#ea580c',
};

function rowValue(row: ReportBreakdownRow, measure: ReportBreakdownMeasure): number {
  if (measure === 'signatures') return row.activities;
  return measure === 'hours' ? row.hours : row.paidAmount;
}

function formatMeasureValue(value: number, measure: ReportBreakdownMeasure): string {
  if (measure === 'signatures') {
    return value === 1 ? '1 actividad' : `${value} actividades`;
  }
  if (measure === 'amount') return formatDocumentAmount(value);
  return Number.isInteger(value) ? `${value}h` : `${value.toFixed(1)}h`;
}

function buildChartData(
  rows: ReportBreakdownRow[],
  measure: ReportBreakdownMeasure,
): BreakdownChartDatum[] {
  const sorted = [...rows]
    .filter((row) => rowValue(row, measure) > 0)
    .sort((a, b) => rowValue(b, measure) - rowValue(a, measure) || a.name.localeCompare(b.name, 'es'));

  if (sorted.length === 0) return [];

  const total = sorted.reduce((sum, row) => sum + rowValue(row, measure), 0);
  if (total <= 0) return [];

  const toDatum = (row: ReportBreakdownRow, id: string): Omit<BreakdownChartDatum, 'color'> => {
    const value = rowValue(row, measure);
    return {
      id,
      label: row.name,
      value,
      percent: Math.round((value / total) * 100),
    };
  };

  let items: Omit<BreakdownChartDatum, 'color'>[];

  if (sorted.length <= MAX_SLICES) {
    items = sorted.map((row, index) => toDatum(row, `${row.name}-${index}`));
  } else {
    const top = sorted.slice(0, MAX_SLICES).map((row, index) => toDatum(row, `${row.name}-${index}`));
    const othersValue = sorted.slice(MAX_SLICES).reduce((sum, row) => sum + rowValue(row, measure), 0);

    items = top;
    if (othersValue > 0) {
      items.push({
        id: '__others__',
        label: 'Otros',
        value: othersValue,
        percent: Math.round((othersValue / total) * 100),
      });
    }
  }

  const withPalette = applyChartPalette(items.map((item) => ({ ...item, color: '' })));

  if (measure === 'signatures') {
    return withPalette.map((item) => ({
      ...item,
      color: SIGNATURE_SLICE_COLORS[item.label] ?? item.color,
    }));
  }

  return withPalette;
}

export function hasReportBreakdownChartData(
  rows: ReportBreakdownRow[],
  measure: ReportBreakdownMeasure,
): boolean {
  return rows.some((row) => rowValue(row, measure) > 0);
}

export function reportBreakdownTotal(
  rows: ReportBreakdownRow[],
  measure: ReportBreakdownMeasure,
): number {
  return rows.reduce((sum, row) => sum + rowValue(row, measure), 0);
}

type BreakdownChartMenu = 'measure';

const BASE_MEASURE_OPTIONS = [
  { id: 'hours' as const, label: 'Horas' },
  { id: 'amount' as const, label: 'Facturación' },
] as const;

const SIGNATURES_MEASURE_OPTION = { id: 'signatures' as const, label: 'Firmas' };

export function ReportBreakdownChartToggles({
  measure,
  onMeasureChange,
  includeSignatures = false,
  className,
}: {
  measure: ReportBreakdownMeasure;
  onMeasureChange: (measure: ReportBreakdownMeasure) => void;
  includeSignatures?: boolean;
  className?: string;
}) {
  const measureOptions = includeSignatures
    ? [...BASE_MEASURE_OPTIONS, SIGNATURES_MEASURE_OPTION]
    : BASE_MEASURE_OPTIONS;
  const { controlsRef, openMenu, setOpenMenu, toggleMenu } =
    useFilterPillMenu<BreakdownChartMenu>();

  return (
    <FilterPillControls className={className} toggleAriaLabel="Opciones del gráfico">
      <div ref={controlsRef}>
        <FilterPillBar ariaLabel="Opciones del gráfico">
          <FilterPillSelect
            menu="measure"
            groupLabel="Medida"
            value={measure}
            options={measureOptions}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(next) => {
              onMeasureChange(next);
              setOpenMenu(null);
            }}
          />
        </FilterPillBar>
      </div>
    </FilterPillControls>
  );
}

function BreakdownDonutTooltip({
  active,
  payload,
  measure,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  measure: ReportBreakdownMeasure;
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
          {formatMeasureValue(item.value, measure)} {'\u00b7'} {item.percent}%
        </span>
      </div>
    </div>
  );
}

export default function ReportBreakdownDonutChart({
  rows,
  measure,
  ariaLabel,
  className,
}: Props) {
  useChartThemeVersion();
  const chartStrokeSurface = getChartStrokeSurface();

  const chartData = useMemo(() => buildChartData(rows, measure), [rows, measure]);
  const total = useMemo(() => reportBreakdownTotal(rows, measure), [rows, measure]);
  const entityCount = useMemo(
    () => rows.filter((row) => rowValue(row, measure) > 0).length,
    [rows, measure],
  );

  if (chartData.length === 0) return null;

  return (
    <div className={cx(styles.wrap, className)} aria-label={ariaLabel}>
      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={CHART_MARGINS.donut}>
            <Pie
              data={chartData}
              dataKey="value"
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
            <Tooltip
              content={<BreakdownDonutTooltip measure={measure} />}
              wrapperStyle={{ outline: 'none' }}
            />
          </PieChart>
        </ResponsiveContainer>

        {total > 0 && (
          <div className={styles.center} aria-hidden>
            <span className={styles.centerValue}>
              {measure === 'signatures' ? String(total) : formatMeasureValue(total, measure)}
            </span>
            <span className={styles.centerLabel}>
              {measure === 'signatures' ? 'actividades' : 'total'}
            </span>
            {measure !== 'signatures' && <span className={styles.centerCount}>{entityCount}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
