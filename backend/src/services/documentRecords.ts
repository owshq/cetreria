import type { Client, Document } from '@shared/types';
import {
  billingAddressFromClient,
  computeDocumentTotals,
  DEFAULT_DOCUMENT_TAX_RATE,
  normalizeBillingAddress,
  normalizeDocumentLineItem,
} from '@shared/types';

export { billingAddressFromClient, normalizeBillingAddress };

export function normalizeDocumentPayload(
  input: Partial<Document>,
  options: {
    client?: Client;
    defaultTaxRate?: number;
  } = {},
) {
  const items = (input.items ?? []).map(normalizeDocumentLineItem);
  const taxRate = input.taxRate ?? options.defaultTaxRate ?? DEFAULT_DOCUMENT_TAX_RATE;
  const totals = computeDocumentTotals(items, taxRate);
  const fallbackBilling = options.client ? billingAddressFromClient(options.client) : undefined;

  return {
    items,
    subtotal: totals.subtotal,
    taxRate,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes: input.notes?.trim() || undefined,
    billingAddress: normalizeBillingAddress(input.billingAddress, fallbackBilling),
  };
}
