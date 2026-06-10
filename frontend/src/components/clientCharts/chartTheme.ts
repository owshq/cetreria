export const CHART_FONT = "'Inter', sans-serif";

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function getAxisTick() {
  return {
    fill: readCssVar('--chart-tick', '#737373'),
    fontSize: 11,
    fontFamily: CHART_FONT,
  };
}

export function getAxisLine() {
  return {
    stroke: readCssVar('--chart-axis', '#d4d4d4'),
    strokeWidth: 1,
  };
}

export function getGridStroke(): string {
  return readCssVar('--chart-grid', '#f0f0f0');
}

export function getTooltipCursor() {
  return {
    fill: readCssVar('--chart-cursor-fill', 'rgba(23, 23, 23, 0.04)'),
    stroke: readCssVar('--chart-cursor-stroke', '#e5e5e5'),
    strokeWidth: 1,
  };
}

export function getChartTickFaint() {
  return readCssVar('--chart-tick-faint', '#a3a3a3');
}

export function getChartStrokeSurface() {
  return readCssVar('--chart-stroke-surface', '#ffffff');
}

export const AXIS_TICK = {
  fill: '#737373',
  fontSize: 11,
  fontFamily: CHART_FONT,
};

export const AXIS_LINE = {
  stroke: '#d4d4d4',
  strokeWidth: 1,
};

export const GRID_STROKE = '#f0f0f0';

export const ANIMATION = {
  animationDuration: 700,
  animationEasing: 'ease-out' as const,
};

export const TOOLTIP_CURSOR = {
  fill: 'rgba(23, 23, 23, 0.04)',
  stroke: '#e5e5e5',
  strokeWidth: 1,
};

export const CHART_MARGINS = {
  compact: { top: 8, right: 8, left: 0, bottom: 0 },
  vertical: { top: 12, right: 12, left: -18, bottom: 4 },
  horizontal: { top: 4, right: 16, left: 4, bottom: 4 },
  radar: { top: 16, right: 24, left: 24, bottom: 16 },
  donut: { top: 8, right: 8, left: 8, bottom: 0 },
};
