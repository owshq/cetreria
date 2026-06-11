import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  type LabelProps,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FilterPillBar,
  FilterPillControls,
  FilterPillSelect,
  useFilterPillMenu,
} from '@/components/FilterPillSelect';
import {
  getMetricValueAxisWidth,
  METRIC_CHART_MARGINS,
} from '@/components/metricCharts/metricChartLayout';
import { formatMetricChartValue } from '@/lib/metricChartData';
import {
  ANIMATION,
  getAxisLine,
  getAxisTick,
  getGridStroke,
  getTooltipCursor,
} from '@/components/clientCharts/chartTheme';
import { buildScaleMax, type ChartDatum } from '@/components/clientCharts/utils';
import chartStyles from '@/components/clientCharts/ClientActivityTypeChart.module.css';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import { getShiftPaletteColor, type ShiftColorMap } from '@/lib/shiftColorPalette';
import {
  buildWorkShiftsChartBuckets,
  buildWorkShiftsStackedChartRows,
  getActiveWorkShiftStackCodes,
  getTopShiftForStackRow,
  isWorkShiftsHoursMeasure,
  toRechartsStackedRow,
  type WorkShiftsGroupBy,
  type WorkShiftsStackedBarRow,
  type WorkShiftsValueMeasure,
} from '@/lib/workShiftsChartUtils';
import { cx } from '@/lib/cx';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Document,
  ShiftCode,
  UserAssignee,
} from '@shared/types';
import { formatDocumentAmount, SHIFT_META } from '@shared/types';
import styles from './WorkShiftsBarChart.module.css';

const MAX_BARS = 8;
const ROUNDED_BAR_TOP: [number, number, number, number] = [8, 8, 0, 0];
const FLAT_BAR_RADIUS: [number, number, number, number] = [0, 0, 0, 0];

type Props = {
  activities: Activity[];
  events: CalendarEvent[];
  assignees: UserAssignee[];
  documents: Document[];
  activityTypes: ActivityType[];
  from: string;
  to: string;
  groupBy: WorkShiftsGroupBy;
  valueMeasure: WorkShiftsValueMeasure;
  className?: string;
};

type WorkShiftsChartMenu = 'dimension' | 'measure';

const DIMENSION_OPTIONS = [
  { id: 'team' as const, label: 'Operario' },
  { id: 'shift' as const, label: 'Turno' },
  { id: 'type' as const, label: 'Actividad' },
];

const MEASURE_OPTIONS = [
  { id: 'hours' as const, label: 'Horas' },
  { id: 'hoursSigned' as const, label: 'Horas firmadas' },
  { id: 'hoursAssigned' as const, label: 'Horas asignadas' },
  { id: 'income' as const, label: 'Ingresos' },
];

export function getWorkShiftsMeasureOptions(workerSignaturesEnabled: boolean) {
  if (workerSignaturesEnabled) return MEASURE_OPTIONS;
  return MEASURE_OPTIONS.filter(
    (option) => option.id !== 'hoursSigned' && option.id !== 'hoursAssigned',
  );
}

export function getWorkShiftsDimensionOptions(shiftSchedulingEnabled: boolean) {
  if (shiftSchedulingEnabled) return DIMENSION_OPTIONS;
  return DIMENSION_OPTIONS.filter((option) => option.id !== 'shift');
}

export function normalizeWorkShiftsValueMeasure(
  valueMeasure: WorkShiftsValueMeasure,
  workerSignaturesEnabled: boolean,
): WorkShiftsValueMeasure {
  if (workerSignaturesEnabled) return valueMeasure;
  if (valueMeasure === 'hoursSigned' || valueMeasure === 'hoursAssigned') return 'hours';
  return valueMeasure;
}

type SimpleBarDatum = ChartDatum & {
  signedHours: number;
  pendingHours: number;
};

type RechartsStackRow = ReturnType<typeof toRechartsStackedRow>;

function formatChartHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function formatMeasureValue(value: number, valueMeasure: WorkShiftsValueMeasure): string {
  return valueMeasure === 'income' ? formatDocumentAmount(value) : formatChartHours(value);
}

function formatHybridBarLabel(signed: number, assigned: number): string {
  if (assigned <= 0) return '';
  if (signed <= 0) return formatChartHours(assigned);
  return `${formatChartHours(signed)} / ${formatChartHours(assigned)}`;
}

function pendingBarFill(baseColor: string): string {
  return `color-mix(in srgb, ${baseColor} 36%, var(--color-bg-muted))`;
}

function toSimpleBarData(
  buckets: ReturnType<typeof buildWorkShiftsChartBuckets>,
  valueMeasure: WorkShiftsValueMeasure,
  hybridHoursEnabled: boolean,
): SimpleBarDatum[] {
  const total = buckets.reduce((sum, bucket) => sum + bucket.hours, 0);

  return buckets.map((bucket) => {
    const signedHours =
      hybridHoursEnabled && valueMeasure === 'hours'
        ? Math.min(bucket.hours, bucket.signedHours ?? 0)
        : 0;
    const pendingHours =
      hybridHoursEnabled && valueMeasure === 'hours'
        ? Math.max(0, bucket.hours - signedHours)
        : 0;

    return {
      typeId: bucket.typeId,
      label: bucket.label,
      shortName:
        bucket.label.length <= 10 ? bucket.label : `${bucket.label.slice(0, 9)}…`,
      hours: bucket.hours,
      signedHours,
      pendingHours,
      color: bucket.color,
      percent: total > 0 ? Math.round((bucket.hours / total) * 100) : 0,
    };
  });
}

function limitSimpleBarData(data: SimpleBarDatum[]): SimpleBarDatum[] {
  if (data.length <= MAX_BARS) return data;

  const top = data.slice(0, MAX_BARS);
  const rest = data.slice(MAX_BARS);
  const othersValue = rest.reduce((sum, entry) => sum + entry.hours, 0);
  const othersSigned = rest.reduce((sum, entry) => sum + entry.signedHours, 0);
  const total = data.reduce((sum, entry) => sum + entry.hours, 0);

  if (othersValue <= 0) return top;

  return [
    ...top,
    {
      typeId: '__others__',
      label: 'Otros',
      shortName: 'Otros',
      hours: othersValue,
      signedHours: othersSigned,
      pendingHours: Math.max(0, othersValue - othersSigned),
      color: top[top.length - 1]?.color ?? '#a3a3a3',
      percent: total > 0 ? Math.round((othersValue / total) * 100) : 0,
    },
  ];
}

function limitStackedBarRows(rows: WorkShiftsStackedBarRow[]): WorkShiftsStackedBarRow[] {
  if (rows.length <= MAX_BARS) return rows;

  const top = rows.slice(0, MAX_BARS);
  const rest = rows.slice(MAX_BARS);
  const othersSegments: Partial<Record<ShiftCode, number>> = {};
  const othersSignedSegments: Partial<Record<ShiftCode, number>> = {};

  for (const row of rest) {
    for (const [shift, value] of Object.entries(row.segments) as Array<[ShiftCode, number]>) {
      if (!value) continue;
      othersSegments[shift] = (othersSegments[shift] ?? 0) + value;
    }
    for (const [shift, value] of Object.entries(row.signedSegments) as Array<
      [ShiftCode, number]
    >) {
      if (!value) continue;
      othersSignedSegments[shift] = (othersSignedSegments[shift] ?? 0) + value;
    }
  }

  const othersTotal = Object.values(othersSegments).reduce((sum, value) => sum + (value ?? 0), 0);
  if (othersTotal <= 0) return top;

  const othersSignedTotal = Object.values(othersSignedSegments).reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );

  return [
    ...top,
    {
      typeId: '__others__',
      label: 'Otros',
      shortName: 'Otros',
      total: othersTotal,
      signedTotal: othersSignedTotal,
      segments: othersSegments,
      signedSegments: othersSignedSegments,
    },
  ];
}

function WorkShiftsSimpleBarTooltip({
  active,
  payload,
  valueMeasure,
  hybridHoursEnabled,
}: {
  active?: boolean;
  payload?: Array<{ payload: SimpleBarDatum; color?: string }>;
  valueMeasure: WorkShiftsValueMeasure;
  hybridHoursEnabled: boolean;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  const swatchColor = payload[0].color ?? item.color;
  const isHybrid = hybridHoursEnabled && valueMeasure === 'hours';
  const valueLabel = isHybrid
    ? `${formatChartHours(item.signedHours)} firmadas · ${formatChartHours(item.hours)} asignadas · ${item.percent}%`
    : `${formatMeasureValue(item.hours, valueMeasure)} · ${item.percent}%`;

  return (
    <div className={chartStyles.tooltip}>
      <span className={chartStyles.tooltipDot} style={{ backgroundColor: swatchColor }} aria-hidden />
      <div className={chartStyles.tooltipBody}>
        <span className={chartStyles.tooltipTitle}>{item.label}</span>
        <span className={chartStyles.tooltipValue}>{valueLabel}</span>
        {isHybrid && item.pendingHours > 0 ? (
          <span className={styles.tooltipSegment}>
            <span
              className={styles.tooltipSegmentDot}
              style={{ backgroundColor: pendingBarFill(swatchColor) }}
              aria-hidden
            />
            {formatChartHours(item.pendingHours)} pendientes de firma
          </span>
        ) : null}
      </div>
    </div>
  );
}

function WorkShiftsStackedBarTooltip({
  active,
  payload,
  valueMeasure,
  shiftColors,
  hybridHoursEnabled,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; payload?: RechartsStackRow }>;
  valueMeasure: WorkShiftsValueMeasure;
  shiftColors: ShiftColorMap;
  hybridHoursEnabled: boolean;
}) {
  if (!active || !payload?.length || !payload[0]?.payload) return null;

  const row = payload[0].payload;
  const total = Number(row.total) || 0;
  const signedTotal = Number(row.signedTotal) || 0;
  const isHybrid = hybridHoursEnabled && valueMeasure === 'hours';

  const entries = payload
    .filter((item) => typeof item.value === 'number' && item.value > 0 && item.dataKey)
    .filter((item) => !String(item.dataKey).includes('_'))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div className={chartStyles.tooltip}>
      <div className={chartStyles.tooltipBody}>
        <span className={chartStyles.tooltipTitle}>{row.label}</span>
        <span className={chartStyles.tooltipValue}>
          {isHybrid
            ? `${formatChartHours(signedTotal)} firmadas · ${formatChartHours(total)} asignadas`
            : `${formatMeasureValue(total, valueMeasure)} total`}
        </span>
        {entries.map((item) => {
          const shift = item.dataKey as ShiftCode;
          const meta = SHIFT_META[shift];
          const assigned = item.value ?? 0;
          const signed = Number(row[`${shift}_signed`] ?? 0);
          const pending = Math.max(0, assigned - signed);
          const percent = total > 0 ? Math.round((assigned / total) * 100) : 0;
          const baseColor = getShiftPaletteColor(shift, shiftColors);
          return (
            <span key={shift} className={styles.tooltipSegment}>
              <span
                className={styles.tooltipSegmentDot}
                style={{ backgroundColor: baseColor }}
                aria-hidden
              />
              {meta?.label ?? shift}:{' '}
              {isHybrid
                ? `${formatChartHours(signed)} firm. · ${formatChartHours(assigned)} asig. · ${percent}%`
                : `${formatMeasureValue(assigned, valueMeasure)} · ${percent}%`}
              {isHybrid && pending > 0
                ? ` · ${formatChartHours(pending)} pend.`
                : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function WorkShiftsChartToggles({
  groupBy,
  valueMeasure,
  onGroupByChange,
  onValueMeasureChange,
  workerSignaturesEnabled,
  shiftSchedulingEnabled,
  className,
}: {
  groupBy: WorkShiftsGroupBy;
  valueMeasure: WorkShiftsValueMeasure;
  onGroupByChange: (groupBy: WorkShiftsGroupBy) => void;
  onValueMeasureChange: (valueMeasure: WorkShiftsValueMeasure) => void;
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
  className?: string;
}) {
  const { controlsRef, openMenu, setOpenMenu, toggleMenu } =
    useFilterPillMenu<WorkShiftsChartMenu>();
  const dimensionOptions = getWorkShiftsDimensionOptions(shiftSchedulingEnabled);
  const measureOptions = getWorkShiftsMeasureOptions(workerSignaturesEnabled);
  const effectiveValueMeasure = normalizeWorkShiftsValueMeasure(
    valueMeasure,
    workerSignaturesEnabled,
  );

  return (
    <FilterPillControls
      className={className}
      toggleAriaLabel="Opciones del gráfico de horas de actividad"
    >
      <div ref={controlsRef}>
        <FilterPillBar ariaLabel="Opciones del gráfico de horas de actividad">
          <FilterPillSelect
            menu="dimension"
            groupLabel="Dimensión"
            value={groupBy}
            options={dimensionOptions}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(next) => {
              onGroupByChange(next);
              setOpenMenu(null);
            }}
          />
          <FilterPillSelect
            menu="measure"
            groupLabel="Medida"
            value={effectiveValueMeasure}
            options={measureOptions}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(next) => {
              onValueMeasureChange(next);
              setOpenMenu(null);
            }}
          />
        </FilterPillBar>
      </div>
    </FilterPillControls>
  );
}

function getHybridTopSegment(row: RechartsStackRow, shift: ShiftCode): 'signed' | 'pending' | null {
  const pending = Number(row[`${shift}_pending`] ?? 0);
  const signed = Number(row[`${shift}_signed`] ?? 0);
  if (pending > 0) return 'pending';
  if (signed > 0) return 'signed';
  return null;
}

function StackedBarTopLabel({
  shift,
  segment,
  chartData,
  valueMeasure,
  hybridHoursEnabled,
  x,
  y,
  width,
  index,
}: LabelProps & {
  shift: ShiftCode;
  segment: 'signed' | 'pending' | 'total';
  chartData: RechartsStackRow[];
  valueMeasure: WorkShiftsValueMeasure;
  hybridHoursEnabled: boolean;
}) {
  if (index == null || x == null || y == null || width == null) return null;

  const row = chartData[index];
  if (!row || getTopShiftForStackRow(row) !== shift) return null;

  const total = Number(row.total ?? 0);
  if (total <= 0) return null;

  const isHybrid = hybridHoursEnabled && valueMeasure === 'hours';
  if (isHybrid) {
    const topSegment = getHybridTopSegment(row, shift);
    if (segment !== topSegment) return null;
    const signedTotal = Number(row.signedTotal ?? 0);
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Number(y) - 4}
        textAnchor="middle"
        className={styles.stackedBarTopLabel}
      >
        {formatHybridBarLabel(signedTotal, total)}
      </text>
    );
  }

  if (segment !== 'total') return null;

  return (
    <text
      x={Number(x) + Number(width) / 2}
      y={Number(y) - 4}
      textAnchor="middle"
      className={styles.stackedBarTopLabel}
    >
      {formatMeasureValue(total, valueMeasure)}
    </text>
  );
}

function HoursHybridLegend() {
  return (
    <ul className={styles.hoursHybridLegend} aria-label="Leyenda de horas firmadas y asignadas">
      <li className={styles.hoursHybridLegendItem}>
        <span className={styles.hoursHybridLegendSwatch} style={{ backgroundColor: 'var(--color-primary)' }} aria-hidden />
        <span>Firmadas</span>
      </li>
      <li className={styles.hoursHybridLegendItem}>
        <span
          className={cx(styles.hoursHybridLegendSwatch, styles.hoursHybridLegendSwatchPending)}
          style={{ backgroundColor: 'var(--color-primary)' }}
          aria-hidden
        />
        <span>Asignadas sin firmar</span>
      </li>
    </ul>
  );
}

function ShiftLegend({
  shifts,
  shiftColors,
}: {
  shifts: ShiftCode[];
  shiftColors: ShiftColorMap;
}) {
  if (shifts.length === 0) return null;

  return (
    <ul className={styles.shiftLegend} aria-label="Leyenda de turnos">
      {shifts.map((shift) => {
        const meta = SHIFT_META[shift];
        return (
          <li key={shift} className={styles.shiftLegendItem}>
            <span
              className={styles.shiftLegendSwatch}
              style={{ backgroundColor: getShiftPaletteColor(shift, shiftColors) }}
              aria-hidden
            />
            <span>{meta.shortLabel}</span>
            <span className={styles.shiftLegendLabel}>{meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function WorkShiftsBarChart({
  activities,
  events,
  assignees,
  documents,
  activityTypes,
  from,
  to,
  groupBy,
  valueMeasure,
  className,
}: Props) {
  const shiftColors = useShiftColorPalette();
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const effectiveValueMeasure = normalizeWorkShiftsValueMeasure(
    valueMeasure,
    workerSignaturesEnabled,
  );

  const isStacked = shiftSchedulingEnabled && groupBy !== 'shift';
  const isHybridHours = workerSignaturesEnabled && effectiveValueMeasure === 'hours';
  const axisValueFormat = effectiveValueMeasure === 'income' ? 'income' : 'hours';

  const stackedRows = useMemo(() => {
    if (!isStacked) return [];
    return limitStackedBarRows(
      buildWorkShiftsStackedChartRows(
        groupBy,
        effectiveValueMeasure,
        activities,
        events,
        assignees,
        documents,
        activityTypes,
        from,
        to,
      ),
    );
  }, [
    isStacked,
    groupBy,
    effectiveValueMeasure,
    activities,
    events,
    assignees,
    documents,
    activityTypes,
    from,
    to,
  ]);

  const simpleChartData = useMemo(() => {
    if (isStacked) return [];
    const buckets = buildWorkShiftsChartBuckets(
      groupBy,
      effectiveValueMeasure,
      activities,
      events,
      assignees,
      documents,
      activityTypes,
      from,
      to,
    );
    return limitSimpleBarData(toSimpleBarData(buckets, effectiveValueMeasure, isHybridHours));
  }, [
    isStacked,
    groupBy,
    effectiveValueMeasure,
    isHybridHours,
    activities,
    events,
    assignees,
    documents,
    activityTypes,
    from,
    to,
    shiftColors,
  ]);

  const chartData = useMemo(
    () =>
      isStacked
        ? stackedRows.map((row) => toRechartsStackedRow(row, effectiveValueMeasure))
        : simpleChartData,
    [isStacked, stackedRows, simpleChartData, effectiveValueMeasure],
  );

  const activeShiftCodes = useMemo(
    () => (isStacked ? getActiveWorkShiftStackCodes(stackedRows) : []),
    [isStacked, stackedRows],
  );

  const maxBarTotal = useMemo(() => {
    if (isStacked) {
      return stackedRows.reduce((max, row) => Math.max(max, row.total), 0);
    }
    return simpleChartData[0]?.hours ?? 0;
  }, [isStacked, stackedRows, simpleChartData]);

  const scaleMax = buildScaleMax(maxBarTotal);
  const valueAxisWidth = getMetricValueAxisWidth(axisValueFormat, scaleMax);
  const axisTick = getAxisTick();
  const axisLine = getAxisLine();
  const gridStroke = getGridStroke();
  const tooltipCursor = getTooltipCursor();
  const formatAxisValue = (value: number) => formatMetricChartValue(value, axisValueFormat);
  const formatBarLabel = (value: number) =>
    value > 0 ? formatMeasureValue(value, effectiveValueMeasure) : '';

  const measureLabel =
    effectiveValueMeasure === 'income'
      ? 'ingresos'
      : effectiveValueMeasure === 'hoursSigned'
        ? 'horas firmadas'
        : effectiveValueMeasure === 'hoursAssigned'
          ? 'horas asignadas'
          : 'horas';

  const emptyMessage =
    groupBy === 'team'
      ? effectiveValueMeasure === 'income'
        ? 'No hay ingresos por operario en actividades con horas.'
        : effectiveValueMeasure === 'hoursSigned'
          ? 'No hay horas firmadas por operario en el periodo seleccionado.'
          : effectiveValueMeasure === 'hoursAssigned'
            ? 'No hay horas asignadas por operario en el periodo seleccionado.'
            : 'No hay horas por operario en el periodo seleccionado.'
      : groupBy === 'shift'
        ? effectiveValueMeasure === 'income'
          ? 'No hay ingresos por franja en el periodo seleccionado.'
          : effectiveValueMeasure === 'hoursSigned'
            ? 'No hay horas firmadas por franja en el periodo seleccionado.'
            : effectiveValueMeasure === 'hoursAssigned'
              ? 'No hay horas asignadas por franja en el periodo seleccionado.'
              : 'No hay horas por franja en el periodo seleccionado.'
        : effectiveValueMeasure === 'income'
          ? 'No hay ingresos por actividad en el periodo seleccionado.'
          : effectiveValueMeasure === 'hoursSigned'
            ? 'No hay horas firmadas por actividad en el periodo seleccionado.'
            : effectiveValueMeasure === 'hoursAssigned'
              ? 'No hay horas asignadas por actividad en el periodo seleccionado.'
              : 'No hay horas por actividad en el periodo seleccionado.';

  const chartAriaLabel =
    groupBy === 'team'
      ? `Horas por operario · ${measureLabel}`
      : groupBy === 'shift'
        ? `Horas por franja · ${measureLabel}`
        : `Horas por actividad · ${measureLabel}`;

  const barCount = chartData.length;
  const hasLongLabels = chartData.some((entry) => {
    const name = 'shortName' in entry ? String(entry.shortName ?? '') : '';
    return name.length > 10;
  });
  const chartHeight = Math.max(196, barCount * 34 + (hasLongLabels ? 52 : 36));

  return (
    <div className={cx(styles.wrap, className)} aria-label={chartAriaLabel}>
      {chartData.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <>
          <div className={chartStyles.chartSurface} style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={METRIC_CHART_MARGINS.vertical} barCategoryGap="22%">
                {!isStacked ? (
                  <defs>
                    {simpleChartData.map((entry) => (
                      <linearGradient
                        key={entry.typeId}
                        id={`work-shift-bar-${entry.typeId}`}
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
                ) : null}
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
                  width={valueAxisWidth}
                  tickFormatter={formatAxisValue}
                />
                <Tooltip
                  cursor={tooltipCursor}
                  content={
                    isStacked ? (
                      <WorkShiftsStackedBarTooltip
                        valueMeasure={effectiveValueMeasure}
                        shiftColors={shiftColors}
                        hybridHoursEnabled={isHybridHours}
                      />
                    ) : (
                      <WorkShiftsSimpleBarTooltip
                        valueMeasure={effectiveValueMeasure}
                        hybridHoursEnabled={isHybridHours}
                      />
                    )
                  }
                  wrapperStyle={{ outline: 'none' }}
                />
                {isStacked && isHybridHours ? (
                  activeShiftCodes.flatMap((shift) => {
                    const baseColor = getShiftPaletteColor(shift, shiftColors);
                    return [
                      <Bar
                        key={`${shift}_signed`}
                        dataKey={`${shift}_signed`}
                        stackId={shift}
                        fill={baseColor}
                        maxBarSize={42}
                        {...ANIMATION}
                      >
                        {chartData.map((row) => {
                          const topShift = getTopShiftForStackRow(row);
                          const topSegment =
                            topShift === shift ? getHybridTopSegment(row, shift) : null;
                          return (
                            <Cell
                              key={String(row.typeId)}
                              radius={
                                topSegment === 'signed' ? ROUNDED_BAR_TOP : FLAT_BAR_RADIUS
                              }
                            />
                          );
                        })}
                        <LabelList
                          dataKey="total"
                          position="top"
                          content={(props) => (
                            <StackedBarTopLabel
                              shift={shift}
                              segment="signed"
                              chartData={chartData}
                              valueMeasure={effectiveValueMeasure}
                              hybridHoursEnabled={isHybridHours}
                              {...props}
                            />
                          )}
                        />
                      </Bar>,
                      <Bar
                        key={`${shift}_pending`}
                        dataKey={`${shift}_pending`}
                        stackId="shiftMix"
                        fill={pendingBarFill(baseColor)}
                        maxBarSize={42}
                        {...ANIMATION}
                      >
                        {chartData.map((row) => {
                          const topShift = getTopShiftForStackRow(row);
                          const topSegment =
                            topShift === shift ? getHybridTopSegment(row, shift) : null;
                          return (
                            <Cell
                              key={String(row.typeId)}
                              radius={
                                topSegment === 'pending' ? ROUNDED_BAR_TOP : FLAT_BAR_RADIUS
                              }
                            />
                          );
                        })}
                        <LabelList
                          dataKey="total"
                          position="top"
                          content={(props) => (
                            <StackedBarTopLabel
                              shift={shift}
                              segment="pending"
                              chartData={chartData}
                              valueMeasure={effectiveValueMeasure}
                              hybridHoursEnabled={isHybridHours}
                              {...props}
                            />
                          )}
                        />
                      </Bar>,
                    ];
                  })
                ) : isStacked ? (
                  activeShiftCodes.map((shift) => (
                    <Bar
                      key={shift}
                      dataKey={shift}
                      stackId="shiftMix"
                      fill={getShiftPaletteColor(shift, shiftColors)}
                      maxBarSize={42}
                      {...ANIMATION}
                    >
                      {chartData.map((row) => {
                        const topShift = getTopShiftForStackRow(row);
                        return (
                          <Cell
                            key={String(row.typeId)}
                            radius={shift === topShift ? ROUNDED_BAR_TOP : FLAT_BAR_RADIUS}
                          />
                        );
                      })}
                      <LabelList
                        dataKey="total"
                        position="top"
                        content={(props) => (
                          <StackedBarTopLabel
                            shift={shift}
                            segment="total"
                            chartData={chartData}
                            valueMeasure={effectiveValueMeasure}
                            hybridHoursEnabled={isHybridHours}
                            {...props}
                          />
                        )}
                      />
                    </Bar>
                  ))
                ) : isHybridHours ? (
                  <>
                    <Bar
                      dataKey="signedHours"
                      stackId="hybridHours"
                      maxBarSize={42}
                      {...ANIMATION}
                    >
                      {simpleChartData.map((entry) => (
                        <Cell
                          key={`${entry.typeId}-signed`}
                          fill={entry.color}
                          radius={
                            entry.pendingHours > 0 ? FLAT_BAR_RADIUS : ROUNDED_BAR_TOP
                          }
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="pendingHours"
                      stackId="hybridHours"
                      maxBarSize={42}
                      {...ANIMATION}
                    >
                      {simpleChartData.map((entry) => (
                        <Cell
                          key={`${entry.typeId}-pending`}
                          fill={pendingBarFill(entry.color)}
                          radius={entry.pendingHours > 0 ? ROUNDED_BAR_TOP : FLAT_BAR_RADIUS}
                        />
                      ))}
                      <LabelList
                        dataKey="hours"
                        position="top"
                        content={({ x, y, width, index }) => {
                          if (index == null || x == null || y == null || width == null) {
                            return null;
                          }
                          const entry = simpleChartData[index];
                          if (!entry) return null;
                          return (
                            <text
                              x={Number(x) + Number(width) / 2}
                              y={Number(y) - 4}
                              textAnchor="middle"
                              className={chartStyles.barTopLabel}
                            >
                              {formatHybridBarLabel(entry.signedHours, entry.hours)}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </>
                ) : (
                  <Bar dataKey="hours" radius={ROUNDED_BAR_TOP} maxBarSize={42} {...ANIMATION}>
                    {simpleChartData.map((entry) => (
                      <Cell key={entry.typeId} fill={`url(#work-shift-bar-${entry.typeId})`} />
                    ))}
                    <LabelList
                      dataKey="hours"
                      position="top"
                      formatter={formatBarLabel}
                      className={chartStyles.barTopLabel}
                    />
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {isStacked ? (
            <>
              {shiftSchedulingEnabled ? (
                <ShiftLegend shifts={activeShiftCodes} shiftColors={shiftColors} />
              ) : null}
              {isHybridHours ? <HoursHybridLegend /> : null}
            </>
          ) : isHybridHours ? (
            <HoursHybridLegend />
          ) : null}
        </>
      )}
    </div>
  );
}
