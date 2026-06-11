import { Router } from 'express';
import type { WorkspaceFeatureSettings } from '@shared/types';
import {
  getWorkspaceFeatureSettings,
  saveWorkspaceFeatureSettings,
  toWorkspaceFeatureSettingsView,
} from '../services/workspaceFeatureSettings.js';
import { DB_NAMES } from '../config.js';
import {
  findByFieldInWorkspace,
  insertDoc,
  updateDoc,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function getSettingsForWorkspace(workspaceId: string): Promise<WorkspaceFeatureSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceFeatureSettings>(
    DB_NAMES.workspaceFeatureSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  res.json(await getWorkspaceFeatureSettings(workspaceId));
});

router.put('/', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as Partial<WorkspaceFeatureSettings>;
  const persisted = await saveWorkspaceFeatureSettings(workspaceId, body);

  const existing = await getSettingsForWorkspace(workspaceId);
  if (existing) {
    await updateDoc<WorkspaceFeatureSettings>(
      DB_NAMES.workspaceFeatureSettings,
      existing.id,
      persisted,
    );
    res.json(toWorkspaceFeatureSettingsView(persisted));
    return;
  }

  await insertDoc(DB_NAMES.workspaceFeatureSettings, persisted);
  res.status(201).json(toWorkspaceFeatureSettingsView(persisted));
});

export default router;
