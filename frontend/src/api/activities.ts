import type { Activity } from '@shared/types';
import { apiFetch } from './client';
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
    payload: { workedMinutes: number; notes?: string; status?: 'draft' | 'submitted' },
  ): Promise<Activity> =>
    apiFetch<Activity>(`/activities/${id}/work-report`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then((updated) => {
      invalidateActivitiesCache();
      invalidateDocumentsBootstrapCache();
      return updated;
    }),

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
};
