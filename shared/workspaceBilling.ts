import type { WorkspaceBillingSettings } from './types.js';
import { normalizeWorkspaceDocumentFormats } from './documentNumbering.js';
import { normalizeVerifactuSettings } from './verifactu.js';

/** IVA general España; solo fallback si no hay datos de empresa. */
export const DEFAULT_DOCUMENT_TAX_RATE = 21;

export function defaultWorkspaceBillingSettings(workspaceId: string): WorkspaceBillingSettings {
  return {
    id: workspaceId,
    workspaceId,
    companyName: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    defaultTaxRate: DEFAULT_DOCUMENT_TAX_RATE,
    documentFormats: normalizeWorkspaceDocumentFormats(undefined),
  };
}

export function normalizeWorkspaceBillingSettings(
  raw: Partial<WorkspaceBillingSettings> | null | undefined,
  workspaceId: string,
  workspaceName?: string,
): WorkspaceBillingSettings {
  const defaults = defaultWorkspaceBillingSettings(workspaceId);
  if (!raw) {
    return {
      ...defaults,
      companyName: workspaceName?.trim() || defaults.companyName,
    };
  }

  const taxRate = Number(raw.defaultTaxRate);
  const trimmedWorkspaceName = workspaceName?.trim();
  return {
    id: raw.id ?? workspaceId,
    workspaceId,
    companyName: trimmedWorkspaceName || raw.companyName?.trim() || defaults.companyName,
    email: raw.email?.trim() ?? '',
    address: raw.address?.trim() ?? '',
    city: raw.city?.trim() ?? '',
    postalCode: raw.postalCode?.trim() ?? '',
    country: raw.country?.trim() ?? '',
    state: raw.state?.trim() ?? '',
    defaultTaxRate: Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : defaults.defaultTaxRate,
    documentFormats: normalizeWorkspaceDocumentFormats(raw.documentFormats),
    customDocumentHtml:
      typeof raw.customDocumentHtml === 'string' && raw.customDocumentHtml.trim()
        ? raw.customDocumentHtml
        : undefined,
    customDocumentHtmlFileName:
      typeof raw.customDocumentHtmlFileName === 'string' && raw.customDocumentHtmlFileName.trim()
        ? raw.customDocumentHtmlFileName.trim()
        : undefined,
    documentFooterText:
      typeof raw.documentFooterText === 'string' && raw.documentFooterText.trim()
        ? raw.documentFooterText.trim()
        : undefined,
    documentLogoDataUrl:
      typeof raw.documentLogoDataUrl === 'string' && raw.documentLogoDataUrl.trim()
        ? raw.documentLogoDataUrl.trim()
        : undefined,
    ...normalizeVerifactuSettings(raw),
  };
}
