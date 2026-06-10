import type { WorkspaceScheduleSettings } from '@shared/types';
import { normalizeWorkspaceScheduleSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace } from '../db/repository.js';

async function getRawSettings(workspaceId: string): Promise<WorkspaceScheduleSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceScheduleSettings>(
    DB_NAMES.workspaceScheduleSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

export async function getWorkspaceScheduleSettings(
  workspaceId: string,
): Promise<WorkspaceScheduleSettings> {
  const existing = await getRawSettings(workspaceId);
  return normalizeWorkspaceScheduleSettings(existing, workspaceId);
}

export async function saveWorkspaceScheduleSettings(
  workspaceId: string,
  body: Partial<WorkspaceScheduleSettings>,
): Promise<WorkspaceScheduleSettings> {
  const existing = await getRawSettings(workspaceId);
  const merged = existing ? { ...existing, ...body } : body;
  return normalizeWorkspaceScheduleSettings(merged, workspaceId);
}
