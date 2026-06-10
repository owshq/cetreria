import type { InvoiceConceptSetting } from '@shared/types';
import { apiFetch } from './client';

export const invoiceConceptSettingsService = {
  getAll: (): Promise<InvoiceConceptSetting[]> => apiFetch('/invoice-concept-settings'),

  create: (payload: {
    label: string;
    emoji: string;
    defaultPrice?: number;
  }): Promise<InvoiceConceptSetting> =>
    apiFetch('/invoice-concept-settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (
    id: string,
    updates: Partial<Pick<InvoiceConceptSetting, 'label' | 'emoji' | 'defaultPrice'>>,
  ): Promise<InvoiceConceptSetting> =>
    apiFetch(`/invoice-concept-settings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/invoice-concept-settings/${id}`, { method: 'DELETE' }),

  upsert: (normalizedKey: string, emoji: string, label?: string): Promise<InvoiceConceptSetting> =>
    apiFetch('/invoice-concept-settings', {
      method: 'PUT',
      body: JSON.stringify({ normalizedKey, emoji, label }),
    }),
};
