import type { jsPDF } from 'jspdf';
import type { ChartDatum } from '@/components/clientCharts/utils';
import { formatDocumentAmount } from '@shared/types';
import type { ReportBreakdownRow } from './reportInstitutionalText';

const CHART_LABEL_WIDTH = 52;
const CHART_BAR_MAX_WIDTH = 118;
const CHART_ROW_HEIGHT = 7;
const CHART_TITLE_GAP = 5;

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) return [100, 100, 100];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

export type ReportDocumentStatusSlice = {
  label: string;
  count: number;
  amount: number;
  color: string;
};

export function buildDocumentStatusSlices(input: {
  paidCount: number;
  paidAmount: number;
  sentCount: number;
  sentAmount: number;
  draftCount: number;
  draftAmount: number;
}): ReportDocumentStatusSlice[] {
  const slices: ReportDocumentStatusSlice[] = [];
  if (input.paidCount > 0) {
    slices.push({
      label: 'Pagados',
      count: input.paidCount,
      amount: input.paidAmount,
      color: '#16a34a',
    });
  }
  if (input.sentCount > 0) {
    slices.push({
      label: 'Enviados',
      count: input.sentCount,
      amount: input.sentAmount,
      color: '#2563eb',
    });
  }
  if (input.draftCount > 0) {
    slices.push({
      label: 'Borradores',
      count: input.draftCount,
      amount: input.draftAmount,
      color: '#a1a1aa',
    });
  }
  return slices;
}

function maxValue(items: Array<{ value: number }>): number {
  return items.reduce((max, item) => Math.max(max, item.value), 0);
}

export function drawHorizontalBarChart(
  pdf: jsPDF,
  items: Array<{ label: string; value: number; color: string; suffix?: string }>,
  x: number,
  y: number,
  contentWidth: number,
  options?: { emptyMessage?: string },
): number {
  if (items.length === 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'italic');
    pdf.text(options?.emptyMessage ?? 'Sin datos en el período.', x, y);
    return y + 8;
  }

  const peak = maxValue(items);
  const chartWidth = Math.min(CHART_BAR_MAX_WIDTH, contentWidth - CHART_LABEL_WIDTH - 36);

  for (const item of items) {
    const barWidth = peak > 0 ? (item.value / peak) * chartWidth : 0;
    const [r, g, b] = parseHexColor(item.color);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    const labelLines = pdf.splitTextToSize(item.label, CHART_LABEL_WIDTH);
    pdf.text(labelLines[0], x, y + 4);
    pdf.setDrawColor(230, 230, 230);
    pdf.setFillColor(245, 245, 245);
    pdf.roundedRect(x + CHART_LABEL_WIDTH, y, chartWidth, CHART_ROW_HEIGHT, 1, 1, 'F');
    if (barWidth > 0) {
      pdf.setFillColor(r, g, b);
      pdf.roundedRect(x + CHART_LABEL_WIDTH, y, barWidth, CHART_ROW_HEIGHT, 1, 1, 'F');
    }
    const valueLabel = item.suffix ?? String(item.value);
    pdf.setFontSize(7);
    pdf.text(valueLabel, x + CHART_LABEL_WIDTH + chartWidth + 3, y + 4);
    y += CHART_ROW_HEIGHT + 3;
  }

  return y + CHART_TITLE_GAP;
}

export function chartDataToBarItems(data: ChartDatum[]): Array<{
  label: string;
  value: number;
  color: string;
  suffix: string;
}> {
  return data.slice(0, 10).map((row) => ({
    label: row.label,
    value: row.hours,
    color: row.color,
    suffix: `${row.hours} h (${row.percent}%)`,
  }));
}

export function breakdownToBarItems(
  rows: ReportBreakdownRow[],
  limit = 8,
): Array<{ label: string; value: number; color: string; suffix: string }> {
  const palette = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#4f46e5', '#0d9488'];
  return rows.slice(0, limit).map((row, index) => ({
    label: row.name,
    value: row.hours,
    color: palette[index % palette.length],
    suffix: `${row.hours} h  ${row.activities} act.`,
  }));
}

export function drawDocumentStatusBars(
  pdf: jsPDF,
  slices: ReportDocumentStatusSlice[],
  x: number,
  y: number,
  contentWidth: number,
): number {
  const items = slices.map((slice) => ({
    label: slice.label,
    value: slice.amount > 0 ? slice.amount : slice.count,
    color: slice.color,
    suffix:
      slice.amount > 0
        ? `${slice.count}  ${formatDocumentAmount(slice.amount)}`
        : String(slice.count),
  }));

  return drawHorizontalBarChart(pdf, items, x, y, contentWidth, {
    emptyMessage: 'Sin documentación en el período.',
  });
}

export function estimateChartBlockHeight(itemCount: number, hasTitle = true): number {
  const rows = Math.max(itemCount, 1);
  return (hasTitle ? 10 : 0) + rows * (CHART_ROW_HEIGHT + 3) + CHART_TITLE_GAP + 8;
}
