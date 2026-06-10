import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { WorkspaceBillingSettings } from '@shared/types';
import {
  VERIFACTU_PROD_NOT_CONFIGURED_CODE,
  isVerifactuLocked,
} from '@shared/types';

describe('submitDocumentToVerifactu service', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let submitDocumentToVerifactu: typeof import('./verifactu.js').submitDocumentToVerifactu;
  let savedProductionFlag: string | undefined;
  let VERIFACTU_ACCEPTED_INVOICE_ID: string;
  let VERIFACTU_DELIVERY_NOTE_ID: string;
  let VERIFACTU_PENDING_INVOICE_ID: string;
  let VERIFACTU_UPLOADED_INVOICE_ID: string;
  let VERIFACTU_WORKSPACE_ID: string;
  let seedVerifactuSmokeScenario: typeof import('../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-verifactu-service-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    savedProductionFlag = process.env.VERIFACTU_PRODUCTION_ENABLED;
    delete process.env.VERIFACTU_PRODUCTION_ENABLED;

    const fixtureMod = await import('../test/verifactuSmokeFixture.js');
    VERIFACTU_ACCEPTED_INVOICE_ID = fixtureMod.VERIFACTU_ACCEPTED_INVOICE_ID;
    VERIFACTU_DELIVERY_NOTE_ID = fixtureMod.VERIFACTU_DELIVERY_NOTE_ID;
    VERIFACTU_PENDING_INVOICE_ID = fixtureMod.VERIFACTU_PENDING_INVOICE_ID;
    VERIFACTU_UPLOADED_INVOICE_ID = fixtureMod.VERIFACTU_UPLOADED_INVOICE_ID;
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    seedVerifactuSmokeScenario = fixtureMod.seedVerifactuSmokeScenario;
    verifactuSandboxScenario = fixtureMod.verifactuSandboxScenario;

    const dbMod = await import('../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;

    const serviceMod = await import('./verifactu.js');
    submitDocumentToVerifactu = serviceMod.submitDocumentToVerifactu;
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

  it('sandbox devuelve aceptado con metadatos y PDF regenerado', async () => {
    const result = await submitDocumentToVerifactu(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_PENDING_INVOICE_ID,
    );

    assert.equal(result.document.verifactuStatus, 'aceptado');
    assert.equal(result.document.status, 'sent');
    assert.ok(result.document.verifactuSubmittedAt);
    assert.ok(result.document.verifactuHash);
    assert.ok(result.document.verifactuCsv);
    assert.ok(result.document.verifactuQrUrl);
    assert.ok(result.document.verifactuQrDataUrl?.startsWith('data:image/png'));
    assert.ok(result.document.pdfKey);
    assert.ok(result.document.pdfGeneratedAt);
    assert.equal(result.settings.verifactuLastRecordHash, result.document.verifactuHash);
  });

  it('production devuelve rechazado con PROD_NOT_CONFIGURED', async () => {
    const { updateDoc } = await import('../db/repository.js');
    const { DB_NAMES } = await import('../config.js');

    await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      VERIFACTU_WORKSPACE_ID,
      { verifactuEnvironment: 'production' },
    );

    const result = await submitDocumentToVerifactu(
      VERIFACTU_WORKSPACE_ID,
      VERIFACTU_PENDING_INVOICE_ID,
    );

    assert.equal(result.document.verifactuStatus, 'rechazado');
    assert.equal(result.document.verifactuErrorCode, VERIFACTU_PROD_NOT_CONFIGURED_CODE);
    assert.ok(result.document.verifactuErrorMessage);
    assert.equal(result.document.status, 'draft');
    assert.ok(result.document.verifactuHash);
    assert.ok(result.document.verifactuCsv);
  });

  it('documento no invoice no se puede enviar', async () => {
    await assert.rejects(
      () => submitDocumentToVerifactu(VERIFACTU_WORKSPACE_ID, VERIFACTU_DELIVERY_NOTE_ID),
      /Solo las facturas pueden enviarse/,
    );
  });

  it('factura subida manualmente (sin PDF generado por la app) no se puede enviar', async () => {
    await assert.rejects(
      () => submitDocumentToVerifactu(VERIFACTU_WORKSPACE_ID, VERIFACTU_UPLOADED_INVOICE_ID),
      /subido manualmente/,
    );
  });

  it('factura aceptada queda bloqueada para reenvio', async () => {
    assert.equal(
      isVerifactuLocked({ verifactuStatus: 'aceptado' }),
      true,
    );

    await assert.rejects(
      () => submitDocumentToVerifactu(VERIFACTU_WORKSPACE_ID, VERIFACTU_ACCEPTED_INVOICE_ID),
      /pendiente o rechazado/,
    );
  });
});
