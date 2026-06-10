import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getWorkspacesForUser } from '../services/workspaces.js';

const router = Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  const workspaces = await getWorkspacesForUser(req.user!.id);
  res.json(workspaces);
});

export default router;
