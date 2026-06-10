import { Router } from 'express';
import type { WorkspaceScheduleSettings } from '@shared/types';
import {
  getWorkspaceScheduleSettings,
  saveWorkspaceScheduleSettings,
} from '../services/workspaceScheduleSettings.js';
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

async function getSettingsForWorkspace(workspaceId: string): Promise<WorkspaceScheduleSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceScheduleSettings>(
    DB_NAMES.workspaceScheduleSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  res.json(await getWorkspaceScheduleSettings(workspaceId));
});

router.put('/', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as Partial<WorkspaceScheduleSettings>;
  const normalized = await saveWorkspaceScheduleSettings(workspaceId, body);

  const existing = await getSettingsForWorkspace(workspaceId);
  if (existing) {
    const updated = await updateDoc<WorkspaceScheduleSettings>(
      DB_NAMES.workspaceScheduleSettings,
      existing.id,
      normalized,
    );
    res.json(updated);
    return;
  }

  await insertDoc(DB_NAMES.workspaceScheduleSettings, normalized);
  res.status(201).json(normalized);
});

export default router;
