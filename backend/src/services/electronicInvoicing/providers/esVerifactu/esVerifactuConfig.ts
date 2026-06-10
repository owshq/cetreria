import type { WorkspaceBillingSettings } from '@shared/types';
import { ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU } from '@shared/types';

export type EsVerifactuMode = 'sandbox' | 'production';

export type EsVerifactuResolvedConfig = {
  providerId: typeof ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.providerId;
  country: typeof ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.country;
  authority: typeof ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.authority;
  mode: EsVerifactuMode;
  /** Nombre declarado en workspace (metadata). */
  certificateFileName: string;
  /** Ruta servidor desde VERIFACTU_CERT_PATH (solo existencia, sin carga). */
  certificatePath: string;
};

export function resolveEsVerifactuMode(
  settings: Pick<WorkspaceBillingSettings, 'verifactuEnvironment'>,
): EsVerifactuMode {
  return settings.verifactuEnvironment === 'production' ? 'production' : 'sandbox';
}

export function resolveEsVerifactuConfig(
  settings: WorkspaceBillingSettings,
  env: NodeJS.ProcessEnv = process.env,
): EsVerifactuResolvedConfig {
  return {
    providerId: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.providerId,
    country: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.country,
    authority: ELECTRONIC_INVOICING_PROVIDER_ES_VERIFACTU.authority,
    mode: resolveEsVerifactuMode(settings),
    certificateFileName: settings.verifactuCertificateFileName?.trim() ?? '',
    certificatePath: env.VERIFACTU_CERT_PATH?.trim() ?? '',
  };
}
