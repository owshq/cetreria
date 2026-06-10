import { useMemo, useState, type RefObject } from 'react';
import type { Activity, ActivityType } from '@shared/types';
import { cx } from '@/lib/cx';
import EmptyState from '@/components/EmptyState';
import BarChartView from './BarChartView';
import DonutChartView from './DonutChartView';
import HorizontalBarChartView from './HorizontalBarChartView';
import RadarChartView from './RadarChartView';
import { CHART_MODE_LABELS, type ChartMode } from './chartTypes';
import { buildTypeBuckets, toChartData } from './utils';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import styles from './ClientActivityTypeChart.module.css';

export type { ChartMode } from './chartTypes';
export { CHART_MODE_LABELS } from './chartTypes';

type ClientActivityTypeChartProps = {
  activities: Activity[];
  activityTypes: ActivityType[];
  className?: string;
  /** Línea superior cuando el gráfico va debajo de otras métricas */
  separated?: boolean;
  mode?: ChartMode;
  onModeChange?: (mode: ChartMode) => void;
  chartPanelRef?: RefObject<HTMLDivElement | null>;
};

const CHART_MODES: Array<{ id: ChartMode; label: string }> = [
  { id: 'bars', label: 'Barras' },
  { id: 'rows', label: 'Filas' },
  { id: 'radar', label: 'Radar' },
  { id: 'donut', label: 'Anillo' },
];

export default function ClientActivityTypeChart({
  activities,
  activityTypes,
  className,
  separated = false,
  mode: controlledMode,
  onModeChange,
  chartPanelRef,
}: ClientActivityTypeChartProps) {
  const [internalMode, setInternalMode] = useState<ChartMode>('bars');
  const mode = controlledMode ?? internalMode;

  const setMode = (next: ChartMode) => {
    if (controlledMode === undefined) setInternalMode(next);
    onModeChange?.(next);
  };

  const chartThemeVersion = useChartThemeVersion();

  const chartData = useMemo(() => {
    const buckets = buildTypeBuckets(activities, activityTypes);
    return toChartData(buckets);
  }, [activities, activityTypes, chartThemeVersion]);

  const isEmpty = chartData.length === 0;

  return (
    <div className={cx(styles.chart, separated && styles.chartSeparated, className)}>
      <div className={styles.tabs} role="tablist" aria-label="Tipo de gráfico">
        {CHART_MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            aria-controls={`client-chart-${id}`}
            id={`client-chart-tab-${id}`}
            className={cx(styles.tab, mode === id && styles.tabActive)}
            onClick={() => setMode(id)}
            title={label}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id={`client-chart-${mode}`}
        role="tabpanel"
        aria-labelledby={`client-chart-tab-${mode}`}
        className={cx(styles.panel, isEmpty && styles.panelEmpty)}
        ref={chartPanelRef}
        data-chart-mode={mode}
        aria-label={CHART_MODE_LABELS[mode]}
      >
        {isEmpty ? (
          <EmptyState
            emoji="📊"
            description="No hay actividades en el periodo seleccionado."
            compact
          />
        ) : (
          <>
            {mode === 'bars' && <BarChartView data={chartData} />}
            {mode === 'rows' && <HorizontalBarChartView data={chartData} />}
            {mode === 'radar' && <RadarChartView data={chartData} />}
            {mode === 'donut' && <DonutChartView data={chartData} />}
          </>
        )}
      </div>
    </div>
  );
}
