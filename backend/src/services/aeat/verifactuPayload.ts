// Preparatory AEAT core. Not wired to submit flow yet.
// Sandbox sigue usando buildVerifactuRecordHash en verifactu.ts.

import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import {
  VERIFACTU_INVOICE_KIND_CODES,
  normalizeIssuerNif,
  resolveClientTaxId,
  resolveVerifactuInvoiceKind,
} from '@shared/types';

/** Version del contrato interno de payload (no es version AEAT oficial). */
export const VERIFACTU_CANONICAL_PAYLOAD_SCHEMA = '1.0-draft' as const;

export type VerifactuCanonicalPayload = {
  schemaVersion: typeof VERIFACTU_CANONICAL_PAYLOAD_SCHEMA;
  workspaceId: string;
  documentId: string;
  issuerNif: string;
  issuerName: string;
  recipientNif: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceKindCode: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  softwareId: string;
  softwareName: string;
  softwareVersion: string;
  previousRecordHash: string;
  rectifiesDocumentId: string;
};

export type BuildVerifactuCanonicalPayloadInput = {
  document: Document;
  client: Client;
  settings: WorkspaceBillingSettings;
  previousRecordHash?: string | null;
};

function formatDecimal(value: number | undefined | null, fallback = 0): string {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return safe.toFixed(2);
}

function formatTaxRate(value: number | undefined | null): string {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  return safe.toFixed(2);
}

export function normalizePreviousRecordHash(value: string | undefined | null): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed;
}

/**
 * Construye el payload interno canonico para hash normativo (Fase 1).
 * No genera XML AEAT; objeto estable y serializable para golden tests.
 */
export function buildVerifactuCanonicalPayload(
  input: BuildVerifactuCanonicalPayloadInput,
): VerifactuCanonicalPayload {
  const { document, client, settings } = input;
  const invoiceKind = resolveVerifactuInvoiceKind(document);

  return {
    schemaVersion: VERIFACTU_CANONICAL_PAYLOAD_SCHEMA,
    workspaceId: document.workspaceId.trim(),
    documentId: document.id.trim(),
    issuerNif: normalizeIssuerNif(settings.issuerNif),
    issuerName: (settings.companyName ?? '').trim(),
    recipientNif: normalizeIssuerNif(resolveClientTaxId(client)),
    invoiceNumber: document.number.trim(),
    invoiceDate: document.date.trim(),
    invoiceKindCode: VERIFACTU_INVOICE_KIND_CODES[invoiceKind],
    subtotal: formatDecimal(document.subtotal),
    taxRate: formatTaxRate(document.taxRate),
    taxAmount: formatDecimal(document.taxAmount),
    total: formatDecimal(document.total),
    softwareId: (settings.verifactuSoftwareId ?? '').trim(),
    softwareName: (settings.verifactuSoftwareName ?? '').trim(),
    softwareVersion: (settings.verifactuSoftwareVersion ?? '').trim(),
    previousRecordHash: normalizePreviousRecordHash(input.previousRecordHash),
    rectifiesDocumentId: (document.rectifiesDocumentId ?? '').trim(),
  };
}
