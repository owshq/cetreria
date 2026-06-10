import type { LoginBackgroundImage, WorkspaceAppearanceSettings } from '@shared/types';
import { apiFetch, apiFetchBlob, getToken, getWorkspaceId } from './client';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export type LoginBackgroundImageView = LoginBackgroundImage & { resolvedUrl: string };

export type WorkspaceAppearanceSettingsView = Omit<
  WorkspaceAppearanceSettings,
  'loginBackgroundImages'
> & {
  loginBackgroundImages: LoginBackgroundImageView[];
};

export const workspaceAppearanceSettingsService = {
  get: (): Promise<WorkspaceAppearanceSettingsView> =>
    apiFetch('/workspace-appearance-settings'),

  update: (
    settings: Partial<WorkspaceAppearanceSettings>,
  ): Promise<WorkspaceAppearanceSettingsView> =>
    apiFetch('/workspace-appearance-settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),

  addExternalUrl: (url: string): Promise<WorkspaceAppearanceSettingsView> =>
    apiFetch('/workspace-appearance-settings/login-backgrounds/external', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  uploadImage: async (file: File): Promise<WorkspaceAppearanceSettingsView> => {
    const token = getToken();
    const workspaceId = getWorkspaceId();
    const headers = new Headers();
    headers.set('Content-Type', file.type || 'application/octet-stream');
    headers.set('X-Filename', file.name);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (workspaceId) headers.set('X-Workspace-Id', workspaceId);

    const response = await fetch(
      `${API_BASE}/workspace-appearance-settings/login-backgrounds/upload`,
      {
        method: 'POST',
        headers,
        body: file,
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error ?? 'No se pudo subir la imagen.');
    }

    return data as WorkspaceAppearanceSettingsView;
  },

  removeImage: (imageId: string): Promise<WorkspaceAppearanceSettingsView> =>
    apiFetch(`/workspace-appearance-settings/login-backgrounds/${imageId}`, {
      method: 'DELETE',
    }),

  downloadUploadedImage: (imageId: string, filename: string): Promise<void> =>
    apiFetchBlob(
      `/workspace-appearance-settings/login-backgrounds/${imageId}/file?download=1`,
    ).then((blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }),
};
