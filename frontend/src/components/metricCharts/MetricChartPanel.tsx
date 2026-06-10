import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import { usersService } from '@/api';
import {
  FilterPillBar,
  FilterPillControls,
  FilterPillSelect,
  useFilterPillMenu,
  type FilterPillOption,
} from '@/components/FilterPillSelect';
import EmptyState from '@/components/EmptyState';
import { buildMetricChartData } from '@/lib/metricChartData';
import {
  canUseLineChart,
  CHART_CONTROL_LABELS,
  CHART_TYPE_LABELS,
  fieldsFromDimensionMeasure,
  getChartDimension,
  getChartDimensionOptions,
  getChartFieldLabel,
  getChartMeasure,
  getChartTypeOptions,
  getDefaultChartType,
  getDefaultMeasureForDimension,
  getPolarMeasureOptions,
  isPolarChartType,
  getMetricChartPreset,
  METRIC_CHART_TITLES,
  metricChartPresetKey,
  resolveChartDimension,
  resolveDimensionMeasureSelection,
  type DashboardMetricKey,
  type MetricChartField,
  type MetricChartPreset,
  type MetricChartType,
  type MetricDimension,
  type MetricMeasure,
} from '@/lib/metricChartConfig';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import LineChartView from './LineChartView';
import MetricBarChartView from './MetricBarChartView';
import MetricDonutChartView from './MetricDonutChartView';
import MetricRadarChartView from './MetricRadarChartView';
import styles from './MetricChartPanel.module.css';

type MetricPanelMenu = 'chartType' | 'dimension' | 'measure';

function toChartTypeOptions(types: MetricChartType[]): FilterPillOption<MetricChartType>[] {
  return types.map((type) => ({ id: type, label: CHART_TYPE_LABELS[type] }));
}

function toMeasureOptions(measures: MetricMeasure[]): FilterPillOption<MetricMeasure>[] {
  return measures.map((measure) => ({
    id: measure,
    label: getChartFieldLabel(measure),
  }));
}

function toDimensionOptions(
  dimensions: MetricDimension[],
): FilterPillOption<MetricDimension>[] {
  return dimensions.map((dimension) => ({
    id: dimension,
    label: getChartFieldLabel(dimension),
  }));
}

function applyDimensionMeasure(
  dimension: MetricDimension,
  measure: MetricMeasure,
): { xAxis: MetricChartField; yAxis: MetricChartField } {
  return fieldsFromDimensionMeasure(dimension, measure);
}

type MetricChartPanelProps = {
  metric: DashboardMetricKey;
  activities: Activity[];
  events: CalendarEvent[];
  activityTypes: ActivityType[];
  clients: Client[];
  documents: Document[];
  from: string;
  to: string;
  /** Si se define, las opciones del gráfico se renderizan en este contenedor (p. ej. cabecera del dashboard). */
  controlsPortalTarget?: HTMLElement | null;
  /** Sincroniza la métrica del dashboard cuando la dimensión implica contactos o documentos. */
  onDimensionChange?: (dimension: MetricDimension) => void;
  /** Vista inicial al abrir la métrica; si no se indica, usa el preset del dashboard. */
  chartPreset?: MetricChartPreset;
  /** Muestra Tipo/Dimensión/Medida siempre visibles, sin botón colapsable. */
  inlineControls?: boolean;
};

export default function MetricChartPanel({
  metric,
  activities,
  events,
  activityTypes,
  clients,
  documents,
  from,
  to,
  controlsPortalTarget,
  onDimensionChange,
  chartPreset: chartPresetProp,
  inlineControls = false,
}: MetricChartPanelProps) {
  const resolvedPreset = chartPresetProp ?? getMetricChartPreset(metric);
  const initialAxes = applyDimensionMeasure(
    resolvedPreset.dimension,
    resolvedPreset.measure,
  );
  const chartThemeVersion = useChartThemeVersion();
  const chartTypeManualRef = useRef(false);
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const [xAxis, setXAxis] = useState<MetricChartField>(initialAxes.xAxis);
  const [yAxis, setYAxis] = useState<MetricChartField>(initialAxes.yAxis);
  const [chartType, setChartType] = useState<MetricChartType>(resolvedPreset.chartType);
  const presetKey = metricChartPresetKey(resolvedPreset);

  useEffect(() => {
    const preset = chartPresetProp ?? getMetricChartPreset(metric);
    const { xAxis: nextX, yAxis: nextY } = applyDimensionMeasure(
      preset.dimension,
      preset.measure,
    );
    chartTypeManualRef.current = false;
    setXAxis(nextX);
    setYAxis(nextY);
    setChartType(preset.chartType);
  }, [metric, presetKey, chartPresetProp]);
  const { controlsRef, openMenu, setOpenMenu, toggleMenu } =
    useFilterPillMenu<MetricPanelMenu>();

  const chartDimension = getChartDimension(xAxis, yAxis);
  const chartMeasure = getChartMeasure(xAxis, yAxis);
  const lineChartAvailable = canUseLineChart(xAxis, yAxis);
  const chartTypeOptions = getChartTypeOptions(metric, lineChartAvailable);

  useEffect(() => {
    let cancelled = false;
    void usersService.getAssignees().then((users) => {
      if (!cancelled) setAssignees(users);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayChartType =
    chartType === 'line' && !lineChartAvailable ? 'bar' : chartType;

  const dimensionOptions = getChartDimensionOptions(metric, displayChartType);

  useEffect(() => {
    const resolved = resolveDimensionMeasureSelection(
      metric,
      displayChartType,
      chartDimension,
      chartMeasure,
      { preserveMeasure: true },
    );
    if (resolved.dimension === chartDimension && resolved.measure === chartMeasure) return;
    const { xAxis: nextX, yAxis: nextY } = applyDimensionMeasure(
      resolved.dimension,
      resolved.measure,
    );
    setXAxis(nextX);
    setYAxis(nextY);
  }, [metric, displayChartType, chartDimension, chartMeasure]);
  const measureOptions = getPolarMeasureOptions(metric);

  const documentStatusFilter = resolvedPreset.documentStatuses;
  const documentScope = resolvedPreset.documentScope;
  const chartDocumentOptions = useMemo(
    () =>
      documentStatusFilter?.length || documentScope
        ? { documentStatuses: documentStatusFilter, documentScope }
        : undefined,
    [documentStatusFilter, documentScope],
  );

  const chart = useMemo(
    () =>
      buildMetricChartData(
        metric,
        xAxis,
        yAxis,
        activities,
        events,
        assignees,
        activityTypes,
        clients,
        documents,
        from,
        to,
        chartDocumentOptions,
      ),
    [
      metric,
      xAxis,
      yAxis,
      activities,
      events,
      assignees,
      activityTypes,
      clients,
      documents,
      from,
      to,
      chartThemeVersion,
      chartDocumentOptions,
    ],
  );

  useEffect(() => {
    chartTypeManualRef.current = false;
    setChartType((current) =>
      isPolarChartType(current) ? current : getDefaultChartType(xAxis, yAxis),
    );
  }, [xAxis, yAxis]);

  useEffect(() => {
    if (!lineChartAvailable && chartType === 'line') {
      setChartType('bar');
      chartTypeManualRef.current = false;
    }
  }, [lineChartAvailable, chartType]);

  useEffect(() => {
    const { xAxis: nextX, yAxis: nextY } = applyDimensionMeasure(chartDimension, chartMeasure);
    if (xAxis === nextX && yAxis === nextY) return;
    setXAxis(nextX);
    setYAxis(nextY);
  }, [chartDimension, chartMeasure, xAxis, yAxis]);

  useEffect(() => {
    if (!isPolarChartType(displayChartType) || chartDimension !== 'time') return;
    const fallback = dimensionOptions[0];
    if (!fallback) return;
    const { xAxis: nextX, yAxis: nextY } = applyDimensionMeasure(
      fallback,
      displayChartType === 'donut' ? 'income' : chartMeasure,
    );
    setXAxis(nextX);
    setYAxis(nextY);
  }, [displayChartType, chartDimension, dimensionOptions, chartMeasure]);

  useEffect(() => {
    if (chartTypeManualRef.current) return;
    setChartType((current) => {
      if (isPolarChartType(current)) return current;
      if (current === resolvedPreset.chartType) return current;
      return chart.chartType;
    });
  }, [chart.chartType, resolvedPreset.chartType]);

  const hasData = chart.data.some((entry) => entry.value > 0);
  const isActivityLinkedDocsChart =
    documentScope === 'activityLinked' &&
    (chartDimension === 'documentStatus' || chartDimension === 'document');
  const emptyDescription = isActivityLinkedDocsChart
    ? 'No hay documentos vinculados a actividades del periodo.'
    : 'No hay datos para esta combinación en el periodo.';

  const setDimensionMeasure = (
    dimension: MetricDimension,
    measure: MetricMeasure,
    options?: { preserveMeasure?: boolean },
  ) => {
    const resolved = resolveDimensionMeasureSelection(
      metric,
      displayChartType,
      dimension,
      measure,
      options,
    );
    const { xAxis: nextX, yAxis: nextY } = applyDimensionMeasure(
      resolved.dimension,
      resolved.measure,
    );
    setXAxis(nextX);
    setYAxis(nextY);
    return resolved;
  };

  const chartViewKey = `${from}-${to}-${xAxis}-${yAxis}-${displayChartType}-${chart.orientation}`;

  const chartControls = (
    <FilterPillControls
      inline={inlineControls}
      toggleAriaLabel={`Opciones del gráfico · ${METRIC_CHART_TITLES[metric]}`}
    >
      <div ref={controlsRef}>
        <FilterPillBar ariaLabel={`Opciones del gráfico · ${METRIC_CHART_TITLES[metric]}`}>
          <FilterPillSelect
            menu="chartType"
            groupLabel="Tipo"
            value={displayChartType}
            options={toChartTypeOptions(chartTypeOptions)}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(option) => {
              chartTypeManualRef.current = true;
              if (option === 'line' && !canUseLineChart(xAxis, yAxis)) {
                setDimensionMeasure('time', chartMeasure);
              }
              if (option === 'donut' || option === 'radar') {
                const polarDimensions = getChartDimensionOptions(metric, option);
                const dimension = resolveChartDimension(chartDimension, polarDimensions);
                setDimensionMeasure(
                  dimension,
                  option === 'donut'
                    ? getDefaultMeasureForDimension(metric, dimension)
                    : chartMeasure,
                  { preserveMeasure: option !== 'donut' },
                );
              }
              setChartType(option);
              setOpenMenu(null);
            }}
          />

          <FilterPillSelect
            menu="dimension"
            groupLabel={CHART_CONTROL_LABELS.dimension}
            value={chartDimension}
            options={toDimensionOptions(dimensionOptions)}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(dimension) => {
              const resolved = setDimensionMeasure(
                dimension,
                getDefaultMeasureForDimension(metric, dimension),
              );
              onDimensionChange?.(resolved.dimension);
              setOpenMenu(null);
            }}
          />

          <FilterPillSelect
            menu="measure"
            groupLabel={CHART_CONTROL_LABELS.measure}
            value={chartMeasure}
            options={toMeasureOptions(measureOptions)}
            openMenu={openMenu}
            onToggle={toggleMenu}
            onSelect={(measure) => {
              setDimensionMeasure(chartDimension, measure, { preserveMeasure: true });
              setOpenMenu(null);
            }}
          />
        </FilterPillBar>
      </div>
    </FilterPillControls>
  );

  const portaledControls = controlsPortalTarget
    ? createPortal(chartControls, controlsPortalTarget)
    : null;

  return (
    <div className={styles.panel}>
      <div className={styles.chartBody} role="tabpanel">
        {!hasData ? (
          <EmptyState emoji="📊" description={emptyDescription} compact />
        ) : displayChartType === 'line' && chart.orientation === 'vertical' ? (
          <LineChartView key={chartViewKey} data={chart.data} valueFormat={chart.valueFormat} />
        ) : displayChartType === 'radar' ? (
          <MetricRadarChartView
            key={chartViewKey}
            data={chart.data}
            valueFormat={chart.valueFormat}
          />
        ) : displayChartType === 'donut' ? (
          <MetricDonutChartView
            key={chartViewKey}
            data={chart.data}
            valueFormat={chart.valueFormat}
          />
        ) : (
          <MetricBarChartView
            key={chartViewKey}
            data={chart.data}
            valueFormat={chart.valueFormat}
            orientation={chart.orientation}
          />
        )}
      </div>

      {portaledControls}

      {!controlsPortalTarget && (
        <div className={styles.panelControlsBelow}>{chartControls}</div>
      )}
    </div>
  );
}
