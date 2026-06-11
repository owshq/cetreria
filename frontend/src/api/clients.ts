import type { Client, ClientAssignUsersMode } from '@shared/types';
import { apiFetch } from './client';
import {
  getCachedResource,
  invalidateDocumentsBootstrapCache,
  invalidateResourceCache,
  resourceCacheKey,
} from './resourceCache';

function invalidateClientsCache(): void {
  invalidateResourceCache(resourceCacheKey('/clients'));
  invalidateDocumentsBootstrapCache();
}

export const clientsService = {
  getAll: (): Promise<Client[]> =>
    getCachedResource(resourceCacheKey('/clients'), () => apiFetch<Client[]>('/clients')),

  getById: async (id: string): Promise<Client | null> => {
    try {
      return await apiFetch<Client>(`/clients/${id}`);
    } catch {
      return null;
    }
  },

  create: (client: Omit<Client, 'id' | 'observations'>): Promise<Client> =>
    apiFetch('/clients', { method: 'POST', body: JSON.stringify(client) }).then((created) => {
      invalidateClientsCache();
      return created;
    }),

  update: (
    id: string,
    updates: Partial<Omit<Client, 'observations'>>,
  ): Promise<Client> =>
    apiFetch(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(updates) }).then((updated) => {
      invalidateClientsCache();
      return updated;
    }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/clients/${id}`, { method: 'DELETE' }).then((result) => {
      invalidateClientsCache();
      return result;
    }),

  addObservation: (clientId: string, text: string): Promise<Client> =>
    apiFetch(`/clients/${clientId}/observations`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }).then((updated) => {
      invalidateClientsCache();
      return updated;
    }),

  deleteObservation: (clientId: string, observationId: string): Promise<Client> =>
    apiFetch(`/clients/${clientId}/observations/${observationId}`, { method: 'DELETE' }).then(
      (updated) => {
        invalidateClientsCache();
        return updated;
      },
    ),

  deleteAllObservations: (clientId: string): Promise<Client> =>
    apiFetch(`/clients/${clientId}/observations`, { method: 'DELETE' }).then((updated) => {
      invalidateClientsCache();
      return updated;
    }),

  bulkAssignUsers: (payload: {
    clientIds: string[];
    userIds: string[];
    mode: ClientAssignUsersMode;
  }): Promise<Client[]> =>
    apiFetch('/clients/bulk-assign-users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then((updated) => {
      invalidateClientsCache();
      return updated;
    }),
};

export type { ClientObservation };
