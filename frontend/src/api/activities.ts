import type { Activity } from '@shared/types';
import { resolveDocumentSourceFileMimeType } from '@shared/types';
import { apiFetch, apiFetchBlob, ApiError, getToken, getWorkspaceId } from './client';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
import {
  getCachedResource,
  invalidateDocumentsBootstrapCache,
  invalidateResourceCache,
  primeResourceCache,
  resourceCacheKey,
} from './resourceCache';

function activitiesQuery(params?: { from?: string; to?: string; clientId?: string }): string {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.clientId) qs.set('clientId', params.clientId);
  const q = qs.toString();
  return q ? `?${q}` : '';
}

function activitiesPath(params?: { from?: string; to?: string; clientId?: string }): string {
  return `/activities${activitiesQuery(params)}`;
}

export function invalidateActivitiesCache(): void {
  invalidateResourceCache(resourceCacheKey('/activities'));
  invalidateDocumentsBootstrapCache();
}

export const activitiesService = {
  getAll: (params?: { from?: string; to?: string }): Promise<Activity[]> =>
    getCachedResource(resourceCacheKey(activitiesPath(params)), () =>
      apiFetch(`/activities${activitiesQuery(params)}`),
    ),

  getAllFresh: async (params?: { from?: string; to?: string }): Promise<Activity[]> => {
    invalidateActivitiesCache();
    const data = await apiFetch<Activity[]>(`/activities${activitiesQuery(params)}`);
    primeResourceCache(resourceCacheKey(activitiesPath(params)), data);
    return data;
  },

  getByClientId: (clientId: string, params?: { from?: string; to?: string }): Promise<Activity[]> =>
    getCachedResource(resourceCacheKey(activitiesPath({ ...params, clientId })), () =>
      apiFetch(`/activities${activitiesQuery({ ...params, clientId })}`),
    ),

  getById: async (id: string): Promise<Activity | null> => {
    try {
      return await apiFetch<Activity>(`/activities/${id}`);
    } catch {
      return null;
    }
  },

  create: (activity: Omit<Activity, 'id' | 'createdAt'>): Promise<Activity> =>
    apiFetch('/activities', { method: 'POST', body: JSON.stringify(activity) }).then((created) => {
      invalidateActivitiesCache();
      return created;
    }),

  update: (id: string, updates: Partial<Activity>): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${id}`, { method: 'PUT', body: JSON.stringify(updates) }).then(
      (updated) => {
        invalidateActivitiesCache();
        return updated;
      },
    ),

  delete: (id: string): Promise<void> =>
    apiFetch(`/activities/${id}`, { method: 'DELETE' }).then((result) => {
      invalidateActivitiesCache();
      return result;
    }),

  submitWorkReport: (
    id: string,
    payload: {
      workedMinutes: number;
      notes?: string;
      zones?: Array<{ id: string; title: string; notes: string }>;
      status?: 'draft' | 'submitted';
    },
  ): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${id}/work-report`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then((updated) => {
      invalidateActivitiesCache();
      invalidateDocumentsBootstrapCache();
      return updated;
    }),

  uploadWorkReportZoneImage: async (
    activityId: string,
    zoneId: string,
    file: File,
  ): Promise<Activity> => {
    const token = getToken();
    const workspaceId = getWorkspaceId();
    const headers = new Headers();
    headers.set('Content-Type', resolveDocumentSourceFileMimeType(file));
    headers.set('X-Filename', file.name);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (workspaceId) headers.set('X-Workspace-Id', workspaceId);

    const response = await fetch(
      `${API_BASE}/activities/${activityId}/work-report/zones/${zoneId}/images`,
      {
        method: 'POST',
        headers,
        body: file,
      },
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error ?? 'No se pudo subir la imagen.', response.status);
    }

    invalidateActivitiesCache();
    invalidateDocumentsBootstrapCache();
    return data as Activity;
  },

  deleteWorkReportZoneImage: (activityId: string, imageId: string): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${activityId}/work-report/images/${imageId}`, {
      method: 'DELETE',
    }).then((updated) => {
      invalidateActivitiesCache();
      invalidateDocumentsBootstrapCache();
      return updated;
    }),

  getWorkReportImageBlob: (activityId: string, imageId: string): Promise<Blob> =>
    apiFetchBlob(`/activities/${activityId}/work-report/images/${imageId}/file`),

  updateWorkReportExtraItems: (
    id: string,
    items: Array<{
      name: string;
      description: string;
      quantity: number;
      price: number;
    }>,
  ): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${id}/work-report/extra-items`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    }).then((updated) => {
      invalidateActivitiesCache();
      invalidateDocumentsBootstrapCache();
      return updated;
    }),

  uploadAttachment: async (activityId: string, file: File): Promise<Activity> => {
    const token = getToken();
    const workspaceId = getWorkspaceId();
    const headers = new Headers();
    headers.set('Content-Type', file.type || 'application/octet-stream');
    headers.set('X-Filename', file.name);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (workspaceId) headers.set('X-Workspace-Id', workspaceId);

    const response = await fetch(`${API_BASE}/activities/${activityId}/attachments`, {
      method: 'POST',
      headers,
      body: file,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error ?? 'No se pudo subir el archivo.', response.status);
    }

    invalidateActivitiesCache();
    return data as Activity;
  },

  deleteAttachment: (activityId: string, attachmentId: string): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${activityId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }).then((updated) => {
      invalidateActivitiesCache();
      return updated;
    }),

  getAttachmentBlob: (activityId: string, attachmentId: string): Promise<Blob> =>
    apiFetchBlob(`/activities/${activityId}/attachments/${attachmentId}/file`),
};
