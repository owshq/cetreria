import type { Client, Document } from '@shared/types';
import {
  resolveElectronicInvoicingProviderForDocument,
  type ElectronicInvoicingApprovalOutcome,
  type ElectronicInvoicingGateResult,
  type ElectronicInvoicingProviderId,
} from '@shared/types';
import { DB_NAMES } from '../../config.js';
import { getByIdInWorkspace } from '../../db/repository.js';
import { getWorkspaceBillingSettings } from '../workspaceBillingSettings.js';
import { getElectronicInvoicingProvider } from './providerRegistry.js';

function buildGateResult(input: {
  outcome: ElectronicInvoicingApprovalOutcome;
  providerId: ElectronicInvoicingProviderId | null;
  document: Document;
  reason?: ElectronicInvoicingGateResult['reason'];
  errorCode?: string;
  errorMessage?: string;
}): ElectronicInvoicingGateResult {
  return {
    outcome: input.outcome,
    providerId: input.providerId,
    document: input.document,
    reason: input.reason,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
  };
}

/**
 * Punto de entrada del gate de aprobacion fiscal.
 * Resuelve provider por pais y delega en el flujo sandbox existente (es_verifactu).
 */
export async function approveElectronicInvoicing(
  workspaceId: string,
  documentId: string,
  _userId: string,
): Promise<ElectronicInvoicingGateResult> {
  const document = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    documentId,
    workspaceId,
  );
  if (!document) {
    throw new Error('Documento no encontrado');
  }

  if (document.type !== 'invoice') {
    return buildGateResult({
      outcome: 'not_required',
      providerId: null,
      document,
      reason: 'document_type_not_supported',
    });
  }

  const settings = await getWorkspaceBillingSettings(workspaceId);
  const resolution = resolveElectronicInvoicingProviderForDocument(document, settings);

  if (!resolution.applicable) {
    const outcome: ElectronicInvoicingApprovalOutcome =
      resolution.reason === 'provider_disabled' || resolution.reason === 'unsupported_country'
        ? 'pending_configuration'
        : 'not_required';

    return buildGateResult({
      outcome,
      providerId: 'none',
      document,
      reason: resolution.reason,
    });
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    document.clientId,
    workspaceId,
  );
  if (!client) {
    throw new Error('Contacto no encontrado');
  }

  const provider = getElectronicInvoicingProvider(resolution.provider.providerId);
  if (!provider) {
    throw new Error('Provider de facturacion electronica no implementado');
  }

  return provider.approveDocument({
    workspaceId,
    document,
    client,
    settings,
  });
}

export async function getElectronicInvoicingProviderHealth(
  workspaceId: string,
  providerId: Exclude<ElectronicInvoicingProviderId, 'none'>,
) {
  const provider = getElectronicInvoicingProvider(providerId);
  if (!provider) {
    throw new Error('Provider de facturacion electronica no encontrado');
  }
  const settings = await getWorkspaceBillingSettings(workspaceId);
  return provider.getCertificateHealth(settings);
}
