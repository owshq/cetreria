import type { Client, Document, DocumentBillingAddress, DocumentLineItem } from './types.js';
import { DEFAULT_DOCUMENT_TAX_RATE } from './workspaceBilling.js';

export function billingAddressFromClient(client: Client): DocumentBillingAddress {
  return {
    name: client.name?.trim() ?? '',
    email: client.email?.trim() ?? '',
    address: client.address?.trim() ?? '',
    city: client.city?.trim() ?? '',
    postalCode: client.postalCode?.trim() ?? '',
    country: client.country?.trim() ?? '',
    state: client.state?.trim() ?? '',
  };
}

export function normalizeBillingAddress(
  raw: Partial<DocumentBillingAddress> | undefined,
  fallback?: DocumentBillingAddress,
): DocumentBillingAddress {
  const base = fallback ?? {
    name: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
  };

  const pick = (value: string | undefined, fallback: string) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : fallback;
  };

  return {
    name: pick(raw?.name, base.name),
    email: pick(raw?.email, base.email),
    address: pick(raw?.address, base.address),
    city: pick(raw?.city, base.city),
    postalCode: pick(raw?.postalCode, base.postalCode),
    country: pick(raw?.country, base.country),
    state: pick(raw?.state, base.state),
  };
}

export const DOCUMENT_TYPE_LABELS: Record<Document['type'], string> = {
  invoice: 'Factura',
  'delivery-note': 'Albarán',
};

/** NIF/CIF/DNI del contacto desde campos personalizados. */
export function resolveClientTaxId(client: Client): string {
  const fields = client.customFields ?? {};
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === 'nif' || normalizedKey === 'cif' || normalizedKey === 'dni') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return '';
}

export function normalizeDocumentLineItem(
  item: Partial<DocumentLineItem> & { description?: string },
): DocumentLineItem {
  return {
    name: item.name?.trim() ?? '',
    description: item.description?.trim() ?? '',
    quantity: Number.isFinite(item.quantity) ? Math.max(0, item.quantity!) : 0,
    price: Number.isFinite(item.price) ? Math.max(0, item.price!) : 0,
  };
}

export function computeDocumentTotals(
  items: readonly DocumentLineItem[],
  taxRate: number = DEFAULT_DOCUMENT_TAX_RATE,
): { subtotal: number; taxAmount: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + normalizeDocumentLineItem(item).quantity * normalizeDocumentLineItem(item).price,
    0,
  );
  const safeRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0;
  const taxAmount = subtotal * (safeRate / 100);
  return {
    subtotal: roundMoney(subtotal),
    taxAmount: roundMoney(taxAmount),
    total: roundMoney(subtotal + taxAmount),
  };
}

export function resolveDocumentTotals(
  doc: Pick<Document, 'items' | 'subtotal' | 'taxRate' | 'taxAmount' | 'total'>,
): { subtotal: number; taxAmount: number; total: number; taxRate: number } {
  const items = doc.items.map(normalizeDocumentLineItem);
  const taxRate = doc.taxRate ?? DEFAULT_DOCUMENT_TAX_RATE;

  if (doc.subtotal !== undefined && doc.taxAmount !== undefined && doc.total !== undefined) {
    return {
      subtotal: doc.subtotal,
      taxAmount: doc.taxAmount,
      total: doc.total,
      taxRate,
    };
  }

  const legacySubtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  if (doc.taxRate === undefined && doc.subtotal === undefined) {
    return {
      subtotal: roundMoney(legacySubtotal),
      taxAmount: 0,
      total: roundMoney(doc.total ?? legacySubtotal),
      taxRate: 0,
    };
  }

  return { ...computeDocumentTotals(items, taxRate), taxRate };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isBillableDocumentType(type: Document['type']): boolean {
  return type === 'invoice' || type === 'delivery-note';
}

export function isFinancialDocumentType(type: Document['type']): boolean {
  return type === 'invoice';
}

export function sumDocumentTotalByStatus(
  documents: readonly Document[],
  status: Document['status'],
): number {
  return documents
    .filter((doc) => doc.status === status)
    .reduce((sum, doc) => sum + (Number.isFinite(doc.total) ? doc.total : 0), 0);
}

export function sumDocumentTotals(documents: readonly Document[]): number {
  return documents.reduce(
    (sum, doc) => sum + (Number.isFinite(doc.total) ? doc.total : 0),
    0,
  );
}

export function formatDocumentAmount(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
