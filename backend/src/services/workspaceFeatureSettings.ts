import type { WorkspaceBillingSettings, WorkspaceFeatureSettings } from '@shared/types';
import { normalizeWorkspaceFeatureSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc, updateDoc } from '../db/repository.js';
import {
  getWorkspaceBillingSettings,
  saveWorkspaceBillingSettings,
} from './workspaceBillingSettings.js';

async function syncVerifactuEnabledToBilling(
  workspaceId: string,
  verifactuEnabled: boolean,
): Promise<void> {
  const billingPatch = await saveWorkspaceBillingSettings(workspaceId, { verifactuEnabled });
  const billingRows = await findByFieldInWorkspace<WorkspaceBillingSettings>(
    DB_NAMES.workspaceBillingSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  if (billingRows[0]) {
    await updateDoc(DB_NAMES.workspaceBillingSettings, billingRows[0].id, billingPatch);
    return;
  }
  await insertDoc(DB_NAMES.workspaceBillingSettings, billingPatch);
}

async function getRawSettings(workspaceId: string): Promise<WorkspaceFeatureSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceFeatureSettings>(
    DB_NAMES.workspaceFeatureSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

export async function getWorkspaceFeatureSettings(
  workspaceId: string,
): Promise<WorkspaceFeatureSettings> {
  const existing = await getRawSettings(workspaceId);
  const normalized = normalizeWorkspaceFeatureSettings(existing, workspaceId);

  if (existing?.verifactuEnabled === undefined) {
    const billing = await getWorkspaceBillingSettings(workspaceId);
    if (billing.verifactuEnabled === true) {
      return { ...normalized, verifactuEnabled: true };
    }
  }

  return normalized;
}

export async function saveWorkspaceFeatureSettings(
  workspaceId: string,
  body: Partial<WorkspaceFeatureSettings>,
): Promise<WorkspaceFeatureSettings> {
  const existing = await getRawSettings(workspaceId);
  const merged = existing ? { ...existing, ...body } : body;
  const normalized = normalizeWorkspaceFeatureSettings(merged, workspaceId);

  if ('verifactuEnabled' in body) {
    await syncVerifactuEnabledToBilling(workspaceId, normalized.verifactuEnabled);
  }

  return normalized;
}
