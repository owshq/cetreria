import type { ClientGroup, DeleteClientGroupContactsAction } from '@shared/types';
import { apiFetch } from './client';

export const clientGroupsService = {
  getAll: (): Promise<ClientGroup[]> => apiFetch('/client-groups'),

  create: (name: string): Promise<ClientGroup> =>
    apiFetch('/client-groups', { method: 'POST', body: JSON.stringify({ name }) }),

  delete: (id: string, contactsAction: DeleteClientGroupContactsAction): Promise<void> =>
    apiFetch(`/client-groups/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ contactsAction }),
    }),
};
