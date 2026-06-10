// Render PDF de evidencia fiscal: hoy acoplado a Veri*Factu (provider es_verifactu).
// La resolucion generica vive en electronicInvoicing.ts; migracion de label/render en fase M3.
import type { Document, WorkspaceBillingSettings } from './types.js';
import type { jsPDF } from 'jspdf';
import { isVerifactuApplicable } from './verifactu.js';

export const VERIFACTU_QR_PDF_SIZE_MM = 17;

const MUTED = { r: 115, g: 115, b: 115 };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function hasVerifactuQrData(
  doc: Pick<Document, 'type' | 'verifactuQrDataUrl'>,
): boolean {
  return doc.type === 'invoice' && Boolean(doc.verifactuQrDataUrl?.trim());
}

export function shouldRenderVerifactuQrOnPdf(
  doc: Document,
  company?: WorkspaceBillingSettings | null,
): boolean {
  return isVerifactuApplicable(doc, company) && hasVerifactuQrData(doc);
}

export function buildVerifactuQrSectionHtml(
  doc: Document,
  company?: WorkspaceBillingSettings | null,
): string {
  if (!shouldRenderVerifactuQrOnPdf(doc, company)) return '';

  const qrDataUrl = doc.verifactuQrDataUrl!.trim();

  return `<div class="verifactu-qr">
    <img src="${qrDataUrl}" alt="QR Veri*Factu" width="54" height="54" />
    <div class="verifactu-qr-label">Veri*Factu</div>
  </div>`;
}

export function drawVerifactuQrOnPdf(
  pdf: jsPDF,
  doc: Document,
  contentRight: number,
  bandTopY: number,
  bandBottomY: number,
): void {
  const qrDataUrl = doc.verifactuQrDataUrl?.trim();
  if (!qrDataUrl || doc.type !== 'invoice') return;

  const qrSize = VERIFACTU_QR_PDF_SIZE_MM;
  const qrX = contentRight - qrSize;
  const bandHeight = Math.max(bandBottomY - bandTopY, qrSize);
  const qrY = bandTopY + (bandHeight - qrSize) / 2;

  try {
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch {
    return;
  }

  pdf.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  pdf.setFontSize(5);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Veri*Factu', qrX + qrSize / 2, qrY + qrSize + 2.2, { align: 'center' });
}
