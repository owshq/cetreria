import QRCode from 'qrcode';
import {
  buildVerifactuQrUrl,
  type Document,
  type WorkspaceBillingSettings,
} from '@shared/types';

async function generateQrDataUrl(qrUrl: string): Promise<string> {
  return QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    type: 'image/png',
  });
}

/** Solo enriquece la vista previa cuando Veri*Factu esta activo y hay datos reales o emisor valido. */
export async function ensureInvoiceVerifactuQrPreview(
  doc: Document,
  company?: WorkspaceBillingSettings | null,
): Promise<Document> {
  if (doc.type !== 'invoice') return doc;
  if (company?.verifactuEnabled !== true) return doc;
  if (doc.verifactuQrDataUrl?.trim()) return doc;

  const issuerNif = company.issuerNif?.trim();
  if (!issuerNif) return doc;

  const qrUrl =
    doc.verifactuQrUrl?.trim() ||
    buildVerifactuQrUrl({
      issuerNif,
      invoiceNumber: doc.number,
      date: doc.date,
      total: doc.total,
    });

  const qrDataUrl = await generateQrDataUrl(qrUrl);

  return {
    ...doc,
    verifactuQrUrl: qrUrl,
    verifactuQrDataUrl: qrDataUrl,
  };
}
