import type { WorkspaceFeatureSettingsView } from '@shared/types';
import { apiFetch } from './client';

export const workspaceFeatureSettingsService = {
  get: (): Promise<WorkspaceFeatureSettingsView> => apiFetch('/workspace-feature-settings'),

  update: (
    settings: Partial<WorkspaceFeatureSettingsView>,
  ): Promise<WorkspaceFeatureSettingsView> =>
    apiFetch('/workspace-feature-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
