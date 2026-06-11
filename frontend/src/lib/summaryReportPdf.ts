import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ChartDatum } from '@/components/clientCharts/utils';
import { CHART_MODE_LABELS, type ChartMode } from '@/components/clientCharts/chartTypes';
import {
  formatDocumentAmount,
  getWorkerHoursDisplayLabel,
  workerReportHoursColumnLabel,
  type DocumentConceptSummary,
} from '@shared/types';
import { REPORT_KIND_HEADING, type ReportKind } from '@shared/types';
import {
  buildChart1Conclusions,
  buildChart2Conclusions,
  buildReportAnalysis,
  buildReportConclusions,
  buildReportIntroduction,
  getReportPeriodScopeLabel,
  getReportSubtitle,
  type ReportBreakdownRow,
  type ReportFeatureFlags,
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
import {
  formatWorkerActivityDetailConcepts,
  formatWorkerActivityDetailHoursCell,
  formatWorkerActivityDetailText,
  workerDetailShowsReportedHoursColumn,
  type WorkerActivityDetailRow,
} from './workerActivityDetailReport';
import { createReportPdfLayout } from './reportPdfLayout';
import {
  breakdownRowsHaveTypedDocumentCounts,
  formatBreakdownDocumentCell,
  resolveReportBreakdownDocumentCounts,
} from './reportDocumentSummary';

const PAGE_MARGIN = 20;
const PAGE_WIDTH = 210;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LINE_HEIGHT = 5.5;
const HEADER_LOGO_SIZE = 14;
const HEADER_TITLE_GAP = 4;
const HEADER_TITLE_X = PAGE_MARGIN + HEADER_LOGO_SIZE + HEADER_TITLE_GAP;
const HEADER_TITLE_WIDTH = PAGE_WIDTH - PAGE_MARGIN - HEADER_TITLE_X;
const COVER_TITLE_BASELINE_Y = PAGE_MARGIN + 10;
const COVER_SUBTITLE_TOP = COVER_TITLE_BASELINE_Y + 6;
const COVER_LOGO_Y =
  (PAGE_MARGIN + (COVER_SUBTITLE_TOP + 3 - HEADER_LOGO_SIZE)) / 2;
const HEADER_HEIGHT = HEADER_LOGO_SIZE + 4;
const CONTENT_TOP = PAGE_MARGIN + HEADER_HEIGHT;
const FOOTER_RESERVE = 20;

function footerLimit(pdf: jsPDF): number {
  return pdf.internal.pageSize.getHeight() - FOOTER_RESERVE;
}

function usablePageContentHeight(pdf: jsPDF): number {
  return footerLimit(pdf) - CONTENT_TOP;
}

function estimateWrappedTextHeight(
  pdf: jsPDF,
  text: string,
  width: number,
  lineHeight: number,
  fontSize: number,
): number {
  pdf.setFontSize(fontSize);
  const lines = pdf.splitTextToSize(text, width);
  return Math.max(lineHeight, lines.length * lineHeight) + 2;
}

function estimateSectionTitleHeight(pdf: jsPDF, title: string): number {
  return (
    LINE_HEIGHT +
    4 +
    6 +
    estimateWrappedTextHeight(pdf, title, CONTENT_WIDTH, LINE_HEIGHT, 12)
  );
}

function estimateBulletListHeight(pdf: jsPDF, bullets: string[]): number {
  if (bullets.length === 0) return LINE_HEIGHT;
  return bullets.reduce(
    (sum, bullet) =>
      sum + estimateWrappedTextHeight(pdf, `• ${bullet}`, CONTENT_WIDTH, LINE_HEIGHT, 10),
    0,
  );
}

function estimateBreakdownTableHeight(pdf: jsPDF, rows: ReportBreakdownRow[]): number {
  if (rows.length === 0) {
    return estimateWrappedTextHeight(
      pdf,
      'Sin registros en el periodo seleccionado.',
      CONTENT_WIDTH,
      LINE_HEIGHT,
      9,
    );
  }

  const nameWidth = breakdownRowsHaveTypedDocumentCounts(rows) ? 56 : 68;
  pdf.setFontSize(8);
  let height = LINE_HEIGHT * 2 + 4;
  for (const row of rows) {
    height += pdf.splitTextToSize(row.name, nameWidth).length * LINE_HEIGHT;
  }
  return height + 4;
}

function estimateWorkerBreakdownTableHeight(pdf: jsPDF, rows: ReportBreakdownRow[]): number {
  if (rows.length === 0) {
    return estimateWrappedTextHeight(
      pdf,
      'Sin registros en el periodo seleccionado.',
      CONTENT_WIDTH,
      LINE_HEIGHT,
      9,
    );
  }

  pdf.setFontSize(7);
  let height = LINE_HEIGHT * 2 + 4;
  for (const row of rows) {
    height += pdf.splitTextToSize(row.name, 54).length * LINE_HEIGHT;
  }
  return height + 4;
}

function estimateConceptsTableHeight(pdf: jsPDF, concepts: DocumentConceptSummary[]): number {
  if (concepts.length === 0) {
    return estimateWrappedTextHeight(
      pdf,
      'No hay conceptos de factura consolidados en el periodo.',
      CONTENT_WIDTH,
      LINE_HEIGHT,
      10,
    );
  }

  pdf.setFontSize(9);
  let height = LINE_HEIGHT * 2 + 4;
  for (const concept of concepts) {
    height += pdf.splitTextToSize(concept.description, 88).length * LINE_HEIGHT;
  }
  return height + LINE_HEIGHT + 6;
}

function ensureSectionStart(pdf: jsPDF, y: number, blockHeight: number): number {
  const limit = footerLimit(pdf);
  const required = Math.min(blockHeight, usablePageContentHeight(pdf));

  if (y + required > limit) {
    pdf.addPage();
    return CONTENT_TOP;
  }
  return y;
}

function beginSection(pdf: jsPDF, y: number, title: string, bodyHeightEstimate: number): number {
  const titleHeight = estimateSectionTitleHeight(pdf, title);
  y = ensureSectionStart(pdf, y, titleHeight + bodyHeightEstimate);
  return writeSectionTitle(pdf, title, y, { leadingEnsure: false });
}

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
  deliveryNoteCount?: number;
  invoiceCount?: number;
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
  featureFlags?: ReportFeatureFlags;
  workerActivityDetail?: WorkerActivityDetailRow[];
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
  const footerY = pdf.internal.pageSize.getHeight() - 10;
  if (y + needed > footerY - 10) {
    pdf.addPage();
    return CONTENT_TOP;
  }
  return y;
}

function pageContentWidth(pdf: jsPDF): number {
  return pdf.internal.pageSize.getWidth() - PAGE_MARGIN * 2;
}

function writeParagraph(
  pdf: jsPDF,
  text: string,
  y: number,
  options?: { bold?: boolean; size?: number; indent?: number; x?: number; maxWidth?: number },
): number {
  const size = options?.size ?? 10;
  const indent = options?.indent ?? 0;
  const x = options?.x ?? PAGE_MARGIN + indent;
  const width = options?.maxWidth ?? PAGE_WIDTH - PAGE_MARGIN - x;
  pdf.setFontSize(size);
  pdf.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  const lines = pdf.splitTextToSize(text, width);
  for (const line of lines) {
    y = ensureSpace(pdf, y, LINE_HEIGHT);
    pdf.text(line, x, y);
    y += LINE_HEIGHT;
  }
  return y + 2;
}

function writeCoverDividerLine(pdf: jsPDF, y: number): number {
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  return y + 4;
}

function writeBulletList(pdf: jsPDF, bullets: string[], y: number): number {
  for (const bullet of bullets) {
    y = writeParagraph(pdf, `• ${bullet}`, y, { size: 10 });
  }
  return y;
}

function writeSectionTitle(
  pdf: jsPDF,
  title: string,
  y: number,
  options?: { leadingEnsure?: boolean },
): number {
  if (options?.leadingEnsure !== false) {
    y = ensureSpace(pdf, y, LINE_HEIGHT + 4);
  }
  pdf.setDrawColor(23, 23, 23);
  pdf.setLineWidth(0.4);
  pdf.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_WIDTH, y);
  y += 6;
  return writeParagraph(pdf, title, y, { bold: true, size: 12 });
}

function metricsHasTypedDocuments(metrics: SummaryReportMetrics): boolean {
  return metrics.deliveryNoteCount != null && metrics.invoiceCount != null;
}

function insertDocumentTypeMetricRows(
  rows: Array<[string, string]>,
  metrics: SummaryReportMetrics,
  insertAt: number,
): void {
  const deliveryNoteCount = metrics.deliveryNoteCount ?? 0;
  const invoiceCount = metrics.invoiceCount ?? 0;
  const typeRows: Array<[string, string]> = [];

  if (deliveryNoteCount > 0 || invoiceCount === 0) {
    typeRows.push(['Albaranes en periodo', String(deliveryNoteCount)]);
  }
  if (invoiceCount > 0 || deliveryNoteCount === 0) {
    typeRows.push(['Facturas en periodo', String(invoiceCount)]);
  }
  if (deliveryNoteCount > 0 && invoiceCount > 0) {
    typeRows.push(['Total documentos', String(deliveryNoteCount + invoiceCount)]);
  }

  rows.splice(insertAt, 0, ...typeRows);
}

function metricsRowsForKind(
  metrics: SummaryReportMetrics,
  kind: ReportKind,
  featureFlags?: ReportFeatureFlags,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    [metrics.clientsOrDocumentsLabel, String(metrics.clientsOrDocumentsValue)],
    ['Actividades registradas', String(metrics.totalActivities)],
    [
      workerPeriodHoursMetricLabel(featureFlags),
      `${metrics.totalHours} h`,
    ],
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
      if (featureFlags?.workerSignaturesEnabled) {
        teamRows.push(['Horas asignadas', `${metrics.teamAssignedHours} h`]);
        teamRows.push(['Horas firmadas', `${metrics.teamSignedHours ?? 0} h`]);
        teamRows.push(['Horas pendientes de firma', `${metrics.teamPendingHours ?? 0} h`]);
      } else {
        teamRows.push(['Horas registradas', `${metrics.teamAssignedHours} h`]);
      }
    }
    if (
      featureFlags?.workerSignaturesEnabled &&
      metrics.teamSignedActivities != null
    ) {
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
    if (metricsHasTypedDocuments(metrics)) {
      rows.splice(0, 1);
      insertDocumentTypeMetricRows(rows, metrics, 0);
    } else {
      rows[0] = ['Documentos en periodo', String(metrics.clientsOrDocumentsValue)];
    }
  } else if (metricsHasTypedDocuments(metrics)) {
    const paidAmountIndex = rows.findIndex(
      ([label]) => label === 'Importe cobrado (pagados)',
    );
    insertDocumentTypeMetricRows(rows, metrics, paidAmountIndex >= 0 ? paidAmountIndex : 3);
  }

  return rows;
}

function writeMetricsTable(
  pdf: jsPDF,
  metrics: SummaryReportMetrics,
  kind: ReportKind,
  y: number,
  featureFlags?: ReportFeatureFlags,
): number {
  const rows = metricsRowsForKind(metrics, kind, featureFlags);

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

function writeClientBreakdownTableHeader(
  pdf: jsPDF,
  y: number,
  splitDocumentColumns: boolean,
): number {
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Nombre', PAGE_MARGIN, y);
  pdf.text('Act.', PAGE_MARGIN + 58, y);
  pdf.text('Horas', PAGE_MARGIN + 70, y);
  if (splitDocumentColumns) {
    pdf.text('Alb.', PAGE_MARGIN + 84, y);
    pdf.text('Fact.', PAGE_MARGIN + 94, y);
    pdf.text('Cobrado', PAGE_MARGIN + 104, y);
  } else {
    pdf.text('Docs', PAGE_MARGIN + 84, y);
    pdf.text('Cobrado', PAGE_MARGIN + 98, y);
  }
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);
  pdf.setFont('helvetica', 'normal');
  return y;
}

function writeBreakdownTable(
  pdf: jsPDF,
  title: string,
  rows: ReportBreakdownRow[],
  y: number,
  sectionNum: number,
): number {
  const sectionTitle = `${sectionNum}. ${title}`;
  y = beginSection(pdf, y, sectionTitle, estimateBreakdownTableHeight(pdf, rows));

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin registros en el periodo seleccionado.', y, { size: 9 });
  }

  const splitDocumentColumns = breakdownRowsHaveTypedDocumentCounts(rows);
  const nameWidth = splitDocumentColumns ? 56 : 68;
  y = writeClientBreakdownTableHeader(pdf, y, splitDocumentColumns);
  const limit = footerLimit(pdf);

  for (const row of rows) {
    const nameLines = pdf.splitTextToSize(row.name, nameWidth);
    const rowHeight = nameLines.length * LINE_HEIGHT;
    const counts = resolveReportBreakdownDocumentCounts(row);

    if (y + rowHeight > limit) {
      pdf.addPage();
      y = CONTENT_TOP;
      y = writeClientBreakdownTableHeader(pdf, y, splitDocumentColumns);
    }

    pdf.text(nameLines[0], PAGE_MARGIN, y);
    pdf.text(String(row.activities), PAGE_MARGIN + 58, y);
    pdf.text(`${row.hours} h`, PAGE_MARGIN + 70, y);
    if (splitDocumentColumns) {
      pdf.text(String(counts.deliveryNoteCount), PAGE_MARGIN + 84, y);
      pdf.text(String(counts.invoiceCount), PAGE_MARGIN + 94, y);
      pdf.text(formatDocumentAmount(row.paidAmount), PAGE_MARGIN + 104, y);
    } else {
      pdf.text(String(counts.legacyTotal), PAGE_MARGIN + 84, y);
      pdf.text(formatDocumentAmount(row.paidAmount), PAGE_MARGIN + 98, y);
    }
    y += LINE_HEIGHT;

    for (let i = 1; i < nameLines.length; i += 1) {
      if (y + LINE_HEIGHT > limit) {
        pdf.addPage();
        y = CONTENT_TOP;
        y = writeClientBreakdownTableHeader(pdf, y, splitDocumentColumns);
      }
      pdf.text(nameLines[i], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  return y + 4;
}

function writeWorkerBreakdownTableHeader(pdf: jsPDF, y: number): number {
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Nombre', PAGE_MARGIN, y);
  pdf.text('Act.', PAGE_MARGIN + 58, y);
  pdf.text('Asig.', PAGE_MARGIN + 70, y);
  pdf.text('Firm.', PAGE_MARGIN + 86, y);
  pdf.text('Pend.', PAGE_MARGIN + 102, y);
  pdf.text('F/P', PAGE_MARGIN + 118, y);
  pdf.text('Documentos', PAGE_MARGIN + 128, y);
  pdf.text('Cobrado', PAGE_MARGIN + 152, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);
  pdf.setFont('helvetica', 'normal');
  return y;
}

function writeWorkerBreakdownTable(
  pdf: jsPDF,
  rows: ReportBreakdownRow[],
  y: number,
  sectionNum: number,
): number {
  const sectionTitle = `${sectionNum}. Desglose por operario`;
  y = beginSection(pdf, y, sectionTitle, estimateWorkerBreakdownTableHeight(pdf, rows));

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin registros en el periodo seleccionado.', y, { size: 9 });
  }

  y = writeWorkerBreakdownTableHeader(pdf, y);
  const limit = footerLimit(pdf);

  for (const row of rows) {
    const nameLines = pdf.splitTextToSize(row.name, 54);
    const signedActs = row.signedActivities ?? 0;
    const unsignedActs = row.unsignedActivities ?? 0;
    const documentSummary = formatBreakdownDocumentCell(row, 'compact');
    const documentLines = pdf.splitTextToSize(documentSummary, 22);
    const rowHeight = Math.max(nameLines.length, documentLines.length) * LINE_HEIGHT;

    if (y + rowHeight > limit) {
      pdf.addPage();
      y = CONTENT_TOP;
      y = writeWorkerBreakdownTableHeader(pdf, y);
    }

    pdf.text(nameLines[0], PAGE_MARGIN, y);
    pdf.text(String(row.activities), PAGE_MARGIN + 58, y);
    pdf.text(`${row.hours} h`, PAGE_MARGIN + 70, y);
    pdf.text(`${row.signedHours ?? 0} h`, PAGE_MARGIN + 86, y);
    pdf.text(`${row.pendingHours ?? 0} h`, PAGE_MARGIN + 102, y);
    pdf.text(`${signedActs}/${unsignedActs}`, PAGE_MARGIN + 118, y);
    pdf.text(documentLines[0], PAGE_MARGIN + 128, y);
    pdf.text(formatDocumentAmount(row.paidAmount), PAGE_MARGIN + 152, y);
    y += LINE_HEIGHT;

    for (let i = 1; i < nameLines.length; i += 1) {
      if (y + LINE_HEIGHT > limit) {
        pdf.addPage();
        y = CONTENT_TOP;
        y = writeWorkerBreakdownTableHeader(pdf, y);
      }
      pdf.text(nameLines[i], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }

    for (let i = 1; i < documentLines.length; i += 1) {
      if (y + LINE_HEIGHT > limit) {
        pdf.addPage();
        y = CONTENT_TOP;
        y = writeWorkerBreakdownTableHeader(pdf, y);
      }
      pdf.text(documentLines[i], PAGE_MARGIN + 128, y);
      y += LINE_HEIGHT;
    }
  }

  return y + 4;
}

function writeShiftBreakdownTableHeader(
  pdf: jsPDF,
  y: number,
  includeSignatures: boolean,
): number {
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Turno', PAGE_MARGIN, y);
  pdf.text(includeSignatures ? 'Horas asignadas' : 'Horas', PAGE_MARGIN + 55, y);
  if (includeSignatures) {
    pdf.text('Horas firmadas', PAGE_MARGIN + 115, y);
    pdf.text('Pendientes', PAGE_MARGIN + 155, y);
  }
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);
  pdf.setFont('helvetica', 'normal');
  return y;
}

function writeShiftBreakdownTable(
  pdf: jsPDF,
  rows: TeamShiftBreakdownRow[],
  y: number,
  sectionNum: number,
  includeSignatures: boolean,
): number {
  const sectionTitle = `${sectionNum}. Horas por turno`;
  const bodyHeight =
    rows.length === 0
      ? estimateWrappedTextHeight(
          pdf,
          'Sin horas asignadas por turno en el periodo.',
          CONTENT_WIDTH,
          LINE_HEIGHT,
          9,
        )
      : LINE_HEIGHT * (rows.length + 2) + 4;
  y = beginSection(pdf, y, sectionTitle, bodyHeight);

  if (rows.length === 0) {
    return writeParagraph(pdf, 'Sin horas asignadas por turno en el periodo.', y, { size: 9 });
  }

  y = writeShiftBreakdownTableHeader(pdf, y, includeSignatures);
  const limit = footerLimit(pdf);

  for (const row of rows) {
    if (y + LINE_HEIGHT > limit) {
      pdf.addPage();
      y = CONTENT_TOP;
      y = writeShiftBreakdownTableHeader(pdf, y, includeSignatures);
    }

    const pending = Math.max(0, row.assignedHours - row.signedHours);
    pdf.text(row.shiftLabel, PAGE_MARGIN, y);
    pdf.text(`${row.assignedHours} h`, PAGE_MARGIN + 55, y);
    if (includeSignatures) {
      pdf.text(`${row.signedHours} h`, PAGE_MARGIN + 115, y);
      pdf.text(`${pending} h`, PAGE_MARGIN + 155, y);
    }
    y += LINE_HEIGHT;
  }

  return y + 4;
}

function formatConceptQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2);
}

function writeConceptsTableHeader(pdf: jsPDF, y: number): number {
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Concepto', PAGE_MARGIN, y);
  pdf.text('Cant.', PAGE_MARGIN + 95, y);
  pdf.text('Importe', PAGE_MARGIN + 115, y);
  pdf.text('Fact.', PAGE_MARGIN + 150, y);
  y += LINE_HEIGHT;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 3, PAGE_MARGIN + CONTENT_WIDTH, y - 3);
  pdf.setFont('helvetica', 'normal');
  return y;
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

  y = writeConceptsTableHeader(pdf, y);
  const limit = footerLimit(pdf);

  for (const concept of concepts) {
    const descriptionLines = pdf.splitTextToSize(concept.description, 88);
    const rowHeight = descriptionLines.length * LINE_HEIGHT;

    if (y + rowHeight > limit) {
      pdf.addPage();
      y = CONTENT_TOP;
      y = writeConceptsTableHeader(pdf, y);
    }

    pdf.text(descriptionLines[0], PAGE_MARGIN, y);
    pdf.text(formatConceptQuantity(concept.totalQuantity), PAGE_MARGIN + 95, y);
    pdf.text(formatDocumentAmount(concept.totalAmount), PAGE_MARGIN + 115, y);
    pdf.text(String(concept.invoiceCount), PAGE_MARGIN + 150, y);
    y += LINE_HEIGHT;

    for (let lineIndex = 1; lineIndex < descriptionLines.length; lineIndex += 1) {
      if (y + LINE_HEIGHT > limit) {
        pdf.addPage();
        y = CONTENT_TOP;
        y = writeConceptsTableHeader(pdf, y);
      }
      pdf.text(descriptionLines[lineIndex], PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  const totalQuantity = concepts.reduce((sum, concept) => sum + concept.totalQuantity, 0);
  const totalAmount = concepts.reduce((sum, concept) => sum + concept.totalAmount, 0);
  if (y + LINE_HEIGHT + 2 > limit) {
    pdf.addPage();
    y = CONTENT_TOP;
  }
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
  const fullTitle = `${sectionNum}. ${sectionTitle}`;
  const chartHeight = estimateChartBlockHeight(chartDataForTable?.length ?? 4, false);
  const subtitleHeight = estimateWrappedTextHeight(pdf, subtitle, CONTENT_WIDTH, LINE_HEIGHT, 9) + 2;
  const tableHeight =
    chartDataForTable && chartDataForTable.length > 0
      ? chartDataForTable.length * LINE_HEIGHT + LINE_HEIGHT * 2 + 4
      : 0;
  const conclusionsHeight =
    estimateWrappedTextHeight(pdf, 'Conclusiones del gráfico', CONTENT_WIDTH, LINE_HEIGHT, 10) +
    estimateBulletListHeight(pdf, conclusions);
  y = beginSection(
    pdf,
    y,
    fullTitle,
    subtitleHeight + chartHeight + tableHeight + conclusionsHeight,
  );
  y = writeParagraph(pdf, subtitle, y, { size: 9 });
  y += 2;

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
    contacts_global: 'Ranking de clientes por horas',
    contact: 'Estado de la documentación',
    workers_global: 'Ranking de operarios por horas',
    worker: 'Contactos atendidos por el operario',
  };
  return titles[kind];
}

function chart2Subtitle(kind: ReportKind, featureFlags?: ReportFeatureFlags): string {
  const subtitles: Record<Exclude<ReportKind, 'workers_global'>, string> = {
    general: 'Comparativa de horas registradas por cliente (top del periodo).',
    contacts_global: 'Horas y actividades por cliente para priorizar seguimiento.',
    contact: 'Distribución de documentos por estado e importe en el periodo.',
    worker: 'Distribución del esfuerzo del operario entre clientes atendidos.',
  };
  if (kind === 'workers_global') {
    if (featureFlags?.workerSignaturesEnabled) {
      return 'Horas asignadas y firmadas por operario; columnas F/P = actividades firmadas / pendientes.';
    }
    return 'Horas registradas por operario en el periodo.';
  }
  return subtitles[kind];
}

type WorkerDetailColumn = {
  label: string;
  weight: number;
  value: (row: WorkerActivityDetailRow) => string;
};

const TAIL_WORKER_DETAIL_COLUMNS: WorkerDetailColumn[] = [
  {
    label: 'Estado parte',
    weight: 14,
    value: (row) => formatWorkerActivityDetailText(row.reportStatus),
  },
  {
    label: 'Zonas',
    weight: 20,
    value: (row) => formatWorkerActivityDetailText(row.zonesWorked || row.zones),
  },
  {
    label: 'Notas',
    weight: 20,
    value: (row) => formatWorkerActivityDetailText(row.workerNotes || row.notes),
  },
  {
    label: 'Albaran',
    weight: 14,
    value: (row) => formatWorkerActivityDetailText(row.deliveryNoteNumber),
  },
  {
    label: 'Documentos',
    weight: 22,
    value: (row) => formatWorkerActivityDetailText(row.linkedDocuments),
  },
  {
    label: 'Conceptos',
    weight: 24,
    value: (row) => formatWorkerActivityDetailConcepts(row),
  },
];

const SHIFT_DETAIL_COLUMN: WorkerDetailColumn = {
  label: 'Turno',
  weight: 14,
  value: (row) => formatWorkerActivityDetailText(row.shiftLabel),
};

function workerDetailMainHoursLabel(featureFlags?: ReportFeatureFlags): string {
  return getWorkerHoursDisplayLabel({
    workerSignaturesEnabled: featureFlags?.workerSignaturesEnabled,
    shiftSchedulingEnabled: featureFlags?.shiftSchedulingEnabled,
    short: true,
  });
}

function buildWorkerDetailColumns(featureFlags?: ReportFeatureFlags): WorkerDetailColumn[] {
  const columns: WorkerDetailColumn[] = [
    { label: 'Fecha', weight: 14, value: (row) => formatDetailDateIso(row.date) },
    { label: 'Cliente', weight: 22, value: (row) => formatWorkerActivityDetailText(row.clientName) },
    { label: 'Tipo', weight: 16, value: (row) => formatWorkerActivityDetailText(row.typeLabel) },
    {
      label: 'Descripcion',
      weight: 26,
      value: (row) => formatWorkerActivityDetailText(row.description),
    },
    {
      label: 'H. planificadas',
      weight: 12,
      value: (row) => formatWorkerActivityDetailHoursCell(row.plannedActivityHours),
    },
  ];

  if (featureFlags?.shiftSchedulingEnabled) {
    columns.push({
      label: workerReportHoursColumnLabel('shift'),
      weight: 12,
      value: (row) => formatWorkerActivityDetailHoursCell(row.assignedHours),
    });
  }

  if (workerDetailShowsReportedHoursColumn(featureFlags)) {
    columns.push({
      label: workerReportHoursColumnLabel('work-report'),
      weight: 12,
      value: (row) => formatWorkerActivityDetailHoursCell(row.reportedHours),
    });
  }

  if (featureFlags?.workerSignaturesEnabled) {
    columns.push({
      label: 'Firm.',
      weight: 10,
      value: (row) => formatWorkerActivityDetailHoursCell(row.signedHours),
    });
  }

  columns.push({
    label: workerDetailMainHoursLabel(featureFlags),
    weight: 12,
    value: (row) => formatWorkerActivityDetailHoursCell(row.reportHours),
  });

  columns.push(...TAIL_WORKER_DETAIL_COLUMNS);

  if (featureFlags?.shiftSchedulingEnabled) {
    columns.push(SHIFT_DETAIL_COLUMN);
  }

  return columns;
}

function formatDetailDateIso(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'd/M/yyyy', { locale: es });
  } catch {
    return isoDate;
  }
}

function writeWorkerDetailTableHeader(
  pdf: jsPDF,
  y: number,
  colWidths: number[],
  columns: WorkerDetailColumn[],
  lineHeight: number,
): number {
  pdf.setFontSize(WORKER_DETAIL_HEADER_FONT_SIZE);
  pdf.setFont('helvetica', 'bold');
  let x = PAGE_MARGIN;
  for (let index = 0; index < columns.length; index += 1) {
    const headerLines = pdf.splitTextToSize(columns[index].label, colWidths[index] - 1);
    pdf.text(headerLines[0], x, y);
    x += colWidths[index];
  }
  y += lineHeight;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(PAGE_MARGIN, y - 2, PAGE_MARGIN + pageContentWidth(pdf), y - 2);
  pdf.setFont('helvetica', 'normal');
  return y;
}

const WORKER_DETAIL_ANNEX_TITLE = 'Detalle de actividades';
const WORKER_DETAIL_ROW_FONT_SIZE = 5.5;
const WORKER_DETAIL_HEADER_FONT_SIZE = 6;
const WORKER_DETAIL_TITLE_FONT_SIZE = 12;
const WORKER_DETAIL_LINE_HEIGHT = 4.2;

function estimateWorkerDetailRowHeight(
  pdf: jsPDF,
  row: WorkerActivityDetailRow,
  columns: WorkerDetailColumn[],
  colWidths: number[],
  lineHeight: number,
): number {
  pdf.setFontSize(WORKER_DETAIL_ROW_FONT_SIZE);
  const cellLines = columns.map((column, index) =>
    pdf.splitTextToSize(column.value(row), colWidths[index] - 1),
  );
  const rowLineCount = Math.max(1, ...cellLines.map((lines) => lines.length));
  return rowLineCount * lineHeight + 1.5;
}

function writeWorkerActivityDetailAnnex(
  pdf: jsPDF,
  rows: WorkerActivityDetailRow[],
  featureFlags?: ReportFeatureFlags,
): void {
  const columns = buildWorkerDetailColumns(featureFlags);
  const layout = createReportPdfLayout({
    pageMargin: PAGE_MARGIN,
    lineHeight: WORKER_DETAIL_LINE_HEIGHT,
    contentTop: CONTENT_TOP,
    footerReserve: FOOTER_RESERVE,
  });

  pdf.addPage('a4', 'landscape');
  let y = CONTENT_TOP;
  const lineHeight = WORKER_DETAIL_LINE_HEIGHT;
  const contentWidth = pageContentWidth(pdf);
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  const colWidths = columns.map((column) => (column.weight / totalWeight) * contentWidth);
  const titleBlockHeight = 8 + lineHeight + 4;

  const writeAnnexTitle = () => {
    pdf.setFontSize(WORKER_DETAIL_TITLE_FONT_SIZE);
    pdf.setFont('helvetica', 'bold');
    pdf.text(WORKER_DETAIL_ANNEX_TITLE, PAGE_MARGIN, y);
    y += 8;
  };

  const startAnnexTablePage = (withTitle: boolean) => {
    if (withTitle) {
      y = layout.ensureSectionStart(pdf, y, titleBlockHeight + lineHeight * 2);
      writeAnnexTitle();
    } else {
      y = CONTENT_TOP;
      y = writeWorkerDetailTableHeader(pdf, y, colWidths, columns, lineHeight);
    }
  };

  startAnnexTablePage(true);

  if (rows.length === 0) {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Sin actividades en el periodo seleccionado.', PAGE_MARGIN, y);
    return;
  }

  y = writeWorkerDetailTableHeader(pdf, y, colWidths, columns, lineHeight);

  for (const row of rows) {
    const rowHeight = estimateWorkerDetailRowHeight(pdf, row, columns, colWidths, lineHeight);

    if (y + rowHeight > layout.footerLimit(pdf)) {
      pdf.addPage('a4', 'landscape');
      startAnnexTablePage(false);
    }

    pdf.setFontSize(WORKER_DETAIL_ROW_FONT_SIZE);
    pdf.setFont('helvetica', 'normal');
    const cellLines = columns.map((column, index) =>
      pdf.splitTextToSize(column.value(row), colWidths[index] - 1),
    );
    const rowLineCount = Math.max(1, ...cellLines.map((lines) => lines.length));

    for (let lineIndex = 0; lineIndex < rowLineCount; lineIndex += 1) {
      let x = PAGE_MARGIN;
      for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
        const text = cellLines[colIndex][lineIndex] ?? '';
        if (text) pdf.text(text, x, y + lineIndex * lineHeight);
        x += colWidths[colIndex];
      }
    }
    y += rowLineCount * lineHeight + 1.5;
  }
}

function writePageHeader(pdf: jsPDF, logo: string | null, pageNum: number, kind: ReportKind) {
  if (!logo) return;

  const logoY = pageNum === 1 ? COVER_LOGO_Y : PAGE_MARGIN;
  pdf.addImage(logo, 'PNG', PAGE_MARGIN, logoY, HEADER_LOGO_SIZE, HEADER_LOGO_SIZE);

  if (pageNum === 1) {
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(23, 23, 23);
    pdf.text(REPORT_KIND_HEADING[kind], HEADER_TITLE_X, COVER_TITLE_BASELINE_Y);
    return;
  }

  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.3);
  pdf.line(
    PAGE_MARGIN,
    logoY + HEADER_LOGO_SIZE + 2,
    PAGE_MARGIN + CONTENT_WIDTH,
    logoY + HEADER_LOGO_SIZE + 2,
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
  const pageWidth = pdf.internal.pageSize.getWidth();
  const footerY = pdf.internal.pageSize.getHeight() - 10;
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(115, 115, 115);
  pdf.text(`${companyName} — ${REPORT_KIND_HEADING[kind]}`, PAGE_MARGIN, footerY);
  pdf.text(generatedLabel, PAGE_MARGIN, footerY + 4);
  pdf.text(`Página ${pageNum} de ${totalPages}`, pageWidth - PAGE_MARGIN, footerY, { align: 'right' });
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
  const featureFlags = params.featureFlags;

  let y = COVER_SUBTITLE_TOP;
  let sectionNum = 1;

  const beginReportSection = (title: string, bodyHeightEstimate: number) => {
    const fullTitle = `${sectionNum}. ${title}`;
    y = beginSection(pdf, y, fullTitle, bodyHeightEstimate);
    sectionNum += 1;
    return y;
  };

  const logo = await loadImageDataUrl(DEFAULT_APP_LOGO_LIGHT);

  y = writeParagraph(pdf, getReportSubtitle(kind, featureFlags), y, {
    size: 9,
    x: HEADER_TITLE_X,
    maxWidth: HEADER_TITLE_WIDTH,
  });
  y = writeCoverDividerLine(pdf, y);
  y += 2;

  y = writeParagraph(pdf, getReportPeriodScopeLabel(params.dateFrom, params.dateTo), y, {
    bold: true,
    size: 11,
    x: PAGE_MARGIN,
    maxWidth: CONTENT_WIDTH,
  });
  y = writeParagraph(pdf, `Periodo: ${periodRangeLabel}`, y, {
    bold: true,
    size: 11,
    x: PAGE_MARGIN,
    maxWidth: CONTENT_WIDTH,
  });
  y = writeParagraph(pdf, `Ámbito: ${params.metrics.clientScope}`, y, { size: 10 });
  y = writeParagraph(pdf, `Organización: ${params.companyName}`, y, { size: 10 });
  y = writeParagraph(pdf, `Emisión: ${generatedLabel}`, y, { size: 9 });
  y += 4;

  const introBullets = buildReportIntroduction(params.narrative);
  beginReportSection('Resumen ejecutivo', estimateBulletListHeight(pdf, introBullets));
  y = writeBulletList(pdf, introBullets, y);

  const metricsRows = metricsRowsForKind(params.metrics, kind, featureFlags);
  beginReportSection('Indicadores clave', LINE_HEIGHT * (metricsRows.length + 2) + 4);
  y = writeMetricsTable(pdf, params.metrics, kind, y, featureFlags);

  const analysisBullets = buildReportAnalysis(params.narrative);
  beginReportSection('Análisis del periodo', estimateBulletListHeight(pdf, analysisBullets));
  y = writeBulletList(pdf, analysisBullets, y);

  if (includesClientBreakdown(kind) && params.clientBreakdown) {
    y = writeBreakdownTable(
      pdf,
      'Desglose por cliente',
      params.clientBreakdown,
      y,
      sectionNum,
    );
    sectionNum += 1;
  }

  if (kind === 'workers_global' && featureFlags?.shiftSchedulingEnabled && params.teamShiftBreakdown?.length) {
    y = writeShiftBreakdownTable(
      pdf,
      params.teamShiftBreakdown,
      y,
      sectionNum,
      featureFlags.workerSignaturesEnabled === true,
    );
    sectionNum += 1;
  }

  if (includesWorkerBreakdown(kind) && params.workerBreakdown) {
    if (kind === 'workers_global' && featureFlags?.workerSignaturesEnabled) {
      y = writeWorkerBreakdownTable(pdf, params.workerBreakdown, y, sectionNum);
    } else if (kind === 'workers_global') {
      y = writeBreakdownTable(
        pdf,
        'Desglose por operario',
        params.workerBreakdown,
        y,
        sectionNum,
      );
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

  beginReportSection(
    'Conceptos de factura',
    estimateConceptsTableHeight(pdf, params.invoiceConcepts),
  );
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
      chart2Subtitle(kind, featureFlags),
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
      chart2Subtitle(kind, featureFlags),
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
    const imgHeight = 72;
    y = beginSection(pdf, y, `${sectionNum}. Vista ampliada del gráfico`, imgHeight + 6);
    sectionNum += 1;
    pdf.addImage(chartImage, 'PNG', PAGE_MARGIN, y, CONTENT_WIDTH, imgHeight);
    y += imgHeight + 6;
  }

  const conclusionBullets = buildReportConclusions(params.narrative);
  beginReportSection(
    'Conclusiones y recomendaciones',
    estimateBulletListHeight(pdf, conclusionBullets),
  );
  y = writeBulletList(pdf, conclusionBullets, y);

  if (kind === 'worker' && params.workerActivityDetail) {
    writeWorkerActivityDetailAnnex(pdf, params.workerActivityDetail, params.featureFlags);
  }

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    writePageHeader(pdf, logo, page, kind);
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
