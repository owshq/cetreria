import { Router } from 'express';
import type { UserInteractionPage } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc, updateDoc } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function getUserInteractionBundle(
  workspaceId: string,
  userId: string,
  interactionKey: string,
): Promise<UserInteractionPage | null> {
  const matches = await findByFieldInWorkspace<UserInteractionPage>(
    DB_NAMES.userInteractionPages,
    'interactionKey',
    interactionKey,
    workspaceId,
  );
  return matches.find((entry) => entry.userId === userId) ?? null;
}

router.get('/:interactionKey', async (req, res) => {
  const interactionKey = routeParam(req.params.interactionKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;

  const bundle = await getUserInteractionBundle(workspaceId, userId, interactionKey);
  if (!bundle) {
    res.json({ payload: null });
    return;
  }

  res.json({ payload: bundle.payload ?? null });
});

router.put('/:interactionKey', async (req, res) => {
  const interactionKey = routeParam(req.params.interactionKey);
  const workspaceId = req.workspaceId!;
  const userId = req.user!.id;
  const payload = req.body?.payload ?? null;
  const now = new Date().toISOString();

  const existing = await getUserInteractionBundle(workspaceId, userId, interactionKey);

  if (existing) {
    await updateDoc<UserInteractionPage>(DB_NAMES.userInteractionPages, existing.id, {
      payload,
      updatedAt: now,
    });
  } else {
    const bundle: UserInteractionPage = {
      id: crypto.randomUUID(),
      workspaceId,
      userId,
      interactionKey,
      payload,
      updatedAt: now,
    };
    await insertDoc(DB_NAMES.userInteractionPages, bundle);
  }

  res.json({ payload });
});

export default router;
