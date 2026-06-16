import type { Client } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listAllInWorkspace } from '../db/repository.js';
import { listNotificationsForUser, syncCalendarReminders } from './notifications.js';

export type NotificationsInboxPayload = {
  notifications: Awaited<ReturnType<typeof listNotificationsForUser>>;
  unreadCount: number;
};

export async function loadNotificationsInbox(
  workspaceId: string,
  userId: string,
): Promise<NotificationsInboxPayload> {
  const clients = await listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  await syncCalendarReminders(workspaceId, userId, clientsById);
  const notifications = await listNotificationsForUser(workspaceId, userId);
  const unreadCount = notifications.filter((item) => !item.readAt).length;

  return { notifications, unreadCount };
}
