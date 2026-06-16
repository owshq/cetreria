import { Router } from 'express';
import { authQueryOrBearer, workspaceFromHeaderOrQuery } from '../middleware/authQueryOrBearer.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { loadNotificationsInbox } from '../services/notificationsInbox.js';

const router = Router();

router.use(authQueryOrBearer);
router.use(workspaceFromHeaderOrQuery);
router.use(workspaceRequired);

/** Fallback HTTP para entornos sin WebSocket (Vercel serverless). */
router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  const inbox = await loadNotificationsInbox(workspaceId, userId);

  res.json({
    transport: 'http',
    ...inbox,
  });
});

export default router;
