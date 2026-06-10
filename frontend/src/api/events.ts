import type { CalendarEvent } from '@shared/types';
import { apiFetch } from './client';

export const eventsService = {
  getAll: (): Promise<CalendarEvent[]> => apiFetch('/events'),

  getById: async (id: string): Promise<CalendarEvent | null> => {
    try {
      return await apiFetch<CalendarEvent>(`/events/${id}`);
    } catch {
      return null;
    }
  },

  create: (event: Omit<CalendarEvent, 'id' | 'history'>): Promise<CalendarEvent> =>
    apiFetch('/events', { method: 'POST', body: JSON.stringify(event) }),

  update: (id: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent> =>
    apiFetch(`/events/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/events/${id}`, { method: 'DELETE' }),
};
