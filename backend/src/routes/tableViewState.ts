import { Router } from 'express';
import type { UserTableViewStatePage } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc, updateDoc } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function getUserStateBundle(
  workspaceId: string,
  userId: string,
  pageKey: string,
): Promise<UserTableViewStatePage | null> {
  const matches = await findByFieldInWorkspace<UserTableViewStatePage>(
    DB_NAMES.tableViewStateUserPages,
    'pageKey',
    pageKey,
    workspaceId,
  );
  return matches.find((entry) => entry.userId === userId) ?? null;
}

router.get('/:pageKey', async (req, res) => {
  const pageKey = routeParam(req.params.pageKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;

  const bundle = await getUserStateBundle(workspaceId, userId, pageKey);
  if (!bundle) {
    res.json({ config: null, activeSavedViewId: null });
    return;
  }

  res.json({
    config: bundle.config ?? null,
    activeSavedViewId:
      typeof bundle.activeSavedViewId === 'string' ? bundle.activeSavedViewId : null,
  });
});

router.put('/:pageKey', async (req, res) => {
  const pageKey = routeParam(req.params.pageKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  const config = req.body?.config ?? null;
  const activeSavedViewId =
    typeof req.body?.activeSavedViewId === 'string' ? req.body.activeSavedViewId : null;
  const now = new Date().toISOString();

  const existing = await getUserStateBundle(workspaceId, userId, pageKey);

  if (existing) {
    await updateDoc<UserTableViewStatePage>(DB_NAMES.tableViewStateUserPages, existing.id, {
      config,
      activeSavedViewId,
      updatedAt: now,
    });
  } else {
    const bundle: UserTableViewStatePage = {
      id: crypto.randomUUID(),
      workspaceId,
      userId,
      pageKey,
      config,
      activeSavedViewId,
      updatedAt: now,
    };
    await insertDoc(DB_NAMES.tableViewStateUserPages, bundle);
  }

  res.json({ config, activeSavedViewId });
});

export default router;
