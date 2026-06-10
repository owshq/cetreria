import type { WorkspaceBillingSettings } from '@shared/types';
import { apiFetch } from './client';

export const workspaceBillingSettingsService = {
  get: (): Promise<WorkspaceBillingSettings> =>
    apiFetch('/workspace-billing-settings'),

  update: (settings: Partial<WorkspaceBillingSettings>): Promise<WorkspaceBillingSettings> =>
    apiFetch('/workspace-billing-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
