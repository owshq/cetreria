import type { WorkspaceFeatureSettings, WorkspaceFeatureSettingsView } from '@shared/types';
import { normalizeWorkspaceFeatureSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, insertDoc, updateDoc } from '../db/repository.js';
import {
  getWorkspaceBillingSettings,
  saveWorkspaceBillingSettings,
} from './workspaceBillingSettings.js';
import {
  effectiveWorkspaceVerifactuEnabled,
  isVerifactuModuleLicensedInDeployment,
} from './verifactuModuleCap.js';

async function syncVerifactuEnabledToBilling(
  workspaceId: string,
  verifactuEnabled: boolean,
): Promise<void> {
  const billingPatch = await saveWorkspaceBillingSettings(workspaceId, { verifactuEnabled });
  const billingRows = await findByFieldInWorkspace(
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

function toFeatureSettingsView(
  persisted: WorkspaceFeatureSettings,
): WorkspaceFeatureSettingsView {
  return {
    ...persisted,
    verifactuEnabled: effectiveWorkspaceVerifactuEnabled(persisted.verifactuEnabled),
    verifactuModuleLicensed: isVerifactuModuleLicensedInDeployment(),
  };
}

export async function getWorkspaceFeatureSettings(
  workspaceId: string,
): Promise<WorkspaceFeatureSettingsView> {
  const existing = await getRawSettings(workspaceId);
  const normalized = normalizeWorkspaceFeatureSettings(existing, workspaceId);
  let persisted = normalized;

  if (existing?.verifactuEnabled === undefined) {
    const billing = await getWorkspaceBillingSettings(workspaceId);
    if (billing.verifactuEnabled === true) {
      persisted = { ...normalized, verifactuEnabled: true };
    }
  }

  return toFeatureSettingsView(persisted);
}

export async function saveWorkspaceFeatureSettings(
  workspaceId: string,
  body: Partial<WorkspaceFeatureSettings>,
): Promise<WorkspaceFeatureSettings> {
  const existing = await getRawSettings(workspaceId);
  const merged = existing ? { ...existing, ...body } : body;
  const normalized = normalizeWorkspaceFeatureSettings(merged, workspaceId);

  const persisted: WorkspaceFeatureSettings = {
    ...normalized,
    verifactuEnabled: isVerifactuModuleLicensedInDeployment()
      ? normalized.verifactuEnabled
      : false,
  };

  if ('verifactuEnabled' in body) {
    await syncVerifactuEnabledToBilling(workspaceId, persisted.verifactuEnabled);
  }

  return persisted;
}

export function toWorkspaceFeatureSettingsView(
  persisted: WorkspaceFeatureSettings,
): WorkspaceFeatureSettingsView {
  return toFeatureSettingsView(persisted);
}
