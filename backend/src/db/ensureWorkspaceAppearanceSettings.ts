import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import type { WorkspaceAppearanceSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc } from '../db/repository.js';
import { getWorkspaceAppearanceSettings } from '../services/workspaceAppearanceSettings.js';

export async function ensureWorkspaceAppearanceSettings(): Promise<void> {
  const rows = await findByFieldInWorkspace<WorkspaceAppearanceSettings>(
    DB_NAMES.workspaceAppearanceSettings,
    'workspaceId',
    DEFAULT_WORKSPACE_ID,
    DEFAULT_WORKSPACE_ID,
  );

  if (rows.length > 0) return;

  const defaults = await getWorkspaceAppearanceSettings(DEFAULT_WORKSPACE_ID);
  await insertDoc(DB_NAMES.workspaceAppearanceSettings, defaults);
}
