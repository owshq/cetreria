import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { loadNotificationsInbox } from '../services/notificationsInbox.js';
import { markNotificationsRead } from '../services/notifications.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  res.json(await loadNotificationsInbox(workspaceId, userId));
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
