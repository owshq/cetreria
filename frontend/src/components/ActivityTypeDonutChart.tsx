import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  FilterPillBar,
  FilterPillControls,
  FilterPillSelect,
  useFilterPillMenu,
} from '@/components/FilterPillSelect';
import type { Activity, ActivityType, CalendarEvent, Document, UserAssignee } from '@shared/types';
import { formatDocumentAmount } from '@shared/types';
import {
  buildActivityChartBuckets,
  getTotalHours,
  toChartData,
  type ActivityGroupBy,
  type ActivityValueMeasure,
  type ChartDatum,
} from '@/components/clientCharts/utils';
import { ANIMATION, CHART_MARGINS, getChartStrokeSurface } from '@/components/clientCharts/chartTheme';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import { cx } from '@/lib/cx';
import styles from './ActivityTypeDonutChart.module.css';

const MAX_SLICES = 6;

type Props = {
  activities: Activity[];
  events: CalendarEvent[];
  assignees: UserAssignee[];
  documents: Document[];
  activityTypes: ActivityType[];
  from: string;
  to: string;
  groupBy: ActivityGroupBy;
  valueMeasure: ActivityValueMeasure;
  className?: string;
};

function formatChartHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function limitChartData(data: ChartDatum[]): ChartDatum[] {
  if (data.length <= MAX_SLICES) return data;

  const top = data.slice(0, MAX_SLICES);
  const othersValue = data.slice(MAX_SLICES).reduce((sum, entry) => sum + entry.hours, 0);
  const total = data.reduce((sum, entry) => sum + entry.hours, 0);

  if (othersValue <= 0) return top;

  return [
    ...top,
    {
      typeId: '__others__',
      label: 'Otros',
      shortName: 'Otros',
      hours: othersValue,
      color: top[top.length - 1]?.color ?? '#a3a3a3',
      percent: total > 0 ? Math.round((othersValue / total) * 100) : 0,
    },
  ];
}

type ActivityChartMenu = 'dimension' | 'measure';

const DIMENSION_OPTIONS = [
  { id: 'type' as const, label: 'Actividad' },
  { id: 'team' as const, label: 'Equipo' },
];

const MEASURE_OPTIONS = [
  { id: 'hours' as const, label: 'Horas' },
  { id: 'income' as const, label: 'Ingresos' },
];

export function ActivityChartToggles({
  groupBy,
  valueMeasure,
  onGroupByChange,
  onValueMeasureChange,
  className,
}: {
  groupBy: ActivityGroupBy;
  valueMeasure: ActivityValueMeasure;
  onGroupByChange: (groupBy: ActivityGroupBy) => void;
  onValueMeasureChange: (valueMeasure: ActivityValueMeasure) => void;
  className?: string;
}) {
  const { controlsRef, openMenu, setOpenMenu, toggleMenu } =
    useFilterPillMenu<ActivityChartMenu>();

  return (
    <FilterPillControls
      className={className}
      toggleAriaLabel="Opciones del gráfico de actividades"
    >
      <div ref={controlsRef}>
      <FilterPillBar ariaLabel="Opciones del gráfico de actividades">
        <FilterPillSelect
          menu="dimension"
          groupLabel="Dimensión"
          value={groupBy}
          options={DIMENSION_OPTIONS}
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
          value={valueMeasure}
          options={MEASURE_OPTIONS}
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

function ActivityDonutTooltip({
  active,
  payload,
  valueMeasure,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum; color?: string }>;
  valueMeasure: ActivityValueMeasure;
}) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;
  const swatchColor = payload[0].color ?? item.color;
  const valueLabel =
    valueMeasure === 'income'
      ? `${formatDocumentAmount(item.hours)} · ${item.percent}%`
      : `${formatChartHours(item.hours)} · ${item.percent}%`;

  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipDot} style={{ backgroundColor: swatchColor }} aria-hidden />
      <div className={styles.tooltipBody}>
        <span className={styles.tooltipTitle}>{item.label}</span>
        <span className={styles.tooltipValue}>{valueLabel}</span>
      </div>
    </div>
  );
}

export default function ActivityTypeDonutChart({
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
  useChartThemeVersion();
  const chartStrokeSurface = getChartStrokeSurface();

  const chartData = useMemo(() => {
    const buckets = buildActivityChartBuckets(
      groupBy,
      valueMeasure,
      activities,
      events,
      assignees,
      documents,
      activityTypes,
      from,
      to,
    );
    return limitChartData(toChartData(buckets));
  }, [
    activities,
    events,
    assignees,
    documents,
    activityTypes,
    from,
    to,
    groupBy,
    valueMeasure,
  ]);

  const total = useMemo(() => getTotalHours(chartData), [chartData]);
  const sliceCount = chartData.filter((entry) => entry.typeId !== '__others__').length;

  const centerValue =
    valueMeasure === 'income' ? formatDocumentAmount(total) : formatChartHours(total);

  const emptyMessage =
    groupBy === 'team'
      ? valueMeasure === 'income'
        ? 'No hay ingresos asignados al equipo en el periodo seleccionado.'
        : 'No hay horas asignadas al equipo en el periodo seleccionado.'
      : valueMeasure === 'income'
        ? 'No hay ingresos vinculados a actividades en el periodo seleccionado.'
        : 'No hay horas registradas en el periodo seleccionado.';

  const chartAriaLabel =
    groupBy === 'team'
      ? `Distribución por equipo · ${valueMeasure === 'income' ? 'ingresos' : 'horas'}`
      : `Distribución por tipo de actividad · ${valueMeasure === 'income' ? 'ingresos' : 'horas'}`;

  const chartHeight = Math.max(160, Math.min(220, 150 + sliceCount * 8));

  return (
    <div className={cx(styles.wrap, className)} aria-label={chartAriaLabel}>
      {chartData.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.chartWrap} style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={CHART_MARGINS.donut}>
              <Pie
                data={chartData}
                dataKey="hours"
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
                  <Cell key={entry.typeId} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={<ActivityDonutTooltip valueMeasure={valueMeasure} />}
                wrapperStyle={{ outline: 'none' }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className={styles.center} aria-hidden>
            <span className={styles.centerValue}>{centerValue}</span>
            <span className={styles.centerLabel}>total</span>
            <span className={styles.centerCount}>{sliceCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
