import type {
  Client,
  Document,
  ElectronicInvoicingGateResult,
  ElectronicInvoicingProviderHealth,
  WorkspaceBillingSettings,
} from '@shared/types';
import type { ElectronicInvoicingProviderId } from '@shared/types';

export type ElectronicInvoicingProviderContext = {
  workspaceId: string;
  document: Document;
  client: Client;
  settings: WorkspaceBillingSettings;
};

export type ElectronicInvoicingProviderConfigurationResult = {
  ok: boolean;
  errors: string[];
};

/**
 * Contrato de provider fiscal (Fase 2A).
 * approveDocument delega en sandbox actual hasta Fase 2B.
 */
export interface ElectronicInvoicingProvider {
  getProviderId(): Exclude<ElectronicInvoicingProviderId, 'none'>;
  validateConfiguration(
    settings: WorkspaceBillingSettings,
  ): ElectronicInvoicingProviderConfigurationResult;
  getCertificateHealth(settings: WorkspaceBillingSettings): ElectronicInvoicingProviderHealth;
  approveDocument(ctx: ElectronicInvoicingProviderContext): Promise<ElectronicInvoicingGateResult>;
}
