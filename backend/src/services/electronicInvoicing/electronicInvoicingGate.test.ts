import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { WorkspaceBillingSettings } from '@shared/types';
import { VERIFACTU_PROD_NOT_CONFIGURED_CODE } from '@shared/types';

describe('approveElectronicInvoicing gate', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let approveElectronicInvoicing: typeof import('./electronicInvoicingGate.js').approveElectronicInvoicing;
  let savedProductionFlag: string | undefined;
  let VERIFACTU_ACCEPTED_INVOICE_ID: string;
  let VERIFACTU_ADMIN_ID: string;
  let VERIFACTU_DELIVERY_NOTE_ID: string;
  let VERIFACTU_PENDING_INVOICE_ID: string;
  let VERIFACTU_WORKSPACE_ID: string;
  let seedVerifactuSmokeScenario: typeof import('../../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-einv-gate-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    savedProductionFlag = process.env.VERIFACTU_PRODUCTION_ENABLED;
    delete process.env.VERIFACTU_PRODUCTION_ENABLED;

    const fixtureMod = await import('../../test/verifactuSmokeFixture.js');
    VERIFACTU_ACCEPTED_INVOICE_ID = fixtureMod.VERIFACTU_ACCEPTED_INVOICE_ID;
    VERIFACTU_ADMIN_ID = fixtureMod.VERIFACTU_ADMIN_ID;
    VERIFACTU_DELIVERY_NOTE_ID = fixtureMod.VERIFACTU_DELIVERY_NOTE_ID;
    VERIFACTU_PENDING_INVOICE_ID = fixtureMod.VERIFACTU_PENDING_INVOICE_ID;
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    seedVerifactuSmokeScenario = fixtureMod.seedVerifactuSmokeScenario;
    verifactuSandboxScenario = fixtureMod.verifactuSandboxScenario;

    const dbMod = await import('../../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;

    const gateMod = await import('./electronicInvoicingGate.js');
    approveElectronicInvoicing = gateMod.approveElectronicInvoicing;
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedVerifactuSmokeScenario(verifactuSandboxScenario);
  });

  after(() => {
    resetDb();
    if (savedProductionFlag === undefined) {
      delete process.env.VERIFACTU_PRODUCTION_ENABLED;
    } else {
      process.env.VERIFACTU_PRODUCTION_ENABLED = savedProductionFlag;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('factura ES con Veri*Factu activo delega en provider es_verifactu y acepta en sandbox', async () => {
    const result = await approveElectronicInvoicing(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_PENDING_INVOICE_ID,
      VERIFACTU_ADMIN_ID,
    );

    assert.equal(result.outcome, 'accepted');
    assert.equal(result.providerId, 'es_verifactu');
    assert.equal(result.document.verifactuStatus, 'aceptado');
    assert.ok(result.document.verifactuHash);
    assert.ok(result.document.verifactuCsv);
  });

  it('factura con Veri*Factu desactivado devuelve pending_configuration', async () => {
    const { updateDoc } = await import('../../db/repository.js');
    const { DB_NAMES } = await import('../../config.js');

    await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      VERIFACTU_WORKSPACE_ID,
      { verifactuEnabled: false },
    );

    const result = await approveElectronicInvoicing(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_PENDING_INVOICE_ID,
      VERIFACTU_ADMIN_ID,
    );

    assert.equal(result.outcome, 'pending_configuration');
    assert.equal(result.providerId, 'none');
    assert.equal(result.reason, 'provider_disabled');
  });

  it('documento no invoice devuelve not_required', async () => {
    const result = await approveElectronicInvoicing(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_DELIVERY_NOTE_ID,
      VERIFACTU_ADMIN_ID,
    );

    assert.equal(result.outcome, 'not_required');
    assert.equal(result.providerId, null);
    assert.equal(result.reason, 'document_type_not_supported');
  });

  it('produccion sin flags devuelve blocked via provider es_verifactu', async () => {
    const { updateDoc } = await import('../../db/repository.js');
    const { DB_NAMES } = await import('../../config.js');

    await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      VERIFACTU_WORKSPACE_ID,
      { verifactuEnvironment: 'production' },
    );

    const result = await approveElectronicInvoicing(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_PENDING_INVOICE_ID,
      VERIFACTU_ADMIN_ID,
    );

    assert.equal(result.outcome, 'blocked');
    assert.equal(result.providerId, 'es_verifactu');
    assert.equal(result.document.verifactuStatus, 'rechazado');
    assert.equal(result.errorCode, VERIFACTU_PROD_NOT_CONFIGURED_CODE);
  });

  it('factura ya aceptada lanza error de validacion', async () => {
    await assert.rejects(
      () =>
        approveElectronicInvoicing(
          VERIFACTU_WORKSPACE_ID,
          VERIFACTU_ACCEPTED_INVOICE_ID,
          VERIFACTU_ADMIN_ID,
        ),
      /pendiente o rechazado/i,
    );
  });
});
