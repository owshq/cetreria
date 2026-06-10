import type { Document } from './types.js';

export type DocumentFormatKey = 'generated' | 'uploaded-pdf' | 'uploaded-image';

export const DOCUMENT_FORMAT_LABELS: Record<DocumentFormatKey, string> = {
  generated: 'PDF generado',
  'uploaded-pdf': 'PDF subido',
  'uploaded-image': 'Imagen',
};

export const DOCUMENT_FORMAT_EMOJI: Record<DocumentFormatKey, string> = {
  generated: '✨',
  'uploaded-pdf': '📄',
  'uploaded-image': '🖼️',
};

export function getDocumentFormatKey(
  doc: Pick<Document, 'pdfSource' | 'pdfContentType'>,
): DocumentFormatKey {
  if (doc.pdfSource !== 'uploaded') return 'generated';
  const mime = (doc.pdfContentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (mime === 'application/pdf') return 'uploaded-pdf';
  return 'uploaded-image';
}

export function getDocumentFormatLabel(
  doc: Pick<Document, 'pdfSource' | 'pdfContentType'>,
): string {
  return DOCUMENT_FORMAT_LABELS[getDocumentFormatKey(doc)];
}
