import type { User, UserAssignee } from '@shared/types';
import { apiFetch } from './client';

export const usersService = {
  getAssignees: (): Promise<UserAssignee[]> => apiFetch('/users/assignees'),

  getAll: (): Promise<Omit<User, 'password'>[]> => apiFetch('/users'),

  create: (user: Omit<User, 'id'>): Promise<Omit<User, 'password'>> =>
    apiFetch('/users', { method: 'POST', body: JSON.stringify(user) }),

  update: (id: string, updates: Partial<User>): Promise<Omit<User, 'password'>> =>
    apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/users/${id}`, { method: 'DELETE' }),
};
