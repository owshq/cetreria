import type { Document } from '@shared/types';

export type DashboardMetricKey = 'clients' | 'activities' | 'hours' | 'documents';

export type MetricMeasure = 'hours' | 'count' | 'income';

export type MetricDimension =
  | 'time'
  | 'client'
  | 'activity'
  | 'team'
  | 'document'
  | 'clientStatus'
  | 'documentStatus';

export type MetricChartField = MetricMeasure | MetricDimension;

export type MetricChartOrientation = 'vertical' | 'horizontal';

export type MetricChartType = 'line' | 'bar' | 'radar' | 'donut';

export const CHART_TYPE_LABELS: Record<MetricChartType, string> = {
  line: 'Líneas',
  bar: 'Barras',
  radar: 'Radar',
  donut: 'Anillo',
};

export const CHART_TYPES: MetricChartType[] = ['line', 'bar', 'radar', 'donut'];

export const POLAR_CHART_TYPES: MetricChartType[] = ['radar', 'donut'];

export function isPolarChartType(type: MetricChartType): boolean {
  return type === 'radar' || type === 'donut';
}

export const CHART_CONTROL_LABELS = {
  dimension: 'Dimensión',
  measure: 'Medida',
} as const;

/** @deprecated Use CHART_CONTROL_LABELS */
export const POLAR_CONTROL_LABELS = CHART_CONTROL_LABELS;

export const MEASURE_LABELS: Record<MetricMeasure, string> = {
  hours: 'Horas',
  count: 'Cantidad',
  income: 'Ingresos',
};

export const DIMENSION_LABELS: Record<MetricDimension, string> = {
  time: 'Fecha',
  client: 'Contacto',
  activity: 'Actividad',
  team: 'Equipo',
  document: 'Documento',
  clientStatus: 'Estado contacto',
  documentStatus: 'Estado documento',
};

export const METRIC_CHART_TITLES: Record<DashboardMetricKey, string> = {
  clients: 'Contactos',
  activities: 'Actividades',
  hours: 'Horas trabajadas',
  documents: 'Documentos',
};

export const METRIC_DEFAULTS: Record<
  DashboardMetricKey,
  { xAxis: MetricChartField; yAxis: MetricChartField }
> = {
  clients: { xAxis: 'time', yAxis: 'count' },
  activities: { xAxis: 'activity', yAxis: 'income' },
  hours: { xAxis: 'time', yAxis: 'hours' },
  documents: { xAxis: 'documentStatus', yAxis: 'income' },
};

/** Vista recomendada al seleccionar cada métrica (tipo + dimensión + medida). */
export type MetricChartDocumentScope = 'periodDate' | 'activityLinked';

export type MetricChartPreset = {
  dimension: MetricDimension;
  measure: MetricMeasure;
  chartType: MetricChartType;
  /** Limita los documentos del periodo al agrupar por documento. */
  documentStatuses?: Document['status'][];
  /** Por fecha del documento o por actividades del periodo. */
  documentScope?: MetricChartDocumentScope;
};

export const DASHBOARD_METRIC_CHART_PRESETS: Record<DashboardMetricKey, MetricChartPreset> = {
  clients: { dimension: 'time', measure: 'count', chartType: 'line' },
  activities: { dimension: 'activity', measure: 'income', chartType: 'bar' },
  hours: { dimension: 'time', measure: 'hours', chartType: 'line' },
  documents: { dimension: 'documentStatus', measure: 'income', chartType: 'donut' },
};

/** Presets del detalle de contacto (ids distintos aunque compartan chartMetric). */
export const CLIENT_PERIOD_CHART_PRESETS: Record<string, MetricChartPreset> = {
  paid: { dimension: 'documentStatus', measure: 'income', chartType: 'donut' },
  activities: { dimension: 'activity', measure: 'income', chartType: 'bar' },
  hours: { dimension: 'time', measure: 'hours', chartType: 'line' },
  pending: {
    ...DASHBOARD_METRIC_CHART_PRESETS.documents,
    documentScope: 'activityLinked',
  },
};

/** Dos vistas recomendadas por métrica combinada (documentos / trabajo). */
export const COMBINED_PERIOD_CHART_PRESETS = {
  documents: [
    { dimension: 'documentStatus', measure: 'income', chartType: 'donut' },
    { dimension: 'time', measure: 'income', chartType: 'line' },
  ],
  work: [
    { dimension: 'time', measure: 'hours', chartType: 'line' },
    { dimension: 'activity', measure: 'hours', chartType: 'bar' },
  ],
} as const satisfies Record<string, readonly [MetricChartPreset, MetricChartPreset]>;

export function describeChartPresetView(preset: MetricChartPreset): string {
  if (preset.chartType === 'donut' && preset.dimension === 'documentStatus') {
    return 'Por estado';
  }
  if (preset.chartType === 'line' && preset.dimension === 'time' && preset.measure === 'income') {
    return 'Ingresos en el tiempo';
  }
  if (preset.chartType === 'line' && preset.dimension === 'time' && preset.measure === 'hours') {
    return 'Horas en el tiempo';
  }
  if (preset.chartType === 'bar' && preset.dimension === 'activity') {
    return 'Por actividad';
  }
  return `${DIMENSION_LABELS[preset.dimension]} · ${MEASURE_LABELS[preset.measure]}`;
}

export function getMetricChartPreset(metric: DashboardMetricKey): MetricChartPreset {
  return DASHBOARD_METRIC_CHART_PRESETS[metric];
}

export function metricChartPresetKey(preset: MetricChartPreset): string {
  return `${preset.chartType}:${preset.dimension}:${preset.measure}`;
}

const MEASURE_FIELDS = new Set<MetricMeasure>(['hours', 'count', 'income']);

export function isMeasureField(field: MetricChartField): field is MetricMeasure {
  return MEASURE_FIELDS.has(field as MetricMeasure);
}

export function isDimensionField(field: MetricChartField): field is MetricDimension {
  return !isMeasureField(field);
}

export function getChartFieldLabel(field: MetricChartField): string {
  return isMeasureField(field) ? MEASURE_LABELS[field] : DIMENSION_LABELS[field];
}

export function getAvailableMeasures(metric: DashboardMetricKey): MetricMeasure[] {
  switch (metric) {
    case 'clients':
      return ['count', 'hours', 'income'];
    case 'activities':
      return ['count', 'hours', 'income'];
    case 'hours':
      return ['hours', 'count', 'income'];
    case 'documents':
      return ['count', 'income', 'hours'];
  }
}

export function getAvailableDimensions(metric: DashboardMetricKey): MetricDimension[] {
  switch (metric) {
    case 'clients':
      return ['time', 'client', 'clientStatus', 'documentStatus', 'activity'];
    case 'activities':
      return ['time', 'client', 'activity', 'team', 'document', 'clientStatus', 'documentStatus'];
    case 'hours':
      return ['time', 'client', 'activity', 'team', 'clientStatus', 'documentStatus'];
    case 'documents':
      return ['time', 'client', 'clientStatus', 'documentStatus', 'activity', 'document'];
  }
}

export function getAvailableChartFields(metric: DashboardMetricKey): MetricChartField[] {
  return [...getAvailableMeasures(metric), ...getAvailableDimensions(metric)];
}

export function getAxisFieldOptions(
  metric: DashboardMetricKey,
  otherAxis: MetricChartField,
): MetricChartField[] {
  const options = isMeasureField(otherAxis)
    ? getAvailableDimensions(metric)
    : getAvailableMeasures(metric);
  return options;
}

export function fieldsFromDimensionMeasure(
  dimension: MetricDimension,
  measure: MetricMeasure,
): { xAxis: MetricChartField; yAxis: MetricChartField } {
  return { xAxis: dimension, yAxis: measure };
}

export function getChartDimension(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): MetricDimension {
  return resolveMetricChartAxes(xAxis, yAxis).dimension;
}

export function getChartMeasure(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): MetricMeasure {
  return resolveMetricChartAxes(xAxis, yAxis).measure;
}

export function getChartDimensionOptions(
  metric: DashboardMetricKey,
  chartType: MetricChartType,
): MetricDimension[] {
  const dimensions = getPolarDimensionOptions(metric, chartType);
  if (metric !== 'activities' && metric !== 'hours') return dimensions;

  const activityGrouping: MetricDimension[] = ['activity', 'team'];
  return [...new Set<MetricDimension>([...activityGrouping, ...dimensions])];
}

export function resolveMetricChartAxes(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): {
  dimension: MetricDimension;
  measure: MetricMeasure;
  orientation: MetricChartOrientation;
} {
  if (isMeasureField(xAxis) && isDimensionField(yAxis)) {
    return { dimension: yAxis, measure: xAxis, orientation: 'horizontal' };
  }
  if (isDimensionField(xAxis) && isMeasureField(yAxis)) {
    return { dimension: xAxis, measure: yAxis, orientation: 'vertical' };
  }
  throw new Error('Los ejes deben combinar una medida y una dimensión distintas.');
}

export function canUseLineChart(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): boolean {
  return xAxis === 'time' && isMeasureField(yAxis);
}

export function getDefaultChartType(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): MetricChartType {
  if (!canUseLineChart(xAxis, yAxis)) return 'bar';
  return 'line';
}

export function getChartTypeOptions(
  metric: DashboardMetricKey,
  lineChartAvailable: boolean,
): MetricChartType[] {
  if (lineChartAvailable) return CHART_TYPES;
  if (getAvailableDimensions(metric).includes('time')) return CHART_TYPES;
  return CHART_TYPES.filter((type) => type !== 'line');
}

export function getPolarDimension(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): MetricDimension {
  return getChartDimension(xAxis, yAxis);
}

export function getPolarMeasure(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): MetricMeasure {
  return getChartMeasure(xAxis, yAxis);
}

export function getPolarDimensionOptions(
  metric: DashboardMetricKey,
  chartType?: MetricChartType,
): MetricDimension[] {
  const dimensions = getAvailableDimensions(metric);
  if (chartType === 'donut' || chartType === 'radar') {
    return dimensions.filter((dimension) => dimension !== 'time');
  }
  return dimensions;
}

export function getPolarMeasureOptions(metric: DashboardMetricKey): MetricMeasure[] {
  return getAvailableMeasures(metric);
}

export function resolveChartDimension(
  current: MetricDimension,
  options: MetricDimension[],
): MetricDimension {
  return options.includes(current) ? current : (options[0] ?? current);
}

export function resolveChartMeasure(
  current: MetricMeasure,
  options: MetricMeasure[],
): MetricMeasure {
  return options.includes(current) ? current : (options[0] ?? current);
}

/** Medida por defecto al elegir una dimensión (evita combinar dimensión y medida incoherentes). */
export function getDefaultMeasureForDimension(
  metric: DashboardMetricKey,
  dimension: MetricDimension,
): MetricMeasure {
  const available = getAvailableMeasures(metric);
  const pick = (measure: MetricMeasure): MetricMeasure =>
    available.includes(measure) ? measure : available[0];

  switch (dimension) {
    case 'document':
    case 'documentStatus':
      return pick('income');
    case 'time':
      if (metric === 'hours') return pick('hours');
      if (metric === 'documents') return pick('income');
      return pick('count');
    case 'activity':
    case 'team':
      if (metric === 'hours') return pick('hours');
      if (metric === 'activities') return pick('income');
      return pick('count');
    case 'client':
    case 'clientStatus':
    default:
      if (metric === 'documents') return pick('income');
      if (metric === 'hours') return pick('hours');
      return pick('count');
  }
}

export function resolveDimensionMeasureSelection(
  metric: DashboardMetricKey,
  chartType: MetricChartType,
  dimension: MetricDimension,
  measure: MetricMeasure,
  options?: { preserveMeasure?: boolean },
): { dimension: MetricDimension; measure: MetricMeasure } {
  const dimensionOptions = getChartDimensionOptions(metric, chartType);
  const resolvedDimension = resolveChartDimension(dimension, dimensionOptions);
  const measureOptions = getPolarMeasureOptions(metric);
  const resolvedMeasure = options?.preserveMeasure
    ? resolveChartMeasure(measure, measureOptions)
    : getDefaultMeasureForDimension(metric, resolvedDimension);
  return { dimension: resolvedDimension, measure: resolvedMeasure };
}

/** Métrica del dashboard alineada con dimensiones de contacto o documento. */
export function dashboardMetricForDimension(
  dimension: MetricDimension,
): DashboardMetricKey | null {
  switch (dimension) {
    case 'document':
    case 'documentStatus':
      return 'documents';
    case 'client':
    case 'clientStatus':
      return 'clients';
    default:
      return null;
  }
}

export function describeMetricChartQuery(
  xAxis: MetricChartField,
  yAxis: MetricChartField,
): string {
  const { dimension, measure } = resolveMetricChartAxes(xAxis, yAxis);
  return `${DIMENSION_LABELS[dimension]} × ${MEASURE_LABELS[measure]}`;
}
