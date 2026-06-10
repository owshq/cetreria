export type ChartMode = 'bars' | 'rows' | 'radar' | 'donut';

export const CHART_MODE_LABELS: Record<ChartMode, string> = {
  bars: 'Gráfico de barras verticales',
  rows: 'Gráfico de barras horizontales',
  radar: 'Gráfico radar',
  donut: 'Gráfico de anillo',
};
