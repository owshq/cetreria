import { jsPDF } from 'jspdf';
import { addMonths, format } from 'date-fns';
import type {
  Client,
  Document,
  DocumentBillingAddress,
  DocumentPdfSigner,
  WorkspaceBillingSettings,
} from './types.js';
import {
  DOCUMENT_TYPE_LABELS,
  billingAddressFromClient,
  resolveClientTaxId,
  resolveDocumentTotals,
} from './documents.js';
import { formatDateSafe, parseDateSafe } from './dateUtils.js';
import { resolveDocumentFooterText } from './documentFooter.js';
import {
  DOCUMENT_LOGO_MAX_HEIGHT_MM,
  DOCUMENT_LOGO_MAX_WIDTH_MM,
  fitImageToBoxMm,
  resolveDocumentLogoDataUrl,
  resolveDocumentLogoImageFormat,
} from './documentLogo.js';
import {
  resolveDocumentTemplate,
} from './documentTemplates.js';
import { buildCustomHtmlPdf } from './documentCustomHtmlPdf.js';
import { DEFAULT_DOCUMENT_HTML_TEMPLATE } from './documentHtmlTemplate.js';
import { DOCUMENT_ISO_LOGO_DATA_URL } from './documentPdfBrandAssets.js';
import {
  drawVerifactuQrOnPdf,
  shouldRenderVerifactuQrOnPdf,
} from './documentVerifactuQr.js';

/** Incrementar cuando cambie el diseno del PDF para regenerar documentos cacheados. */
export const DOCUMENT_PDF_RENDER_VERSION = 15;

/** Marcador para documentos con archivo subido (no regenerar desde plantilla). */
export const UPLOADED_DOCUMENT_FILE_VERSION = 0;

const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const ALLOWED_DOCUMENT_SOURCE_MIME_TYPES = Object.keys(MIME_TO_EXTENSION);

export function normalizeDocumentMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function mimeTypeToExtension(mimeType?: string | null): string | null {
  if (!mimeType) return null;
  return MIME_TO_EXTENSION[normalizeDocumentMimeType(mimeType)] ?? null;
}

export function isAllowedDocumentSourceMimeType(mimeType: string): boolean {
  return normalizeDocumentMimeType(mimeType) in MIME_TO_EXTENSION;
}

export function isUploadedDocumentSource(
  document: Pick<Document, 'pdfSource'>,
): boolean {
  return document.pdfSource === 'uploaded';
}

export function needsDocumentPdfRegeneration(
  document: Pick<Document, 'pdfKey' | 'templateId' | 'pdfRenderVersion' | 'pdfSource'>,
): boolean {
  if (isUploadedDocumentSource(document)) return false;
  if (!document.pdfKey) return true;
  if (!document.templateId) return true;
  if (document.pdfRenderVersion !== DOCUMENT_PDF_RENDER_VERSION) return true;
  return false;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const PAGE_MARGIN = 15;
const CONTENT_RIGHT = PAGE_WIDTH - PAGE_MARGIN;
const CONTENT_WIDTH = CONTENT_RIGHT - PAGE_MARGIN;
const LINE_HEIGHT = 4.2;
const PAGE_BOTTOM = 228;
const FOOTER_TOP = 235;

type Rgb = { r: number; g: number; b: number };

type PdfContext = {
  pdf: jsPDF;
  y: number;
};

type TableColumns = {
  item: number;
  qty: number;
  price: number;
  tax: number;
  total: number;
};

const TABLE_COLS: TableColumns = {
  item: PAGE_MARGIN,
  qty: 106,
  price: 138,
  tax: 156,
  total: CONTENT_RIGHT,
};

const TABLE_CELL_PAD = 2;
const CONCEPT_MAX_WIDTH = TABLE_COLS.qty - TABLE_COLS.item - TABLE_CELL_PAD * 2 - 4;
const CONCEPT_FONT_SIZE = 8.5;
const DESC_FONT_SIZE = 7.5;
const CONCEPT_LINE_LEADING = 1.12;
const DESC_LINE_LEADING = 1.08;
const DESC_GAP = 0.8;
const ITEM_ROW_PAD_TOP = 1.5;
const ITEM_ROW_PAD_BOTTOM = 1.5;

const INK: Rgb = { r: 64, g: 64, b: 64 };
const MUTED: Rgb = { r: 115, g: 115, b: 115 };
const LIGHT_LINE: Rgb = { r: 210, g: 210, b: 210 };
const TABLE_HEADER_BG: Rgb = { r: 240, g: 240, b: 240 };
const BRAND_OLIVE: Rgb = { r: 94, g: 106, b: 55 };
const BRAND_GOLD: Rgb = { r: 196, g: 136, b: 48 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function setFill(pdf: jsPDF, color: Rgb) {
  pdf.setFillColor(color.r, color.g, color.b);
}

function setStroke(pdf: jsPDF, color: Rgb) {
  pdf.setDrawColor(color.r, color.g, color.b);
}

function setText(pdf: jsPDF, color: Rgb) {
  pdf.setTextColor(color.r, color.g, color.b);
}

function formatMoneyEs(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} \u20AC`;
}

function formatShortDate(value: string): string {
  return formatDateSafe(value, 'dd/MM/yyyy');
}

function resolveDueDate(doc: Document): string | null {
  if (doc.type !== 'invoice') return null;
  const parsed = parseDateSafe(doc.date);
  if (!parsed) return null;
  return format(addMonths(parsed, 1), 'dd/MM/yyyy');
}

function pdfLineHeight(pdf: jsPDF, fontSize: number, leading: number): number {
  pdf.setFontSize(fontSize);
  return pdf.getTextDimensions('Mg').h * leading;
}

function splitPdfLines(pdf: jsPDF, text: string, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return pdf
    .splitTextToSize(trimmed, maxWidth)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
}

function ensureSpace(ctx: PdfContext, needed: number) {
  if (ctx.y + needed <= PAGE_BOTTOM) return;
  ctx.pdf.addPage();
  ctx.y = PAGE_MARGIN + 4;
}

function buildCompanyLines(company?: WorkspaceBillingSettings | null): string[] {
  if (!company?.companyName?.trim()) return [];
  const cityLine = [company.postalCode, company.city, company.state]
    .filter(Boolean)
    .join(' ')
    .trim();
  const countryLine = company.country?.trim() ?? '';
  return [
    company.companyName.trim(),
    company.address?.trim() ?? '',
    [cityLine, countryLine].filter(Boolean).join(', '),
    company.email?.trim() ? `Email: ${company.email.trim()}` : '',
  ].filter(Boolean);
}

function resolveBillingAddress(doc: Document, client: Client): DocumentBillingAddress {
  if (doc.billingAddress) return doc.billingAddress;
  return billingAddressFromClient(client);
}

function buildClientLines(
  billing: DocumentBillingAddress,
  client: Client,
): string[] {
  const name = billing.name?.trim() || client.name?.trim() || '';
  const address = billing.address?.trim() || client.address?.trim() || '';
  const cityLine = [billing.postalCode || client.postalCode, billing.city || client.city]
    .filter(Boolean)
    .join(' ')
    .trim();
  const taxId = resolveClientTaxId(client);
  return [
    name,
    address,
    cityLine,
    taxId ? `NIF: ${taxId}` : '',
  ].filter(Boolean);
}

function drawBrandHeader(
  ctx: PdfContext,
  company?: WorkspaceBillingSettings | null,
  clientLines?: string[],
) {
  const { pdf } = ctx;
  ctx.y = PAGE_MARGIN;
  let logoHeightMm = 18;

  try {
    const logoDataUrl = resolveDocumentLogoDataUrl(company);
    const imageProps = pdf.getImageProperties(logoDataUrl);
    const fitted = fitImageToBoxMm(
      imageProps.width,
      imageProps.height,
      DOCUMENT_LOGO_MAX_WIDTH_MM,
      DOCUMENT_LOGO_MAX_HEIGHT_MM,
    );
    logoHeightMm = fitted.height;
    pdf.addImage(
      logoDataUrl,
      resolveDocumentLogoImageFormat(logoDataUrl),
      PAGE_MARGIN,
      ctx.y,
      fitted.width,
      fitted.height,
    );
  } catch {
    // Ignorar logo invalido.
  }

  const companyLines = buildCompanyLines(company);
  if (companyLines.length > 0) {
    let companyY = ctx.y + 2;
    setText(pdf, INK);
    pdf.setFont('helvetica', 'normal');
    for (let index = 0; index < companyLines.length; index += 1) {
      const line = companyLines[index]!;
      pdf.setFontSize(index === 0 ? 8.5 : 7.5);
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      const wrapped = pdf.splitTextToSize(line, 88);
      for (const segment of wrapped) {
        pdf.text(segment, CONTENT_RIGHT, companyY, { align: 'right' });
        companyY += 3.8;
      }
    }
  }

  const headerBlockHeight = Math.max(logoHeightMm, 22);
  if (clientLines && clientLines.length > 0) {
    let clientY = ctx.y + headerBlockHeight + 2;
    const clientX = 118;
    setText(pdf, INK);
    for (let index = 0; index < clientLines.length; index += 1) {
      const line = clientLines[index]!;
      pdf.setFontSize(index === 0 ? 9 : 8);
      pdf.setFont('helvetica', index === 0 ? 'bold' : 'normal');
      pdf.text(line, clientX, clientY);
      clientY += 4.2;
    }
  }

  ctx.y += headerBlockHeight + 12;
}

function drawDocumentTitleBlock(
  ctx: PdfContext,
  doc: Document,
  company?: WorkspaceBillingSettings | null,
) {
  const { pdf } = ctx;
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
  const title = `${typeLabel} ${doc.number}`;

  setText(pdf, INK);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text(title, PAGE_MARGIN, ctx.y);
  ctx.y += 10;

  const dateLabel =
    doc.type === 'invoice' ? 'Fecha de factura:' : 'Fecha de albaran:';
  const dueDate = resolveDueDate(doc);
  const datesBandTopY = ctx.y;

  setText(pdf, BRAND_GOLD);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.text(dateLabel, PAGE_MARGIN, ctx.y);

  if (dueDate) {
    pdf.text('Fecha de vencimiento', PAGE_MARGIN + 52, ctx.y);
  }

  ctx.y += 4.5;
  setText(pdf, INK);
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text(formatShortDate(doc.date), PAGE_MARGIN, ctx.y);
  if (dueDate) {
    pdf.text(dueDate, PAGE_MARGIN + 52, ctx.y);
  }

  const datesBandBottomY = ctx.y + 1;

  if (shouldRenderVerifactuQrOnPdf(doc, company)) {
    drawVerifactuQrOnPdf(pdf, doc, CONTENT_RIGHT, datesBandTopY, datesBandBottomY);
  }

  ctx.y += 10;
}

function drawTableHeader(ctx: PdfContext) {
  const { pdf } = ctx;
  const headerY = ctx.y;
  const headerH = 8;

  setFill(pdf, TABLE_HEADER_BG);
  pdf.rect(PAGE_MARGIN, headerY, CONTENT_WIDTH, headerH, 'F');
  setStroke(pdf, LIGHT_LINE);
  pdf.setLineWidth(0.2);
  pdf.rect(PAGE_MARGIN, headerY, CONTENT_WIDTH, headerH);

  setText(pdf, INK);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DESCRIPCION', TABLE_COLS.item + TABLE_CELL_PAD, headerY + 5.5);
  pdf.text('CANT.', TABLE_COLS.qty, headerY + 5.5, { align: 'center' });
  pdf.text('P. UNIT.', TABLE_COLS.price, headerY + 5.5, { align: 'right' });
  pdf.text('IVA', TABLE_COLS.tax, headerY + 5.5, { align: 'center' });
  pdf.text('IMPORTE', TABLE_COLS.total - TABLE_CELL_PAD, headerY + 5.5, { align: 'right' });
  ctx.y = headerY + headerH + 1;
}

type ConceptBlockMetrics = {
  conceptLines: string[];
  descriptionLines: string[];
  contentHeight: number;
  conceptLineHeight: number;
  descLineHeight: number;
};

function measureConceptBlock(
  ctx: PdfContext,
  name: string,
  description?: string,
): ConceptBlockMetrics {
  const { pdf } = ctx;
  pdf.setFont('helvetica', 'normal');
  const conceptLines = splitPdfLines(pdf, name, CONCEPT_MAX_WIDTH);
  const conceptLineHeight = pdfLineHeight(pdf, CONCEPT_FONT_SIZE, CONCEPT_LINE_LEADING);
  const conceptHeight =
    conceptLines.length > 0 ? conceptLines.length * conceptLineHeight : conceptLineHeight;

  const trimmedDescription = description?.trim();
  let descriptionLines: string[] = [];
  let descriptionHeight = 0;
  let descLineHeight = 0;
  if (trimmedDescription) {
    pdf.setFontSize(DESC_FONT_SIZE);
    descriptionLines = splitPdfLines(pdf, trimmedDescription, CONCEPT_MAX_WIDTH);
    descLineHeight = pdfLineHeight(pdf, DESC_FONT_SIZE, DESC_LINE_LEADING);
    if (descriptionLines.length > 0) {
      descriptionHeight = DESC_GAP + descriptionLines.length * descLineHeight;
    }
    pdf.setFontSize(CONCEPT_FONT_SIZE);
  }

  return {
    conceptLines,
    descriptionLines,
    contentHeight: conceptHeight + descriptionHeight,
    conceptLineHeight,
    descLineHeight,
  };
}

function drawConceptBlock(
  ctx: PdfContext,
  x: number,
  y: number,
  metrics: ConceptBlockMetrics,
) {
  const { pdf } = ctx;
  let lineY = y;
  setText(pdf, INK);
  pdf.setFontSize(CONCEPT_FONT_SIZE);
  pdf.setFont('helvetica', 'normal');
  for (const line of metrics.conceptLines) {
    pdf.text(line, x, lineY);
    lineY += metrics.conceptLineHeight;
  }
  if (metrics.descriptionLines.length === 0) return;

  lineY += DESC_GAP;
  setText(pdf, MUTED);
  pdf.setFontSize(DESC_FONT_SIZE);
  for (const line of metrics.descriptionLines) {
    pdf.text(line, x, lineY);
    lineY += metrics.descLineHeight;
  }
}

function drawItemsTable(ctx: PdfContext, doc: Document) {
  const totals = resolveDocumentTotals(doc);
  drawTableHeader(ctx);

  for (const item of doc.items) {
    const lineTotal = item.quantity * item.price;
    const itemName = item.name?.trim();
    const itemDescription = item.description?.trim();
    const itemLabel = itemName || itemDescription || '\u2014';
    const descriptionText =
      itemName && itemDescription ? itemDescription : undefined;
    const block = measureConceptBlock(ctx, itemLabel, descriptionText);

    ensureSpace(
      ctx,
      ITEM_ROW_PAD_TOP + block.contentHeight + ITEM_ROW_PAD_BOTTOM + 4,
    );

    const rowTop = ctx.y + ITEM_ROW_PAD_TOP;
    drawConceptBlock(ctx, TABLE_COLS.item + TABLE_CELL_PAD, rowTop, block);

    const metricsY = rowTop + block.contentHeight / 2;
    setText(ctx.pdf, INK);
    ctx.pdf.setFontSize(CONCEPT_FONT_SIZE);
    ctx.pdf.setFont('helvetica', 'normal');
    ctx.pdf.text(item.quantity.toFixed(2), TABLE_COLS.qty, metricsY, { align: 'center' });
    ctx.pdf.text(formatMoneyEs(item.price), TABLE_COLS.price, metricsY, { align: 'right' });
    ctx.pdf.text(`${totals.taxRate}%`, TABLE_COLS.tax, metricsY, { align: 'center' });
    ctx.pdf.setFont('helvetica', 'bold');
    ctx.pdf.text(formatMoneyEs(lineTotal), TABLE_COLS.total - TABLE_CELL_PAD, metricsY, {
      align: 'right',
    });
    ctx.pdf.setFont('helvetica', 'normal');

    ctx.y = rowTop + block.contentHeight + ITEM_ROW_PAD_BOTTOM;
    setStroke(ctx.pdf, LIGHT_LINE);
    ctx.pdf.setLineWidth(0.15);
    ctx.pdf.line(PAGE_MARGIN, ctx.y, CONTENT_RIGHT, ctx.y);
    ctx.y += 1.2;
  }

  ctx.y += 6;
  drawTotalsAndPayment(ctx, doc, totals);
}

function drawTotalsAndPayment(
  ctx: PdfContext,
  doc: Document,
  totals: ReturnType<typeof resolveDocumentTotals>,
) {
  const { pdf } = ctx;
  ensureSpace(ctx, 36);
  const blockTop = ctx.y;

  setText(pdf, INK);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  const paymentLine = `Comunicaciones de pago ${doc.number} en esta cuenta:`;
  const paymentWrapped = pdf.splitTextToSize(paymentLine, 92);
  let paymentY = blockTop + 2;
  for (const line of paymentWrapped) {
    pdf.text(line, PAGE_MARGIN, paymentY);
    paymentY += 4;
  }

  const boxWidth = 72;
  const boxX = CONTENT_RIGHT - boxWidth;
  let totalsY = blockTop;

  setText(pdf, INK);
  pdf.setFontSize(8.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Importe base', boxX, totalsY);
  pdf.text(formatMoneyEs(totals.subtotal), CONTENT_RIGHT, totalsY, { align: 'right' });
  totalsY += 5.5;
  pdf.text(`IVA ${totals.taxRate}%`, boxX, totalsY);
  pdf.text(formatMoneyEs(totals.taxAmount), CONTENT_RIGHT, totalsY, { align: 'right' });
  totalsY += 7;

  setFill(pdf, BRAND_OLIVE);
  pdf.rect(boxX - 2, totalsY - 4.5, boxWidth + 2, 8, 'F');
  setText(pdf, WHITE);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.text('Total', boxX, totalsY);
  pdf.text(formatMoneyEs(totals.total), CONTENT_RIGHT, totalsY, { align: 'right' });

  ctx.y = Math.max(paymentY, totalsY + 8) + 6;
}

function drawNotesBlock(ctx: PdfContext, notes?: string) {
  const trimmed = notes?.trim();
  if (!trimmed) return;

  ensureSpace(ctx, 18);
  setText(ctx.pdf, BRAND_GOLD);
  ctx.pdf.setFontSize(8);
  ctx.pdf.setFont('helvetica', 'bold');
  ctx.pdf.text('Notas', PAGE_MARGIN, ctx.y);
  ctx.y += 5;

  setText(ctx.pdf, MUTED);
  ctx.pdf.setFontSize(8);
  ctx.pdf.setFont('helvetica', 'normal');
  const lines = ctx.pdf.splitTextToSize(trimmed, CONTENT_WIDTH);
  for (const line of lines) {
    ensureSpace(ctx, LINE_HEIGHT + 1);
    ctx.pdf.text(line, PAGE_MARGIN, ctx.y);
    ctx.y += LINE_HEIGHT;
  }
  ctx.y += 3;
}

function drawWorkerSignature(ctx: PdfContext, signer?: DocumentPdfSigner | null) {
  const imageDataUrl = signer?.imageDataUrl?.trim();
  if (!imageDataUrl) return;

  ensureSpace(ctx, 28);
  ctx.y += 2;
  setText(ctx.pdf, MUTED);
  ctx.pdf.setFontSize(8);
  ctx.pdf.setFont('helvetica', 'normal');
  ctx.pdf.text('Firma', PAGE_MARGIN, ctx.y);
  ctx.y += 5;

  try {
    ctx.pdf.addImage(imageDataUrl, 'PNG', PAGE_MARGIN, ctx.y, 42, 16);
  } catch {
    return;
  }
  ctx.y += 18;
  ctx.pdf.text(signer?.userName?.trim() || 'Usuario', PAGE_MARGIN, ctx.y);
  ctx.y += 6;
}

function drawPageFooter(ctx: PdfContext, doc: Document, footerText: string) {
  const { pdf } = ctx;
  const pageNumber = pdf.getCurrentPageInfo().pageNumber;
  const pageCount = pdf.getNumberOfPages();

  setStroke(pdf, LIGHT_LINE);
  pdf.setLineWidth(0.2);
  pdf.line(PAGE_MARGIN, FOOTER_TOP - 3, CONTENT_RIGHT, FOOTER_TOP - 3);

  setText(pdf, MUTED);
  pdf.setFontSize(5);
  pdf.setFont('helvetica', 'normal');
  const legalLines = pdf.splitTextToSize(footerText, CONTENT_WIDTH - 34);
  let legalY = FOOTER_TOP;
  for (const line of legalLines) {
    pdf.text(line, PAGE_MARGIN, legalY);
    legalY += 2.4;
  }

  setText(pdf, INK);
  pdf.setFontSize(7);
  pdf.text('Sello de calidad:', PAGE_MARGIN, PAGE_HEIGHT - 11);
  try {
    pdf.addImage(DOCUMENT_ISO_LOGO_DATA_URL, 'PNG', PAGE_MARGIN + 24, PAGE_HEIGHT - 22, 9, 12);
  } catch {
    // Ignorar sello invalido.
  }

  setText(pdf, MUTED);
  pdf.setFontSize(7.5);
  pdf.text(`Pagina: ${pageNumber}/${pageCount}`, CONTENT_RIGHT, PAGE_HEIGHT - 10, {
    align: 'right',
  });
  pdf.text(doc.number, PAGE_MARGIN, PAGE_HEIGHT - 10);
}

function renderCorporateDocument(
  ctx: PdfContext,
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  signer?: DocumentPdfSigner | null,
) {
  const billing = resolveBillingAddress(doc, client);
  const clientLines = buildClientLines(billing, client);

  drawBrandHeader(ctx, company, clientLines);
  drawDocumentTitleBlock(ctx, doc, company);
  drawItemsTable(ctx, doc);
  drawNotesBlock(ctx, doc.notes);
  drawWorkerSignature(ctx, signer);

  const footerText = resolveDocumentFooterText(company);
  const pageCount = ctx.pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    ctx.pdf.setPage(page);
    drawPageFooter(ctx, doc, footerText);
  }
}

function resolveCustomHtmlTemplate(company?: WorkspaceBillingSettings | null): string {
  const html = company?.customDocumentHtml?.trim();
  return html || DEFAULT_DOCUMENT_HTML_TEMPLATE;
}

export function buildDocumentPdf(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  signer?: DocumentPdfSigner | null,
): jsPDF {
  const { templateId } = resolveDocumentTemplate(doc);

  if (templateId === 'custom') {
    return buildCustomHtmlPdf(resolveCustomHtmlTemplate(company), doc, client, company, signer);
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const ctx: PdfContext = {
    pdf,
    y: PAGE_MARGIN,
  };

  renderCorporateDocument(ctx, doc, client, company, signer);
  return pdf;
}

export function renderDocumentPdfBytes(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  signer?: DocumentPdfSigner | null,
): Uint8Array {
  const buffer = buildDocumentPdf(doc, client, company, signer).output('arraybuffer');
  return new Uint8Array(buffer);
}

export function documentFileKey(
  doc: Pick<Document, 'workspaceId' | 'clientId' | 'id'> & { pdfContentType?: string },
): string {
  const ext = mimeTypeToExtension(doc.pdfContentType) ?? 'pdf';
  return `workspaces/${doc.workspaceId}/documents/${doc.clientId}/${doc.id}.${ext}`;
}

export function documentPdfKey(doc: Document): string {
  return documentFileKey(doc);
}

/** Ruta anterior (pre-workspace). Solo para migracion/fallback de lectura. */
export function legacyDocumentPdfKey(doc: Pick<Document, 'clientId' | 'id'>): string {
  return `documents/${doc.clientId}/${doc.id}.pdf`;
}
