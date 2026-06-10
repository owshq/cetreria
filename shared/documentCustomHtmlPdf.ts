import { jsPDF } from 'jspdf';
import type { Client, Document, DocumentPdfSigner, WorkspaceBillingSettings } from './types.js';
import { fillDocumentHtmlTemplate, htmlToPdfLines } from './documentHtmlTemplate.js';
import { drawVerifactuQrOnPdf, shouldRenderVerifactuQrOnPdf } from './documentVerifactuQr.js';

const PAGE_MARGIN = 20;
const PAGE_BOTTOM = 275;
const LINE_HEIGHT = 5.5;
const FONT_SIZE = 9.5;
const CONTENT_RIGHT = 210 - PAGE_MARGIN;

export function buildCustomHtmlPdf(
  templateHtml: string,
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  signer?: DocumentPdfSigner | null,
): jsPDF {
  const filledHtml = fillDocumentHtmlTemplate(templateHtml, doc, client, company, signer);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });

  if (shouldRenderVerifactuQrOnPdf(doc, company)) {
    drawVerifactuQrOnPdf(pdf, doc, CONTENT_RIGHT, 54, 66);
  }

  const htmlWithoutQrBlock = filledHtml.replace(
    /<div class="verifactu-qr">[\s\S]*?<\/div>/g,
    '',
  );
  const lines = htmlToPdfLines(htmlWithoutQrBlock);
  let y = PAGE_MARGIN;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(FONT_SIZE);
  pdf.setTextColor(23, 23, 23);

  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line, 170) as string[];
    const blockHeight = wrapped.length * LINE_HEIGHT;

    if (y + blockHeight > PAGE_BOTTOM) {
      pdf.addPage();
      y = PAGE_MARGIN;
    }

    for (const segment of wrapped) {
      pdf.text(segment, PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  const signatureDataUrl = signer?.imageDataUrl?.trim();
  if (signatureDataUrl) {
    if (y + 28 > PAGE_BOTTOM) {
      pdf.addPage();
      y = PAGE_MARGIN;
    }
    y += 4;
    pdf.setFontSize(8);
    pdf.setTextColor(115, 115, 115);
    pdf.text('Firma', PAGE_MARGIN, y);
    y += 5;
    try {
      pdf.addImage(signatureDataUrl, 'PNG', PAGE_MARGIN, y, 42, 16);
      y += 18;
      pdf.text(signer?.userName?.trim() || 'Usuario', PAGE_MARGIN, y);
    } catch {
      // Ignorar firma inv�lida.
    }
  }

  return pdf;
}
