import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ChartDatum } from '@/components/clientCharts/utils';
import { CHART_MODE_LABELS, type ChartMode } from '@/components/clientCharts/chartTypes';
import { formatDocumentAmount, type DocumentConceptSummary } from '@shared/types';
import { REPORT_KIND_HEADING, type ReportKind } from '@shared/types';
import {
  buildChart1Conclusions,
  buildChart2Conclusions,
  buildReportAnalysis,
  buildReportConclusions,
  buildReportIntroduction,
  getReportSubtitle,
  type ReportBreakdownRow,
  type ReportNarrativeInput,
  type TeamShiftBreakdownRow,
} from './reportInstitutionalText';
import {
  breakdownToBarItems,
  buildDocumentStatusSlices,
  chartDataToBarItems,
  drawDocumentStatusBars,
  drawHorizontalBarChart,
  estimateChartBlockHeight,
} from './reportPdfCharts';
import { DEFAULT_APP_LOGO_LIGHT } from './appLogo';

const PAGE_MARGIN = 20;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LINE_HEIGHT = 5.5;
const HEADER_LOGO_SIZE = 14;
const HEADER_HEIGHT = HEADER_LOGO_SIZE + 4;
const CONTENT_TOP = PAGE_MARGIN + HEADER_HEIGHT;
const FOOTER_Y = 287;

export type SummaryReportMetrics = {
  clientScope: string;
  clientsOrDocumentsLabel: string;
  clientsOrDocumentsValue: number;
  totalActivities: number;
  totalHours: number;
  paidAmount: number;
  paidCount: number;
  sentCount: number;
  sentAmount: number;
  draftCount: number;
  draftAmount: number;
  totalWorkers?: number;
  contactsServed?: number;
  teamAssignedHours?: number;
  teamSignedHours?: number;
  teamPendingHours?: number;
  teamSignedActivities?: number;
  teamUnsignedActivities?: number;
};

export type BuildSummaryReportPdfParams = {
  reportKind: ReportKind;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  generatedAt?: Date;
  companyName: string;
  metrics: SummaryReportMetrics;
  invoiceConcepts: DocumentConceptSummary[];
  chartMode: ChartMode;
  chartData: ChartDatum[];
  chartElement: HTMLElement | null;
  narrative: ReportNarrativeInput;
  clientBreakdown?: ReportBreakdownRow[];
  workerBreakdown?: ReportBreakdownRow[];
  teamShiftBreakdown?: TeamShiftBreakdownRow[];
};

async function loadImageDataUrl(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function captureChartImage(element: HTMLElement): Promise<string | null> {
  try {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed > FOOTER_Y - 10) {
    pdf.addPage();
    return CONTENT_TOP;
  }
  return y;
}

function writeParagraph(
  pdf: jsPDF,
  text: string,
  y: number,
  options?: { bold?: boolean; size?: number; indent?: number },
): number {
  const size = options?.size ?? 10;
  const indent = options?.indent ?? 0;
  pdf.setFontSize(size);
  pdf.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  const lines = pdf.splitTextToSize(text, CONTENT_WIDTH - indent);
  for (const line of lines) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    pdf.text(line, PAGE_MARGIN + indent, y);
    y += LINE_HEIGHT;
  }
  return y + 2;
}

function writeBulletList(pdf: jsPDF, bullets: string[], y: number): number {
  for (const bullet of bullets) {
    y = writeParagraph(pdf, `• ${bullet}`, y, { size: 10 });
  }
  return y;
}

function writeSectionTitle(pdf: jsPDF, title: string, y: number): number {
  y = ensureSpace(pdf, y, LINE_HEIGHT + 4);
  pdf.setDrawColor(23, 23, 23);
  pdf.setLineWidth(0.4);
  pdf.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  y += 6;
  return writeParagraph(pdf, title, y, { bold: true, size: 12 });
}

function metricsRowsForKind(
  metrics: SummaryReportMetrics,
  kind: ReportKind,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    [metrics.clientsOrDocumentsLabel, String(metrics.clientsOrDocumentsValue)],
    ['Actividades registradas', String(metrics.totalActivities)],
    ['Horas documentadas', `${metrics.totalHours} h`],
    ['Importe cobrado (pagados)', formatDocumentAmount(metrics.paidAmount)],
    ['Documentos pagados', String(metrics.paidCount)],
    [
      'Documentos enviados',
      `${metrics.sentCount} (${formatDocumentAmount(metrics.sentAmount)})`,
    ],
    [
      'Borradores',
      `${metrics.draftCount} (${formatDocumentAmount(metrics.draftAmount)})`,
    ],
  ];

  if (kind === 'general' && metrics.totalWorkers != null) {
    rows.splice(1, 0, ['Operarios con actividad', String(metrics.totalWorkers)]);
  }

  if (kind === 'worker' && metrics.contactsServed != null) {
    rows.splice(1, 0, ['Contactos atendidos', String(metrics.contactsServed)]);
  }

  if (kind === 'workers_global') {
    const teamRows: Array<[string, string]> = [];
    if (metrics.teamAssignedHours != null) {
      teamRows.push(['Horas asignadas', `${metrics.teamAssignedHours} h`]);
      teamRows.push(['Horas firmadas', `${metrics.teamSignedHours ?? 0} h`]);
      teamRows.push(['Horas pendientes de firma', `${metrics.teamPendingHours ?? 0} h`]);
    }
    if (metrics.teamSignedActivities != null) {
      teamRows.push([
        'Actividades con firma completa',
        String(metrics.teamSignedActivities),
      ]);
      teamRows.push([
        'Actividades con firma pendiente',
        String(metrics.teamUnsignedActivities ?? 0),
      ]);
    }
    if (teamRows.length > 0) {
      rows.splice(3, 0, ...teamRows);
    }
  }

  if (kind === 'contact') {
    rows[0] = ['Documentos en periodo', String(metrics.clientsOrDocumentsValue)];
  }

  return rows;
}

function writeMetricsTable(pdf: jsPDF, metrics: SummaryReportMetrics, kind: ReportKind, y: number): number {
  const rows = metricsRowsForKind(metrics, kind);

  y = ensureSpace(pdf, y, LINE_HEIGHT * (rows.length + 2));
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Indicador', PAGE_MARGIN, y);
  pdf.text('Valor', PAGE_MARGIN + 95, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const [label, value] of rows) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    pdf.text(label, PAGE_MARGIN, y);
    pdf.text(value, PAGE_MARGIN + 95, y);
    y += LINE_HEIGHT;
  }

  return y + 4;
}

function writeBreakdownTable(
  pdf: jsPDF,
  title: string,
  rows: ReportBreakdownRow[],
  y: number,
  sectionNum: number,
): number {
  y = writeSectionTitle(pdf, `${sectionNum}. ${title}`, y);

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin registros en el periodo seleccionado.', y, { size: 9 });
  }

  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  y = ensureSpace(pdf, y, LINE_HEIGHT);
  pdf.text('Nombre', PAGE_MARGIN, y);
  pdf.text('Act.', PAGE_MARGIN + 72, y);
  pdf.text('Horas', PAGE_MARGIN + 88, y);
  pdf.text('Docs', PAGE_MARGIN + 108, y);
  pdf.text('Cobrado', PAGE_MARGIN + 125, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const row of rows) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    const nameLines = pdf.splitTextToSize(row.name, 68);
    pdf.text(nameLines[0], PAGE_MARGIN, y);
    pdf.text(String(row.activities), PAGE_MARGIN + 72, y);
    pdf.text(`${row.hours} h`, PAGE_MARGIN + 88, y);
    pdf.text(String(row.documents), PAGE_MARGIN + 108, y);
    pdf.text(formatDocumentAmount(row.paidAmount), PAGE_MARGIN + 125, y);
    y += LINE_HEIGHT;

    for (let i = 1; i < nameLines.length; i += 1) {
      y = ensureSpace(pdf, y, LINE_HEIGHT);
      pdf.text(nameLines[i], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  return y + 4;
}

function writeWorkerBreakdownTable(
  pdf: jsPDF,
  rows: ReportBreakdownRow[],
  y: number,
  sectionNum: number,
): number {
  y = writeSectionTitle(pdf, `${sectionNum}. Desglose por operario`, y);

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin registros en el periodo seleccionado.', y, { size: 9 });
  }

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  y = ensureSpace(pdf, y, LINE_HEIGHT);
  pdf.text('Nombre', PAGE_MARGIN, y);
  pdf.text('Act.', PAGE_MARGIN + 58, y);
  pdf.text('Asig.', PAGE_MARGIN + 70, y);
  pdf.text('Firm.', PAGE_MARGIN + 86, y);
  pdf.text('Pend.', PAGE_MARGIN + 102, y);
  pdf.text('F/P', PAGE_MARGIN + 118, y);
  pdf.text('Docs', PAGE_MARGIN + 132, y);
  pdf.text('Cobrado', PAGE_MARGIN + 148, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const row of rows) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    const nameLines = pdf.splitTextToSize(row.name, 54);
    const signedActs = row.signedActivities ?? 0;
    const unsignedActs = row.unsignedActivities ?? 0;
    pdf.text(nameLines[0], PAGE_MARGIN, y);
    pdf.text(String(row.activities), PAGE_MARGIN + 58, y);
    pdf.text(`${row.hours} h`, PAGE_MARGIN + 70, y);
    pdf.text(`${row.signedHours ?? 0} h`, PAGE_MARGIN + 86, y);
    pdf.text(`${row.pendingHours ?? 0} h`, PAGE_MARGIN + 102, y);
    pdf.text(`${signedActs}/${unsignedActs}`, PAGE_MARGIN + 118, y);
    pdf.text(String(row.documents), PAGE_MARGIN + 132, y);
    pdf.text(formatDocumentAmount(row.paidAmount), PAGE_MARGIN + 148, y);
    y += LINE_HEIGHT;

    for (let i = 1; i < nameLines.length; i += 1) {
      y = ensureSpace(pdf, y, LINE_HEIGHT);
      pdf.text(nameLines[i], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  return y + 4;
}

function writeShiftBreakdownTable(
  pdf: jsPDF,
  rows: TeamShiftBreakdownRow[],
  y: number,
  sectionNum: number,
): number {
  y = writeSectionTitle(pdf, `${sectionNum}. Horas por turno`, y);

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin horas asignadas por turno en el periodo.', y, { size: 9 });
  }

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  y = ensureSpace(pdf, y, LINE_HEIGHT);
  pdf.text('Turno', PAGE_MARGIN, y);
  pdf.text('Horas asignadas', PAGE_MARGIN + 55, y);
  pdf.text('Horas firmadas', PAGE_MARGIN + 115, y);
  pdf.text('Pendientes', PAGE_MARGIN + 155, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const row of rows) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    const pending = Math.max(0, row.assignedHours - row.signedHours);
    pdf.text(row.shiftLabel, PAGE_MARGIN, y);
    pdf.text(`${row.assignedHours} h`, PAGE_MARGIN + 55, y);
    pdf.text(`${row.signedHours} h`, PAGE_MARGIN + 115, y);
    pdf.text(`${pending} h`, PAGE_MARGIN + 155, y);
    y += LINE_HEIGHT;
  }

  return y + 4;
}

function formatConceptQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
}

function writeConceptsTable(
  pdf: jsPDF,
  concepts: DocumentConceptSummary[],
  y: number,
): number {
  if (concepts.length === 0) {
    return writeParagraph(
      pdf,
      'No hay conceptos de factura consolidados en el periodo.',
      y,
    );
  }

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  y = ensureSpace(pdf, y, LINE_HEIGHT);
  pdf.text('Concepto', PAGE_MARGIN, y);
  pdf.text('Cant.', PAGE_MARGIN + 95, y);
  pdf.text('Importe', PAGE_MARGIN + 115, y);
  pdf.text('Docs', PAGE_MARGIN + 150, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const concept of concepts) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    const descriptionLines = pdf.splitTextToSize(concept.description, 88);
    pdf.text(descriptionLines[0], PAGE_MARGIN, y);
    pdf.text(formatConceptQuantity(concept.totalQuantity), PAGE_MARGIN + 95, y);
    pdf.text(formatDocumentAmount(concept.totalAmount), PAGE_MARGIN + 115, y);
    pdf.text(String(concept.invoiceCount), PAGE_MARGIN + 150, y);
    y += LINE_HEIGHT;

    for (let lineIndex = 1; lineIndex < descriptionLines.length; lineIndex += 1) {
      y = ensureSpace(pdf, y, LINE_HEIGHT);
      pdf.text(descriptionLines[lineIndex], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  const totalQuantity = concepts.reduce((sum, concept) => sum + concept.totalQuantity, 0);
  const totalAmount = concepts.reduce((sum, concept) => sum + concept.totalAmount, 0);
  y = ensureSpace(pdf, y, LINE_HEIGHT + 2);
  pdf.setFont('helvetica', 'bold');
  pdf.line(PAGE_MARGIN, y - 2, PAGE_MARGIN + CONTENT_WIDTH, y - 2);
  pdf.text('Total', PAGE_MARGIN, y);
  pdf.text(formatConceptQuantity(totalQuantity), PAGE_MARGIN + 95, y);
  pdf.text(formatDocumentAmount(totalAmount), PAGE_MARGIN + 115, y);
  y += LINE_HEIGHT;

  return y + 4;
}

function writeChartDataTable(pdf: jsPDF, chartData: ChartDatum[], y: number): number {
  if (chartData.length === 0) return y;

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  y = ensureSpace(pdf, y, LINE_HEIGHT);
  pdf.text('Tipo de actividad', PAGE_MARGIN, y);
  pdf.text('Horas', PAGE_MARGIN + 100, y);
  pdf.text('% del total', PAGE_MARGIN + 130, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);

  pdf.setFont('helvetica', 'normal');
  for (const row of chartData) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    pdf.text(row.label, PAGE_MARGIN, y);
    pdf.text(`${row.hours} h`, PAGE_MARGIN + 100, y);
    pdf.text(`${row.percent}%`, PAGE_MARGIN + 130, y);
    y += LINE_HEIGHT;
  }

  return y + 4;
}

function writeChartSection(
  pdf: jsPDF,
  sectionTitle: string,
  subtitle: string,
  drawChart: (pdf: jsPDF, x: number, y: number) => number,
  conclusions: string[],
  chartDataForTable: ChartDatum[] | null,
  y: number,
  sectionNum: number,
): number {
  y = writeSectionTitle(pdf, `${sectionNum}. ${sectionTitle}`, y);
  y = writeParagraph(pdf, subtitle, y, { size: 9 });
  y += 2;

  const chartHeight = estimateChartBlockHeight(
    chartDataForTable?.length ?? 4,
    false,
  );
  y = ensureSpace(pdf, y, chartHeight);
  y = drawChart(pdf, PAGE_MARGIN, y);
  y += 2;

  if (chartDataForTable && chartDataForTable.length > 0) {
    y = writeChartDataTable(pdf, chartDataForTable, y);
  }

  y = writeParagraph(pdf, 'Conclusiones del gráfico', y, { bold: true, size: 10 });
  y = writeBulletList(pdf, conclusions, y);

  return y;
}

function chart2Title(kind: ReportKind): string {
  const titles: Record<ReportKind, string> = {
    general: 'Contactos con mayor dedicación',
    contacts_global: 'Ranking de contactos por horas',
    contact: 'Estado de la documentación',
    workers_global: 'Ranking de operarios por horas',
    worker: 'Contactos atendidos por el operario',
  };
  return titles[kind];
}

function chart2Subtitle(kind: ReportKind): string {
  const subtitles: Record<ReportKind, string> = {
    general: 'Comparativa de horas registradas por contacto (top del periodo).',
    contacts_global: 'Horas y actividades por contacto para priorizar seguimiento.',
    contact: 'Distribución de documentos por estado e importe en el periodo.',
    workers_global: 'Horas asignadas y firmadas por operario; columnas F/P = actividades firmadas / pendientes.',
    worker: 'Distribución del esfuerzo del operario entre contactos atendidos.',
  };
  return subtitles[kind];
}

function writePageHeader(pdf: jsPDF, logo: string | null) {
  if (!logo) return;

  pdf.addImage(logo, 'PNG', PAGE_MARGIN, PAGE_MARGIN, HEADER_LOGO_SIZE, HEADER_LOGO_SIZE);
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.3);
  pdf.line(
    PAGE_MARGIN,
    PAGE_MARGIN + HEADER_LOGO_SIZE + 2,
    PAGE_MARGIN + CONTENT_WIDTH,
    PAGE_MARGIN + HEADER_LOGO_SIZE + 2,
  );
}

function writeFooter(
  pdf: jsPDF,
  pageNum: number,
  totalPages: number,
  generatedLabel: string,
  companyName: string,
  kind: ReportKind,
) {
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(115, 115, 115);
  pdf.text(`${companyName} — ${REPORT_KIND_HEADING[kind]}`, PAGE_MARGIN, FOOTER_Y);
  pdf.text(generatedLabel, PAGE_MARGIN, FOOTER_Y + 4);
  pdf.text(`Página ${pageNum} de ${totalPages}`, PAGE_WIDTH - PAGE_MARGIN, FOOTER_Y, { align: 'right' });
  pdf.setTextColor(23, 23, 23);
}

function includesClientBreakdown(kind: ReportKind): boolean {
  return kind === 'general' || kind === 'contacts_global';
}

function includesWorkerBreakdown(kind: ReportKind): boolean {
  return kind === 'general' || kind === 'workers_global';
}

export function buildSummaryReportFileName(
  dateFrom: string,
  dateTo: string,
  kind: ReportKind,
  entityName?: string,
): string {
  const suffix = dateFrom === dateTo ? dateFrom : `${dateFrom}_${dateTo}`;
  const safeName = entityName?.replace(/\s+/g, '_');

  const base = {
    general: 'informe_general',
    contacts_global: 'informe_contactos_global',
    contact: safeName ? `informe_${safeName}` : 'informe_contacto',
    workers_global: 'informe_equipo',
    worker: safeName ? `informe_operario_${safeName}` : 'informe_operario',
  }[kind];

  return `${base}_${suffix}.pdf`;
}

export async function buildSummaryReportPdf(
  params: BuildSummaryReportPdfParams,
): Promise<jsPDF> {
  const pdf = new jsPDF();
  const generatedAt = params.generatedAt ?? new Date();
  const fromLabel = format(parseISO(params.dateFrom), "d 'de' MMMM yyyy", { locale: es });
  const toLabel = format(parseISO(params.dateTo), "d 'de' MMMM yyyy", { locale: es });
  const generatedLabel = format(generatedAt, "d 'de' MMMM yyyy, HH:mm", { locale: es });
  const periodRangeLabel =
    params.dateFrom === params.dateTo ? fromLabel : `${fromLabel} — ${toLabel}`;
  const kind = params.reportKind;

  let y = CONTENT_TOP;
  let sectionNum = 1;

  const nextSection = (title: string) => {
    y = writeSectionTitle(pdf, `${sectionNum}. ${title}`, y);
    sectionNum += 1;
    return y;
  };

  const logo = await loadImageDataUrl(DEFAULT_APP_LOGO_LIGHT);

  y = writeParagraph(pdf, REPORT_KIND_HEADING[kind], y, { bold: true, size: 16 });
  y = writeParagraph(pdf, getReportSubtitle(kind), y, { size: 9 });
  y += 2;

  y = writeParagraph(pdf, `Periodo: ${periodRangeLabel}`, y, { bold: true, size: 11 });
  y = writeParagraph(pdf, `Ámbito: ${params.metrics.clientScope}`, y, { size: 10 });
  y = writeParagraph(pdf, `Organización: ${params.companyName}`, y, { size: 10 });
  y = writeParagraph(pdf, `Emisión: ${generatedLabel}`, y, { size: 9 });
  y += 4;

  nextSection('Resumen ejecutivo');
  y = writeBulletList(pdf, buildReportIntroduction(params.narrative), y);

  nextSection('Indicadores clave');
  y = writeMetricsTable(pdf, params.metrics, kind, y);

  nextSection('Análisis del periodo');
  y = writeBulletList(pdf, buildReportAnalysis(params.narrative), y);

  if (includesClientBreakdown(kind) && params.clientBreakdown) {
    y = writeBreakdownTable(
      pdf,
      'Desglose por contacto',
      params.clientBreakdown,
      y,
      sectionNum,
    );
    sectionNum += 1;
  }

  if (kind === 'workers_global' && params.teamShiftBreakdown?.length) {
    y = writeShiftBreakdownTable(pdf, params.teamShiftBreakdown, y, sectionNum);
    sectionNum += 1;
  }

  if (includesWorkerBreakdown(kind) && params.workerBreakdown) {
    if (kind === 'workers_global') {
      y = writeWorkerBreakdownTable(pdf, params.workerBreakdown, y, sectionNum);
    } else {
      y = writeBreakdownTable(
        pdf,
        'Desglose por operario',
        params.workerBreakdown,
        y,
        sectionNum,
      );
    }
    sectionNum += 1;
  }

  nextSection('Conceptos de factura');
  y = writeConceptsTable(pdf, params.invoiceConcepts, y);

  const chart1Items = chartDataToBarItems(params.chartData);
  const chart1Conclusions = buildChart1Conclusions(params.narrative).slice(1);

  y = writeChartSection(
    pdf,
    'Gráfico 1 — Distribución por tipo de actividad',
    `Horas por tipo de actividad (${CHART_MODE_LABELS[params.chartMode]}).`,
    (doc, x, startY) =>
      drawHorizontalBarChart(doc, chart1Items, x, startY, CONTENT_WIDTH, {
        emptyMessage: 'Sin actividades registradas en el periodo.',
      }),
    chart1Conclusions,
    params.chartData,
    y,
    sectionNum,
  );
  sectionNum += 1;

  const documentSlices = buildDocumentStatusSlices({
    paidCount: params.metrics.paidCount,
    paidAmount: params.metrics.paidAmount,
    sentCount: params.metrics.sentCount,
    sentAmount: params.metrics.sentAmount,
    draftCount: params.metrics.draftCount,
    draftAmount: params.metrics.draftAmount,
  });

  const chart2Breakdown =
    kind === 'workers_global'
      ? params.workerBreakdown
      : kind === 'worker' || kind === 'contacts_global' || kind === 'general'
        ? params.clientBreakdown
        : undefined;

  const chart2Conclusions = buildChart2Conclusions(params.narrative).slice(1);

  if (kind === 'contact') {
    y = writeChartSection(
      pdf,
      `Gráfico 2 — ${chart2Title(kind)}`,
      chart2Subtitle(kind),
      (doc, x, startY) => drawDocumentStatusBars(doc, documentSlices, x, startY, CONTENT_WIDTH),
      chart2Conclusions,
      null,
      y,
      sectionNum,
    );
  } else {
    const chart2Items = breakdownToBarItems(chart2Breakdown ?? []);
    y = writeChartSection(
      pdf,
      `Gráfico 2 — ${chart2Title(kind)}`,
      chart2Subtitle(kind),
      (doc, x, startY) =>
        drawHorizontalBarChart(doc, chart2Items, x, startY, CONTENT_WIDTH, {
          emptyMessage: 'Sin datos comparativos en el periodo.',
        }),
      chart2Conclusions,
      null,
      y,
      sectionNum,
    );
  }
  sectionNum += 1;

  const chartImage = params.chartElement
    ? await captureChartImage(params.chartElement)
    : null;

  if (chartImage) {
    y = writeSectionTitle(pdf, `${sectionNum}. Vista ampliada del gráfico`, y);
    sectionNum += 1;
    y = ensureSpace(pdf, y, 90);
    const imgHeight = 72;
    if (y + imgHeight > FOOTER_Y - 10) {
      pdf.addPage();
      y = CONTENT_TOP;
    }
    pdf.addImage(chartImage, 'PNG', PAGE_MARGIN, y, CONTENT_WIDTH, imgHeight);
    y += imgHeight + 6;
  }

  nextSection('Conclusiones y recomendaciones');
  y = writeBulletList(pdf, buildReportConclusions(params.narrative), y);

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    writePageHeader(pdf, logo);
    writeFooter(pdf, page, totalPages, `Generado el ${generatedLabel}`, params.companyName, kind);
  }

  return pdf;
}

function triggerPdfDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre el PDF en una pestaña nueva. `previewTab` debe abrirse en el mismo clic del usuario
 * (window.open sincrónico) para no ser bloqueado por el navegador.
 */
export async function openSummaryReportPdf(
  params: BuildSummaryReportPdfParams,
  fileName: string,
  previewTab: Window | null,
): Promise<void> {
  const pdf = await buildSummaryReportPdf(params);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);

  if (previewTab && !previewTab.closed) {
    previewTab.location.href = url;
    previewTab.document.title = fileName;
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  triggerPdfDownload(blob, fileName);
}

/** Abre una pestaña en el mismo clic del usuario (evita bloqueo de popups). */
export function openReportPreviewTab(): Window | null {
  const tab = window.open('about:blank', '_blank');
  if (!tab) return null;
  tab.document.title = 'Generando informe…';
  tab.document.body.innerHTML =
    '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#404040">Generando informe…</p>';
  return tab;
}

export async function buildSummaryReportPdfBlob(
  params: BuildSummaryReportPdfParams,
): Promise<Blob> {
  const pdf = await buildSummaryReportPdf(params);
  return pdf.output('blob');
}

export async function downloadSummaryReportPdf(
  params: BuildSummaryReportPdfParams,
  fileName: string,
): Promise<void> {
  const blob = await buildSummaryReportPdfBlob(params);
  triggerPdfDownload(blob, fileName);
}
