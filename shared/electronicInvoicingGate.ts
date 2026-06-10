/**
 * Contrato HTTP del Electronic Invoicing Approval Gate.
 * Implementacion servidor: backend/src/services/electronicInvoicing/electronicInvoicingGate.ts
 */

import type { Document } from './types.js';
import type {
  ElectronicInvoicingApprovalOutcome,
  ElectronicInvoicingProviderId,
  ElectronicInvoicingResolutionReason,
} from './electronicInvoicing.js';

export type ElectronicInvoicingGateResult = {
  outcome: ElectronicInvoicingApprovalOutcome;
  providerId: ElectronicInvoicingProviderId | null;
  document: Document;
  reason?: ElectronicInvoicingResolutionReason;
  errorCode?: string;
  errorMessage?: string;
};
