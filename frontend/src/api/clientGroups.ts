import type { ClientGroup, DeleteClientGroupContactsAction } from '@shared/types';
import { apiFetch } from './client';

export const clientGroupsService = {
  getAll: (): Promise<ClientGroup[]> => apiFetch('/client-groups'),

  create: (name: string): Promise<ClientGroup> =>
    apiFetch('/client-groups', { method: 'POST', body: JSON.stringify({ name }) }),

  update: (id: string, input: Pick<ClientGroup, 'name'>): Promise<ClientGroup> =>
    apiFetch(`/client-groups/${id}`, { method: 'PUT', body: JSON.stringify(input) }),

  delete: (id: string, contactsAction: DeleteClientGroupContactsAction): Promise<void> =>
    apiFetch(`/client-groups/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ contactsAction }),
    }),
};
