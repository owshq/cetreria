/**
 * Electronic Invoicing Gate � capa conceptual generica (Fase M1).
 *
 * Los campos `verifactu*` en Document y WorkspaceBillingSettings son legacy /
 * provider-specific (Espana / AEAT). La migracion a campos genericos
 * `electronicInvoicing*` sera una fase posterior (M2). Hasta entonces, el gate
 * resuelve providers y delega en la logica Veri*Factu existente sin renombrar datos.
 *
 * No cablea AEAT real ni altera submitDocumentToVerifactu.
 */

import type { Document, WorkspaceBillingSettings } from './types.js';
import {
  VERIFACTU_PROD_NOT_CONFIGURED_CODE,
  canSubmitVerifactu,
  isVerifactuProductionOperational,
  type VerifactuEnvironment,
  type VerifactuStatus,
} from './verifactu.js';

/** Identificadores de providers registrados. `none` = sin provider aplicable. */
export type ElectronicInvoicingProviderId = 'es_verifactu' | 'none';

/** Codigo ISO 3166-1 alpha-2 del pais fiscal del emisor. */
export type ElectronicInvoicingCountryCode = 'ES' | 'IT' | 'FR' | 'PT' | 'MX' | 'CL' | string;

/** Entorno de envio al organismo fiscal. */
export type ElectronicInvoicingEnvironment = 'sandbox' | 'production';

/**
 * Modo de envio: sandbox simulado o produccion (requiere flags y cableado real).
 * Hoy solo es_verifactu en sandbox simulado esta operativo.
 */
export type ElectronicInvoicingSubmissionMode = 'sandbox' | 'production';

/** Estados genericos de registro fiscal (vocabulario gate). */
export type ElectronicInvoicingStatus =
  | 'not_applicable'
  | 'pending'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

/** Resultado de aprobacion fiscal via Electronic Invoicing Gate. */
export type ElectronicInvoicingApprovalOutcome =
  | 'not_required'
  | 'pending_configuration'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'blocked';

export type ElectronicInvoicingAuthority = 'AEAT' | string;

export const ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU = {
  providerId: 'es_verifactu',
  country: 'ES',
  authority: 'AEAT',
} as const satisfies {
  providerId: ElectronicInvoicingProviderId;
  country: ElectronicInvoicingCountryCode;
  authority: ElectronicInvoicingAuthority;
};

/** Settings minimos para resolver provider (billing + toggle legacy). */
export type ElectronicInvoicingWorkspaceSettings = Pick<
  WorkspaceBillingSettings,
  'verifactuEnabled' | 'verifactuEnvironment' | 'country'
>;

export type ResolvedElectronicInvoicingProvider = {
  providerId: Exclude<ElectronicInvoicingProviderId, 'none'>;
  country: ElectronicInvoicingCountryCode;
  authority: ElectronicInvoicingAuthority;
  environment: ElectronicInvoicingEnvironment;
  submissionMode: ElectronicInvoicingSubmissionMode;
};

export type ElectronicInvoicingProviderResolution =
  | { applicable: true; provider: ResolvedElectronicInvoicingProvider }
  | { applicable: false; providerId: 'none'; reason: ElectronicInvoicingResolutionReason };

export type ElectronicInvoicingResolutionReason =
  | 'document_type_not_supported'
  | 'unsupported_country'
  | 'provider_disabled';

const COUNTRY_ALIASES: Record<string, ElectronicInvoicingCountryCode> = {
  es: 'ES',
  espana: 'ES',
  spain: 'ES',
  it: 'IT',
  italia: 'IT',
  italy: 'IT',
  fr: 'FR',
  france: 'FR',
  francia: 'FR',
  pt: 'PT',
  portugal: 'PT',
  mx: 'MX',
  mexico: 'MX',
  cl: 'CL',
  chile: 'CL',
};

/** Paises con provider registrado hoy (solo ES). */
const REGISTERED_PROVIDER_COUNTRIES: ReadonlySet<string> = new Set(['ES']);

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza nombre o codigo de pais del workspace a ISO alpha-2. */
export function normalizeElectronicInvoicingCountry(
  country: string | undefined | null,
): ElectronicInvoicingCountryCode | null {
  const trimmed = (country ?? '').trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;

  const key = stripDiacritics(trimmed.toLowerCase());
  return COUNTRY_ALIASES[key] ?? null;
}

/**
 * Pais fiscal efectivo del workspace.
 * Si el pais esta vacio pero Veri*Factu esta activo, asume ES (producto espanol).
 */
export function resolveElectronicInvoicingCountry(
  settings: ElectronicInvoicingWorkspaceSettings,
): ElectronicInvoicingCountryCode | null {
  const normalized = normalizeElectronicInvoicingCountry(settings.country);
  if (normalized) return normalized;
  if (settings.verifactuEnabled === true) return 'ES';
  return null;
}

/**
 * Indica si el workspace tiene facturacion electronica habilitada para algun provider.
 * Hoy: equivalente a verifactuEnabled en pais ES.
 */
export function isElectronicInvoicingEnabledForWorkspace(
  settings: ElectronicInvoicingWorkspaceSettings,
): boolean {
  if (settings.verifactuEnabled !== true) return false;
  const country = resolveElectronicInvoicingCountry(settings);
  return country === 'ES';
}

function resolveEnvironment(
  settings: ElectronicInvoicingWorkspaceSettings,
): ElectronicInvoicingEnvironment {
  return settings.verifactuEnvironment === 'production' ? 'production' : 'sandbox';
}

function resolveSpainVerifactuProvider(
  settings: ElectronicInvoicingWorkspaceSettings,
): ElectronicInvoicingProviderResolution {
  const environment = resolveEnvironment(settings);
  return {
    applicable: true,
    provider: {
      providerId: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.providerId,
      country: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.country,
      authority: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.authority,
      environment,
      submissionMode: environment,
    },
  };
}

/**
 * Resuelve el provider fiscal para un documento sin ejecutar envio.
 * Punto de entrada futuro del Electronic Invoicing Gate.
 */
export function resolveElectronicInvoicingProviderForDocument(
  document: Pick<Document, 'type'>,
  settings: ElectronicInvoicingWorkspaceSettings,
): ElectronicInvoicingProviderResolution {
  if (document.type !== 'invoice') {
    return { applicable: false, providerId: 'none', reason: 'document_type_not_supported' };
  }

  if (settings.verifactuEnabled !== true) {
    return { applicable: false, providerId: 'none', reason: 'provider_disabled' };
  }

  const country = resolveElectronicInvoicingCountry(settings);
  if (!country || !REGISTERED_PROVIDER_COUNTRIES.has(country)) {
    return { applicable: false, providerId: 'none', reason: 'unsupported_country' };
  }

  if (country === 'ES') {
    return resolveSpainVerifactuProvider(settings);
  }

  return { applicable: false, providerId: 'none', reason: 'unsupported_country' };
}

/** Mapeo proyeccion: estados Veri*Factu legacy ? vocabulario generico del gate. */
export function mapVerifactuStatusToElectronicInvoicingStatus(
  status: VerifactuStatus | undefined | null,
): ElectronicInvoicingStatus {
  switch (status) {
    case 'pendiente':
      return 'pending';
    case 'enviado':
      return 'submitted';
    case 'aceptado':
      return 'accepted';
    case 'rechazado':
      return 'rejected';
    case 'anulado':
      return 'cancelled';
    default:
      return 'not_applicable';
  }
}

/** Mapeo inverso util para UI que aun lee verifactuStatus. */
export function mapElectronicInvoicingStatusToVerifactuStatus(
  status: ElectronicInvoicingStatus,
): VerifactuStatus | null {
  switch (status) {
    case 'pending':
      return 'pendiente';
    case 'submitted':
      return 'enviado';
    case 'accepted':
      return 'aceptado';
    case 'rejected':
      return 'rechazado';
    case 'cancelled':
      return 'anulado';
    default:
      return null;
  }
}

/**
 * Produccion operativa solo con flag explicito (es_verifactu delega en Veri*Factu).
 * Sandbox siempre operativo a nivel conceptual; el envio real sigue en verifactu.ts.
 */
export function isElectronicInvoicingProductionOperational(
  provider: ResolvedElectronicInvoicingProvider,
  productionEnabledFlag?: boolean | string | null,
): boolean {
  if (provider.environment !== 'production') return true;
  if (provider.providerId === 'es_verifactu') {
    return isVerifactuProductionOperational(productionEnabledFlag);
  }
  return false;
}

/** Proyeccion del entorno legacy Veri*Factu al vocabulario del gate. */
export function mapVerifactuEnvironmentToElectronicInvoicing(
  environment: VerifactuEnvironment | undefined | null,
): ElectronicInvoicingEnvironment {
  return environment === 'production' ? 'production' : 'sandbox';
}

/** Mapeo resultado provider Veri*Factu ? outcome del gate de aprobacion. */
export function mapVerifactuSubmitToApprovalOutcome(input: {
  verifactuStatus?: VerifactuStatus | null;
  verifactuErrorCode?: string | null;
}): ElectronicInvoicingApprovalOutcome {
  const { verifactuStatus, verifactuErrorCode } = input;
  if (verifactuStatus === 'aceptado') return 'accepted';
  if (verifactuStatus === 'rechazado') {
    if (verifactuErrorCode === VERIFACTU_PROD_NOT_CONFIGURED_CODE) return 'blocked';
    return 'rejected';
  }
  if (verifactuStatus === 'enviado') return 'submitted';
  return 'submitted';
}

/**
 * Indica si el documento puede mostrar accion de aprobacion fiscal.
 * Hoy delega en reglas Veri*Factu (provider es_verifactu).
 */
export function canApproveElectronicInvoicing(
  doc: Pick<Document, 'type' | 'verifactuStatus' | 'pdfSource'>,
  settings?: ElectronicInvoicingWorkspaceSettings | null,
): boolean {
  const resolution = resolveElectronicInvoicingProviderForDocument(
    doc,
    settings ?? { verifactuEnabled: false, country: '' },
  );
  if (!resolution.applicable) return false;
  return canSubmitVerifactu(doc, settings);
}
