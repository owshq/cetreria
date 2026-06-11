import { Router } from 'express';
import type { WorkspaceBillingSettings } from '@shared/types';
import {
  type DocumentDisplayNameMigrationPolicy,
  hasDocumentNameFormatChanges,
  normalizeWorkspaceDocumentFormats,
} from '@shared/types';
import {
  getWorkspaceBillingSettings,
  saveWorkspaceBillingSettings,
} from '../services/workspaceBillingSettings.js';
import { applyDocumentDisplayNameMigration } from '../services/documentDisplayNames.js';
import { updateWorkspaceName } from '../services/workspaces.js';
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

async function getSettingsForWorkspace(workspaceId: string): Promise<WorkspaceBillingSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceBillingSettings>(
    DB_NAMES.workspaceBillingSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  res.json(await getWorkspaceBillingSettings(workspaceId));
});

type WorkspaceBillingSettingsUpdateBody = Partial<WorkspaceBillingSettings> & {
  documentDisplayNameMigration?: DocumentDisplayNameMigrationPolicy;
};

router.put('/', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as WorkspaceBillingSettingsUpdateBody;
  const migrationPolicy = body.documentDisplayNameMigration ?? 'keep';
  const { documentDisplayNameMigration: _migration, ...billingPatch } = body;

  const previousSettings = await getWorkspaceBillingSettings(workspaceId);
  const previousFormats = normalizeWorkspaceDocumentFormats(previousSettings.documentFormats);
  const nextFormats = billingPatch.documentFormats
    ? normalizeWorkspaceDocumentFormats(billingPatch.documentFormats)
    : previousFormats;
  const nameFormatChanged =
    billingPatch.documentFormats !== undefined &&
    hasDocumentNameFormatChanges(previousFormats, nextFormats);

  if (typeof body.companyName === 'string' && body.companyName.trim()) {
    await updateWorkspaceName(workspaceId, body.companyName);
  }

  const normalized = await saveWorkspaceBillingSettings(workspaceId, billingPatch);

  const existing = await getSettingsForWorkspace(workspaceId);
  if (existing) {
    const updated = await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      existing.id,
      normalized,
    );

    if (nameFormatChanged) {
      await applyDocumentDisplayNameMigration(
        workspaceId,
        migrationPolicy,
        previousFormats,
        nextFormats,
      );
    }

    res.json(updated);
    return;
  }

  await insertDoc(DB_NAMES.workspaceBillingSettings, normalized);
  res.status(201).json(normalized);
});

export default router;
