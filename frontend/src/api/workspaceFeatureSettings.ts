import type { WorkspaceFeatureSettings } from '@shared/types';
import { apiFetch } from './client';

export const workspaceFeatureSettingsService = {
  get: (): Promise<WorkspaceFeatureSettings> => apiFetch('/workspace-feature-settings'),

  update: (settings: Partial<WorkspaceFeatureSettings>): Promise<WorkspaceFeatureSettings> =>
    apiFetch('/workspace-feature-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
