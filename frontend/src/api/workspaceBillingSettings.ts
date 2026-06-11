import type { DocumentDisplayNameMigrationPolicy, WorkspaceBillingSettings } from '@shared/types';
import { apiFetch } from './client';

export type WorkspaceBillingSettingsUpdate = Partial<WorkspaceBillingSettings> & {
  documentDisplayNameMigration?: DocumentDisplayNameMigrationPolicy;
};

export const workspaceBillingSettingsService = {
  get: (): Promise<WorkspaceBillingSettings> =>
    apiFetch('/workspace-billing-settings'),

  update: (settings: WorkspaceBillingSettingsUpdate): Promise<WorkspaceBillingSettings> =>
    apiFetch('/workspace-billing-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
