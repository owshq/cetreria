import type { ElectronicInvoicingProviderId } from '@shared/types';
import type { ElectronicInvoicingProvider } from './electronicInvoicingProvider.js';
import { esVerifactuProvider } from './providers/esVerifactu/esVerifactuProvider.js';

const PROVIDERS: Partial<Record<Exclude<ElectronicInvoicingProviderId, 'none'>, ElectronicInvoicingProvider>> =
  {
    es_verifactu: esVerifactuProvider,
  };

export function getElectronicInvoicingProvider(
  providerId: Exclude<ElectronicInvoicingProviderId, 'none'>,
): ElectronicInvoicingProvider | null {
  return PROVIDERS[providerId] ?? null;
}
