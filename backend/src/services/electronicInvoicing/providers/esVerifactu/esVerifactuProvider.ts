import type {
  ElectronicInvoicingGateResult,
  ElectronicInvoicingProviderHealth,
  WorkspaceBillingSettings,
} from '@shared/types';
import {
  isVerifactuProductionOperational,
  mapVerifactuSubmitToApprovalOutcome,
  validateVerifactuSubmit,
} from '@shared/types';
import { submitDocumentToVerifactu } from '../../../verifactu.js';
import type {
  ElectronicInvoicingProvider,
  ElectronicInvoicingProviderConfigurationResult,
  ElectronicInvoicingProviderContext,
} from '../../electronicInvoicingProvider.js';
import { getEsVerifactuCertificateHealth } from './esVerifactuCertificateHealth.js';
import { resolveEsVerifactuConfig } from './esVerifactuConfig.js';

function validateEsVerifactuWorkspaceConfiguration(
  settings: WorkspaceBillingSettings,
): ElectronicInvoicingProviderConfigurationResult {
  const errors: string[] = [];

  if (settings.verifactuEnabled !== true) {
    errors.push('Veri*Factu no esta activado en la configuracion del workspace.');
  }

  if (!settings.issuerNif?.trim()) {
    errors.push('Falta el NIF/CIF del emisor.');
  }

  if (!settings.companyName?.trim()) {
    errors.push('Falta la razon social del emisor.');
  }

  const config = resolveEsVerifactuConfig(settings);
  if (
    config.mode === 'production' &&
    !isVerifactuProductionOperational(process.env.VERIFACTU_PRODUCTION_ENABLED)
  ) {
    errors.push('Produccion AEAT no operativa (falta flag o cableado Fase 2B+).');
  }

  return { ok: errors.length === 0, errors };
}

export function createEsVerifactuProvider(): ElectronicInvoicingProvider {
  return {
    getProviderId() {
      return 'es_verifactu';
    },

    validateConfiguration(settings) {
      return validateEsVerifactuWorkspaceConfiguration(settings);
    },

    getCertificateHealth(settings) {
      const config = resolveEsVerifactuConfig(settings);
      const cert = getEsVerifactuCertificateHealth(config);
      return {
        providerId: config.providerId,
        country: config.country,
        authority: config.authority,
        mode: config.mode,
        certificateStatus: cert.certificateStatus,
        productionReady: false,
      };
    },

    async approveDocument(ctx) {
      const { workspaceId, document, client, settings } = ctx;
      const validation = validateVerifactuSubmit(document, client, settings);
      if (!validation.ok) {
        throw new Error(validation.errors.join(' '));
      }

      const submitResult = await submitDocumentToVerifactu(workspaceId, document.id);
      const updated = submitResult.document;

      return {
        outcome: mapVerifactuSubmitToApprovalOutcome({
          verifactuStatus: updated.verifactuStatus,
          verifactuErrorCode: updated.verifactuErrorCode,
        }),
        providerId: 'es_verifactu',
        document: updated,
        errorCode: updated.verifactuErrorCode,
        errorMessage: updated.verifactuErrorMessage,
      };
    },
  };
}

/** Instancia singleton del provider espanol (Fase 2A). */
export const esVerifactuProvider = createEsVerifactuProvider();
