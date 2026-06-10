import type { Client, Document, WorkspaceBillingSettings } from './types.js';
import { resolveClientTaxId } from './documents.js';

/** Estados oficiales del registro Veri*Factu en el flujo AEAT. */
export type VerifactuStatus =
  | 'pendiente'
  | 'enviado'
  | 'aceptado'
  | 'rechazado'
  | 'anulado';

/** Tipo de factura segun catalogo Veri*Factu (F1/F2/R1-R5). */
export type VerifactuInvoiceKind =
  | 'ordinaria'
  | 'simplificada'
  | 'rectificativa'
  | 'rectificativa_simplificada';

export type VerifactuEnvironment = 'sandbox' | 'production';

export const VERIFACTU_STATUS_LABELS: Record<VerifactuStatus, string> = {
  pendiente: 'Pendiente de envio',
  enviado: 'Enviado a AEAT',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};

export const VERIFACTU_STATUS_DOT: Record<VerifactuStatus, string> = {
  pendiente: '#737373',
  enviado: '#3b82f6',
  aceptado: '#22c55e',
  rechazado: '#ef4444',
  anulado: '#a855f7',
};

export const VERIFACTU_INVOICE_KIND_LABELS: Record<VerifactuInvoiceKind, string> = {
  ordinaria: 'Factura ordinaria (F1)',
  simplificada: 'Factura simplificada (F2)',
  rectificativa: 'Factura rectificativa (R1)',
  rectificativa_simplificada: 'Rectificativa simplificada (R5)',
};

export const VERIFACTU_INVOICE_KIND_CODES: Record<VerifactuInvoiceKind, string> = {
  ordinaria: 'F1',
  simplificada: 'F2',
  rectificativa: 'R1',
  rectificativa_simplificada: 'R5',
};

export const VERIFACTU_INVOICE_KINDS: VerifactuInvoiceKind[] = [
  'ordinaria',
  'simplificada',
  'rectificativa',
  'rectificativa_simplificada',
];

export const VERIFACTU_STATUSES: VerifactuStatus[] = [
  'pendiente',
  'enviado',
  'aceptado',
  'rechazado',
  'anulado',
];

/** Codigo de rechazo cuando produccion AEAT no esta cableada en el servidor. */
export const VERIFACTU_PROD_NOT_CONFIGURED_CODE = 'PROD_NOT_CONFIGURED';

/** Mensaje operador cuando produccion no esta disponible (sin integracion AEAT real). */
export const VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE =
  'Produccion todavia no esta configurada. Requiere certificado digital, integracion AEAT y configuracion servidor.';

/**
 * Produccion AEAT real solo cuando un flag explicito lo habilita
 * (p. ej. VITE_VERIFACTU_PRODUCTION_ENABLED o VERIFACTU_PRODUCTION_ENABLED).
 */
export function isVerifactuProductionOperational(
  productionEnabledFlag?: boolean | string | null,
): boolean {
  if (productionEnabledFlag === true) return true;
  if (typeof productionEnabledFlag === 'string') {
    const normalized = productionEnabledFlag.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

const NIF_RE = /^[0-9A-Z][0-9]{7}[0-9A-Z]$/i;

export function normalizeIssuerNif(value: string | undefined | null): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isValidSpanishNif(value: string | undefined | null): boolean {
  const normalized = normalizeIssuerNif(value);
  if (!normalized) return false;
  return NIF_RE.test(normalized);
}

export function resolveVerifactuInvoiceKind(
  doc: Pick<Document, 'invoiceKind'>,
): VerifactuInvoiceKind {
  const kind = doc.invoiceKind;
  if (kind && VERIFACTU_INVOICE_KINDS.includes(kind)) return kind;
  return 'ordinaria';
}

export function isVerifactuApplicable(
  doc: Pick<Document, 'type'>,
  settings?: Pick<WorkspaceBillingSettings, 'verifactuEnabled'> | null,
): boolean {
  return doc.type === 'invoice' && settings?.verifactuEnabled === true;
}

export function resolveVerifactuStatus(
  doc: Pick<Document, 'type' | 'verifactuStatus'>,
  settings?: Pick<WorkspaceBillingSettings, 'verifactuEnabled'> | null,
): VerifactuStatus | null {
  if (!isVerifactuApplicable(doc, settings)) return null;
  if (doc.verifactuStatus && VERIFACTU_STATUSES.includes(doc.verifactuStatus)) {
    return doc.verifactuStatus;
  }
  return 'pendiente';
}

export function canSubmitVerifactu(
  doc: Pick<Document, 'type' | 'verifactuStatus' | 'pdfSource'>,
  settings?: Pick<WorkspaceBillingSettings, 'verifactuEnabled'> | null,
): boolean {
  if (!isVerifactuApplicable(doc, settings)) return false;
  if (doc.pdfSource === 'uploaded') return false;
  const status = resolveVerifactuStatus(doc, settings);
  return status === 'pendiente' || status === 'rechazado';
}

export function isVerifactuLocked(
  doc: Pick<Document, 'verifactuStatus'>,
): boolean {
  return doc.verifactuStatus === 'aceptado' || doc.verifactuStatus === 'anulado';
}

/** Formato fecha QR AEAT: DD-MM-YYYY */
export function formatVerifactuQrDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** URL de validacion QR segun especificacion AEAT (ValidarQR). */
export function buildVerifactuQrUrl(input: {
  issuerNif: string;
  invoiceNumber: string;
  date: string;
  total: number;
}): string {
  const nif = normalizeIssuerNif(input.issuerNif);
  const numserie = encodeURIComponent(input.invoiceNumber.trim());
  const fecha = formatVerifactuQrDate(input.date);
  const importe = input.total.toFixed(2);
  return `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${encodeURIComponent(nif)}&numserie=${numserie}&fecha=${fecha}&importe=${importe}`;
}

/** Huella simplificada para registro (sandbox); produccion usa encadenamiento AEAT. */
export function buildVerifactuRecordHash(input: {
  issuerNif: string;
  invoiceNumber: string;
  date: string;
  total: number;
  invoiceKind: VerifactuInvoiceKind;
  previousHash?: string;
}): string {
  const payload = [
    normalizeIssuerNif(input.issuerNif),
    input.invoiceNumber.trim(),
    input.date.trim(),
    input.total.toFixed(2),
    VERIFACTU_INVOICE_KIND_CODES[input.invoiceKind],
    input.previousHash?.trim() ?? '',
  ].join('|');
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(64, '0').slice(0, 64);
}

/** CSV (Codigo Seguro de Verificacion) derivado de la huella. */
export function buildVerifactuCsv(recordHash: string): string {
  const base = recordHash.replace(/[^0-9a-f]/gi, '').toUpperCase();
  const chunks = [
    base.slice(0, 4),
    base.slice(4, 8),
    base.slice(8, 12),
    base.slice(12, 16),
  ];
  return chunks.join('-');
}

export type VerifactuSubmitValidation = {
  ok: boolean;
  errors: string[];
};

export function validateVerifactuSubmit(
  doc: Document,
  client: Client,
  settings: WorkspaceBillingSettings,
): VerifactuSubmitValidation {
  const errors: string[] = [];

  if (!settings.verifactuEnabled) {
    errors.push('Veri*Factu no esta activado en la configuracion del workspace.');
  }

  const issuerNif = normalizeIssuerNif(settings.issuerNif);
  if (!isValidSpanishNif(issuerNif)) {
    errors.push('El NIF/CIF del emisor en configuracion Veri*Factu no es valido.');
  }

  if (!settings.companyName?.trim()) {
    errors.push('Falta la razon social del emisor en datos de empresa.');
  }

  const clientNif = resolveClientTaxId(client);
  const invoiceKind = resolveVerifactuInvoiceKind(doc);
  if (invoiceKind !== 'simplificada' && invoiceKind !== 'rectificativa_simplificada') {
    if (!clientNif) {
      errors.push('El contacto debe tener NIF/CIF/DNI en campos personalizados.');
    }
  }

  if (invoiceKind === 'rectificativa' || invoiceKind === 'rectificativa_simplificada') {
    if (!doc.rectifiesDocumentId?.trim()) {
      errors.push('Las facturas rectificativas deben indicar la factura que rectifican.');
    }
  }

  if (!doc.number?.trim()) {
    errors.push('La factura debe tener numero asignado.');
  }

  if (!Number.isFinite(doc.total) || doc.total <= 0) {
    errors.push('El importe total de la factura debe ser mayor que cero.');
  }

  if (doc.pdfSource === 'uploaded') {
    errors.push('No se puede enviar a AEAT un documento subido manualmente.');
  }

  if (!canSubmitVerifactu(doc, settings)) {
    errors.push('La factura no esta en estado pendiente o rechazado para reenvio.');
  }

  return { ok: errors.length === 0, errors };
}

export function normalizeVerifactuSettings(
  raw: Partial<WorkspaceBillingSettings> | null | undefined,
): Pick<
  WorkspaceBillingSettings,
  | 'verifactuEnabled'
  | 'verifactuEnvironment'
  | 'issuerNif'
  | 'verifactuSoftwareName'
  | 'verifactuSoftwareId'
  | 'verifactuSoftwareVersion'
  | 'verifactuCertificateFileName'
  | 'verifactuLastRecordHash'
> {
  const environment: VerifactuEnvironment =
    raw?.verifactuEnvironment === 'production' ? 'production' : 'sandbox';

  return {
    verifactuEnabled: raw?.verifactuEnabled === true,
    verifactuEnvironment: environment,
    issuerNif: normalizeIssuerNif(raw?.issuerNif),
    verifactuSoftwareName: raw?.verifactuSoftwareName?.trim() ?? '',
    verifactuSoftwareId: raw?.verifactuSoftwareId?.trim() ?? '',
    verifactuSoftwareVersion: raw?.verifactuSoftwareVersion?.trim() ?? '',
    verifactuCertificateFileName: raw?.verifactuCertificateFileName?.trim() ?? '',
    verifactuLastRecordHash: raw?.verifactuLastRecordHash?.trim() ?? '',
  };
}
