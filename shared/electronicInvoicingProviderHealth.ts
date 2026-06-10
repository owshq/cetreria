import type {
  ElectronicInvoicingCountryCode,
  ElectronicInvoicingEnvironment,
  ElectronicInvoicingProviderId,
} from './electronicInvoicing.js';

/** Estado preparatorio del certificado (Fase 2A: sin carga ni firma). */
export type ElectronicInvoicingCertificateStatus = 'missing' | 'configured' | 'invalid';

/** Respuesta health de un provider fiscal (admin). */
export type ElectronicInvoicingProviderHealth = {
  providerId: ElectronicInvoicingProviderId;
  country: ElectronicInvoicingCountryCode;
  authority: string;
  mode: ElectronicInvoicingEnvironment;
  certificateStatus: ElectronicInvoicingCertificateStatus;
  /** Fase 2A: siempre false; produccion AEAT no cableada. */
  productionReady: boolean;
};
