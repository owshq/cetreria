import type { WorkspaceScheduleSettings } from '@shared/types';
import { apiFetch } from './client';

export const workspaceScheduleSettingsService = {
  get: (): Promise<WorkspaceScheduleSettings> => apiFetch('/workspace-schedule-settings'),

  update: (settings: Partial<WorkspaceScheduleSettings>): Promise<WorkspaceScheduleSettings> =>
    apiFetch('/workspace-schedule-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};
