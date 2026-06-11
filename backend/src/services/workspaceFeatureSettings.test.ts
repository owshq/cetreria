import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { WorkspaceBillingSettings } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  VERIFACTU_WORKSPACE_ID,
  seedWorkspaceFeatureToggleScenario,
} from '../test/workspaceFeatureSettingsSmokeFixture.js';

describe('workspaceFeatureSettings service', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let getWorkspaceFeatureSettings: typeof import('./workspaceFeatureSettings.js').getWorkspaceFeatureSettings;
  let saveWorkspaceFeatureSettings: typeof import('./workspaceFeatureSettings.js').saveWorkspaceFeatureSettings;
  let getWorkspaceBillingSettings: typeof import('./workspaceBillingSettings.js').getWorkspaceBillingSettings;
  let findByFieldInWorkspace: typeof import('../db/repository.js').findByFieldInWorkspace;
  let savedVerifactuModuleFlag: string | undefined;

  before(async () => {
    savedVerifactuModuleFlag = process.env.VERIFACTU_MODULE_ENABLED;
    process.env.VERIFACTU_MODULE_ENABLED = 'true';

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-feature-settings-svc-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;

    const dbMod = await import('../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;

    const serviceMod = await import('./workspaceFeatureSettings.js');
    getWorkspaceFeatureSettings = serviceMod.getWorkspaceFeatureSettings;
    saveWorkspaceFeatureSettings = serviceMod.saveWorkspaceFeatureSettings;

    const billingMod = await import('./workspaceBillingSettings.js');
    getWorkspaceBillingSettings = billingMod.getWorkspaceBillingSettings;

    const repoMod = await import('../db/repository.js');
    findByFieldInWorkspace = repoMod.findByFieldInWorkspace;
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedWorkspaceFeatureToggleScenario({ billingVerifactuEnabled: false });
  });

  after(() => {
    resetDb();
    if (savedVerifactuModuleFlag === undefined) {
      delete process.env.VERIFACTU_MODULE_ENABLED;
    } else {
      process.env.VERIFACTU_MODULE_ENABLED = savedVerifactuModuleFlag;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sin licencia de despliegue no permite activar verifactuEnabled', async () => {
    process.env.VERIFACTU_MODULE_ENABLED = 'false';
    const saved = await saveWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID, {
      verifactuEnabled: true,
    });
    assert.equal(saved.verifactuEnabled, false);

    const view = await getWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(view.verifactuEnabled, false);
    assert.equal(view.verifactuModuleLicensed, false);

    const billing = await getWorkspaceBillingSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(billing.verifactuEnabled, false);

    process.env.VERIFACTU_MODULE_ENABLED = 'true';
  });

  it('GET devuelve verifactuEnabled false por defecto', async () => {
    const settings = await getWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(settings.verifactuEnabled, false);
  });

  it('PUT activa verifactuEnabled y sincroniza billing', async () => {
    const saved = await saveWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID, {
      verifactuEnabled: true,
    });
    assert.equal(saved.verifactuEnabled, true);

    const billing = await getWorkspaceBillingSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(billing.verifactuEnabled, true);
  });

  it('PUT desactiva verifactuEnabled y sincroniza billing', async () => {
    await saveWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID, { verifactuEnabled: true });
    const saved = await saveWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID, {
      verifactuEnabled: false,
    });
    assert.equal(saved.verifactuEnabled, false);

    const billing = await getWorkspaceBillingSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(billing.verifactuEnabled, false);
  });

  it('GET hace fallback legacy desde billing cuando feature row no define verifactuEnabled', async () => {
    const billingRows = await findByFieldInWorkspace(
      DB_NAMES.workspaceBillingSettings,
      'workspaceId',
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_WORKSPACE_ID,
    );
    assert.ok(billingRows[0]);

    const { updateDoc } = await import('../db/repository.js');
    await updateDoc<WorkspaceBillingSettings>(DB_NAMES.workspaceBillingSettings, billingRows[0].id, {
      verifactuEnabled: true,
    });

    const settings = await getWorkspaceFeatureSettings(VERIFACTU_WORKSPACE_ID);
    assert.equal(settings.verifactuEnabled, true);
  });
});
