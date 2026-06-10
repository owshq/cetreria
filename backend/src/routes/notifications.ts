import { Router } from 'express';
import type { Client } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listAllInWorkspace } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import {
  listNotificationsForUser,
  markNotificationsRead,
  syncCalendarReminders,
} from '../services/notifications.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;

  const clients = await listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  await syncCalendarReminders(workspaceId, userId, clientsById);
  const notifications = await listNotificationsForUser(workspaceId, userId);

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  res.json({ notifications, unreadCount });
});

router.patch('/read', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string')
    : undefined;

  const notifications = await markNotificationsRead(workspaceId, userId, ids);
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  res.json({ notifications, unreadCount });
});

export default router;
