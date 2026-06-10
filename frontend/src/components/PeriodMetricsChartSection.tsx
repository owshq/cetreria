import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
} from '@shared/types';
import MetricChartPanel from '@/components/metricCharts/MetricChartPanel';
import { cx } from '@/lib/cx';
import {
  dashboardMetricForDimension,
  describeChartPresetView,
  type DashboardMetricKey,
  type MetricChartPreset,
  type MetricDimension,
} from '@/lib/metricChartConfig';
import type { MetricDeltaTone } from '@/lib/metricDelta';
import ui from '@/styles/shared.module.css';
import dashboardStyles from '@/pages/Dashboard.module.css';
import styles from './PeriodMetricsChartSection.module.css';

export type PeriodMetricDelta = { text: string; tone: MetricDeltaTone };

export type PeriodMetricButtonConfig = {
  id: string;
  chartMetric: DashboardMetricKey;
  /** Tipo, dimensión y medida recomendados al activar esta métrica. */
  chartPreset: MetricChartPreset;
  chartPresets?: MetricChartPreset[];
  title: string;
  value: ReactNode;
  delta: PeriodMetricDelta;
  /** Variaciones mostradas a la derecha del valor principal. */
  valueDeltas?: PeriodMetricDelta[];
  sub?: ReactNode;
  /** Si es false, solo muestra el dato (sin gráfico al pulsar). */
  interactive?: boolean;
};

type PeriodMetricsChartSectionProps = {
  metrics: PeriodMetricButtonConfig[];
  /** @deprecated Usar métricas con `interactive: false` en `metrics`. */
  secondaryMetrics?: Array<{ title: string; value: ReactNode }>;
  selectedMetricId: string | null;
  chartsExpanded: boolean;
  onMetricSelect: (id: string, chartMetric: DashboardMetricKey) => void;
  onChartsToggle?: () => void;
  onChartDimensionChange?: (dimension: MetricDimension) => void;
  defaultMetricId: string;
  chartsPanelId: string;
  activities: Activity[];
  events: CalendarEvent[];
  activityTypes: ActivityType[];
  clients: Client[];
  documents: Document[];
  from: string;
  to: string;
  invalidCustomRange?: boolean;
  isDesktop?: boolean;
  chartControlsHost?: HTMLDivElement | null;
  metricsStripClassName?: string;
  /** Oculta el conmutador «Por estado / Ingresos en el tiempo», etc. */
  hideChartViewToggle?: boolean;
  /** Filtros del gráfico siempre visibles, sin botón colapsable. */
  inlineChartControls?: boolean;
};

export default function PeriodMetricsChartSection({
  metrics,
  secondaryMetrics,
  selectedMetricId,
  chartsExpanded,
  onMetricSelect,
  onChartsToggle,
  onChartDimensionChange,
  chartsPanelId,
  activities,
  events,
  activityTypes,
  clients,
  documents,
  from,
  to,
  invalidCustomRange = false,
  isDesktop = false,
  chartControlsHost = null,
  metricsStripClassName,
  hideChartViewToggle = false,
  inlineChartControls = false,
}: PeriodMetricsChartSectionProps) {
  const selectedConfig = metrics.find((metric) => metric.id === selectedMetricId);
  const [chartPresetIndex, setChartPresetIndex] = useState(0);

  useEffect(() => {
    setChartPresetIndex(0);
  }, [selectedMetricId]);

  const presetOptions =
    selectedConfig?.chartPresets && selectedConfig.chartPresets.length >= 2
      ? selectedConfig.chartPresets
      : null;
  const activeChartPreset =
    presetOptions?.[chartPresetIndex] ?? selectedConfig?.chartPreset;

  const handleChartDimensionChange = (dimension: MetricDimension) => {
    const alignedMetric = dashboardMetricForDimension(dimension);
    if (!alignedMetric || !selectedMetricId) {
      onChartDimensionChange?.(dimension);
      return;
    }
    const matching = metrics.find((metric) => metric.chartMetric === alignedMetric);
    if (matching && matching.id !== selectedMetricId) {
      onMetricSelect(matching.id, matching.chartMetric);
    }
    onChartDimensionChange?.(dimension);
  };

  return (
    <>
      <div
        className={cx(
          dashboardStyles.dashboardCardBody,
          metricsStripClassName && styles.periodDashboardCardBody,
        )}
      >
        <div
          className={cx(
            ui.metricsStrip,
            metricsStripClassName,
            !metricsStripClassName && dashboardStyles.metricsStrip,
          )}
          style={
            !metricsStripClassName
              ? ({ '--metric-cols': metrics.length } as React.CSSProperties)
              : undefined
          }
          data-period-metrics={metricsStripClassName ? true : undefined}
        >
          {metrics.map((metric) => {
            const interactive = metric.interactive !== false;
            const valueDeltas =
              metric.valueDeltas ?? (metric.sub ? [] : [metric.delta]);
            const metricBody = (
              <>
                <div className={dashboardStyles.statBoxTitle}>{metric.title}</div>
                <div className={dashboardStyles.statBoxValueRow}>
                  <div className={ui.statBoxValue}>{metric.value}</div>
                  {valueDeltas.length > 0 ? (
                    <div className={dashboardStyles.statBoxValueDeltas}>
                      {valueDeltas.map((delta, index) => (
                        <div
                          key={`${delta.text}-${index}`}
                          className={cx(
                            dashboardStyles.statBoxDelta,
                            dashboardStyles[`statBoxDelta_${delta.tone}`],
                          )}
                        >
                          {delta.text}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {metric.sub ? (
                  <div className={dashboardStyles.statBoxSub}>{metric.sub}</div>
                ) : null}
              </>
            );

            if (!interactive) {
              return (
                <div
                  key={metric.id}
                  className={cx(ui.statBox, styles.statBoxStatic)}
                  aria-label={`${metric.title}: ${metric.value}`}
                >
                  {metricBody}
                </div>
              );
            }

            return (
              <button
                key={metric.id}
                type="button"
                className={cx(ui.statBox, dashboardStyles.statBoxBtn)}
                onClick={() => onMetricSelect(metric.id, metric.chartMetric)}
                aria-pressed={chartsExpanded && selectedMetricId === metric.id}
              >
                {metricBody}
              </button>
            );
          })}
        </div>

        {chartsExpanded && selectedConfig && activeChartPreset && (
          <div
            id={chartsPanelId}
            className={cx(
              dashboardStyles.chartsPanel,
              metricsStripClassName && styles.periodChartsPanel,
            )}
          >
            {presetOptions && !hideChartViewToggle ? (
              <div
                className={styles.chartViewToggle}
                role="group"
                aria-label="Vista del gráfico"
              >
                {presetOptions.map((preset, index) => (
                  <button
                    key={`${preset.chartType}-${preset.dimension}-${preset.measure}`}
                    type="button"
                    className={cx(
                      styles.chartViewBtn,
                      chartPresetIndex === index && styles.chartViewBtnActive,
                    )}
                    aria-pressed={chartPresetIndex === index}
                    onClick={() => setChartPresetIndex(index)}
                  >
                    {describeChartPresetView(preset)}
                  </button>
                ))}
              </div>
            ) : null}
            {invalidCustomRange ? (
              <p className={ui.alertError}>
                La fecha de inicio debe ser anterior o igual a la de fin.
              </p>
            ) : (
              <MetricChartPanel
                key={`${selectedMetricId ?? selectedConfig.chartMetric}-${chartPresetIndex}`}
                metric={selectedConfig.chartMetric}
                chartPreset={activeChartPreset}
                activities={activities}
                events={events}
                activityTypes={activityTypes}
                clients={clients}
                documents={documents}
                from={from}
                to={to}
                controlsPortalTarget={isDesktop ? chartControlsHost : null}
                inlineControls={inlineChartControls}
                onDimensionChange={handleChartDimensionChange}
              />
            )}
          </div>
        )}
      </div>

      {onChartsToggle ? (
        <div className={dashboardStyles.chartsToggleRow}>
          <button
            type="button"
            className={dashboardStyles.chartsToggleBtn}
            onClick={onChartsToggle}
            aria-expanded={chartsExpanded}
            aria-controls={chartsPanelId}
            aria-label={chartsExpanded ? 'Ocultar gráficos' : 'Mostrar gráficos'}
            title={chartsExpanded ? 'Ocultar gráficos' : 'Mostrar gráficos'}
          >
            <ChevronDown
              size={18}
              strokeWidth={2.25}
              className={cx(
                dashboardStyles.chartsToggleChevron,
                chartsExpanded && dashboardStyles.chartsToggleChevronOpen,
              )}
              aria-hidden
            />
          </button>
        </div>
      ) : null}
    </>
  );
}
