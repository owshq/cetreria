import type { WorkspaceBillingSettings } from './types.js';
import { DOCUMENT_LOGO_DOCS_DATA_URL } from './documentPdfBrandAssets.js';

export const DOCUMENT_LOGO_MAX_WIDTH_MM = 58;
export const DOCUMENT_LOGO_MAX_HEIGHT_MM = 22;

export function resolveDocumentLogoDataUrl(
  company?: Pick<WorkspaceBillingSettings, 'documentLogoDataUrl'> | null,
): string {
  const custom = company?.documentLogoDataUrl?.trim();
  return custom || DOCUMENT_LOGO_DOCS_DATA_URL;
}

export function resolveDocumentLogoImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  const normalized = dataUrl.trim().toLowerCase();
  if (normalized.startsWith('data:image/jpeg') || normalized.startsWith('data:image/jpg')) {
    return 'JPEG';
  }
  if (normalized.startsWith('data:image/webp')) {
    return 'WEBP';
  }
  return 'PNG';
}

export function fitImageToBoxMm(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }

  const ratio = naturalWidth / naturalHeight;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}
