import type { Notification } from '@shared/types';
import { apiFetch } from './client';

export type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
};

export const notificationsService = {
  getAll: (): Promise<NotificationsResponse> => apiFetch('/notifications'),

  markRead: (ids?: string[]): Promise<NotificationsResponse> =>
    apiFetch('/notifications/read', {
      method: 'PATCH',
      body: JSON.stringify(ids?.length ? { ids } : {}),
    }),
};
