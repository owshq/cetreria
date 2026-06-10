import type { ActivityType } from '@shared/types';
import { apiFetch } from './client';

export const activityTypesService = {
  getAll: (): Promise<ActivityType[]> => apiFetch('/activity-types'),

  create: (type: Omit<ActivityType, 'id'>): Promise<ActivityType> =>
    apiFetch('/activity-types', { method: 'POST', body: JSON.stringify(type) }),

  update: (id: string, updates: Partial<Omit<ActivityType, 'id'>>): Promise<ActivityType> =>
    apiFetch(`/activity-types/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/activity-types/${id}`, { method: 'DELETE' }),
};
