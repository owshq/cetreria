import type { Workspace, WorkspaceBillingSettings } from '@shared/types';
import { normalizeWorkspaceBillingSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, getById } from '../db/repository.js';

async function getRawSettings(workspaceId: string): Promise<WorkspaceBillingSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceBillingSettings>(
    DB_NAMES.workspaceBillingSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

async function getWorkspaceName(workspaceId: string): Promise<string | undefined> {
  const workspace = await getById<Workspace>(DB_NAMES.workspaces, workspaceId);
  return workspace?.name;
}

export async function getWorkspaceBillingSettings(
  workspaceId: string,
): Promise<WorkspaceBillingSettings> {
  const [workspaceName, existing] = await Promise.all([
    getWorkspaceName(workspaceId),
    getRawSettings(workspaceId),
  ]);
  return normalizeWorkspaceBillingSettings(existing, workspaceId, workspaceName);
}

export async function saveWorkspaceBillingSettings(
  workspaceId: string,
  body: Partial<WorkspaceBillingSettings>,
): Promise<WorkspaceBillingSettings> {
  const [workspaceName, existing] = await Promise.all([
    getWorkspaceName(workspaceId),
    getRawSettings(workspaceId),
  ]);
  const merged = existing ? { ...existing, ...body } : body;
  return normalizeWorkspaceBillingSettings(merged, workspaceId, workspaceName);
}
