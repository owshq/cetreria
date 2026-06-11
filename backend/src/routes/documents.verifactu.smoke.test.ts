import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Document, WorkspaceBillingSettings } from '@shared/types';
import { VERIFACTU_PROD_NOT_CONFIGURED_CODE } from '@shared/types';

describe('POST /api/documents/:id/verifactu/submit smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let adminToken: string;
  let operatorToken: string;
  let savedProductionFlag: string | undefined;
  let VERIFACTU_WORKSPACE_ID: string;
  let VERIFACTU_ADMIN_ID: string;
  let VERIFACTU_OPERATOR_ID: string;
  let VERIFACTU_PENDING_INVOICE_ID: string;
  let VERIFACTU_ACCEPTED_INVOICE_ID: string;
  let seedVerifactuSmokeScenario: typeof import('../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-verifactu-smoke-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    process.env.VERIFACTU_MODULE_ENABLED = 'true';
    savedProductionFlag = process.env.VERIFACTU_PRODUCTION_ENABLED;
    delete process.env.VERIFACTU_PRODUCTION_ENABLED;

    const fixtureMod = await import('../test/verifactuSmokeFixture.js');
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    VERIFACTU_ADMIN_ID = fixtureMod.VERIFACTU_ADMIN_ID;
    VERIFACTU_OPERATOR_ID = fixtureMod.VERIFACTU_OPERATOR_ID;
    VERIFACTU_PENDING_INVOICE_ID = fixtureMod.VERIFACTU_PENDING_INVOICE_ID;
    VERIFACTU_ACCEPTED_INVOICE_ID = fixtureMod.VERIFACTU_ACCEPTED_INVOICE_ID;
    seedVerifactuSmokeScenario = fixtureMod.seedVerifactuSmokeScenario;
    verifactuSandboxScenario = fixtureMod.verifactuSandboxScenario;

    const dbMod = await import('../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;

    const { signToken } = await import('../middleware/auth.js');
    const { createApp } = await import('../app.js');

    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    adminToken = signToken({
      id: VERIFACTU_ADMIN_ID,
      name: 'Verifactu Admin',
      email: 'verifactu-admin@test.local',
      role: 'admin',
    });
    operatorToken = signToken({
      id: VERIFACTU_OPERATOR_ID,
      name: 'Verifactu Operario',
      email: 'verifactu-op@test.local',
      role: 'user',
    });
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedVerifactuSmokeScenario(verifactuSandboxScenario);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    resetDb();
    if (savedProductionFlag === undefined) {
      delete process.env.VERIFACTU_PRODUCTION_ENABLED;
    } else {
      process.env.VERIFACTU_PRODUCTION_ENABLED = savedProductionFlag;
    }
    delete process.env.VERIFACTU_MODULE_ENABLED;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function submitVerifactu(
    token: string,
    documentId: string,
  ): Promise<{ status: number; body: Document & { error?: string } }> {
    const response = await fetch(
      `${baseUrl}/api/documents/${documentId}/verifactu/submit`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-workspace-id': VERIFACTU_WORKSPACE_ID,
        },
      },
    );
    const body = (await response.json()) as Document & { error?: string };
    return { status: response.status, body };
  }

  it('admin puede enviar factura pendiente en sandbox', async () => {
    const { status, body } = await submitVerifactu(adminToken, VERIFACTU_PENDING_INVOICE_ID);

    assert.equal(status, 200, body.error ?? JSON.stringify(body));
    assert.equal(body.verifactuStatus, 'aceptado');
    assert.ok(body.verifactuCsv);
    assert.ok(body.verifactuHash);
    assert.ok(body.verifactuQrUrl);
    assert.ok(body.verifactuQrDataUrl);
    assert.ok(body.pdfKey);
  });

  it('operario no puede enviar', async () => {
    const { status, body } = await submitVerifactu(operatorToken, VERIFACTU_PENDING_INVOICE_ID);

    assert.equal(status, 403);
    assert.equal(body.error, 'Permiso denegado');
  });

  it('production devuelve rechazo controlado PROD_NOT_CONFIGURED', async () => {
    const { updateDoc } = await import('../db/repository.js');
    const { DB_NAMES } = await import('../config.js');

    await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      VERIFACTU_WORKSPACE_ID,
      { verifactuEnvironment: 'production' },
    );

    const { status, body } = await submitVerifactu(adminToken, VERIFACTU_PENDING_INVOICE_ID);

    assert.equal(status, 200, body.error ?? JSON.stringify(body));
    assert.equal(body.verifactuStatus, 'rechazado');
    assert.equal(body.verifactuErrorCode, VERIFACTU_PROD_NOT_CONFIGURED_CODE);
    assert.ok(body.verifactuErrorMessage);
  });

  it('factura aceptada no puede editarse via PUT', async () => {
    const response = await fetch(`${baseUrl}/api/documents/${VERIFACTU_ACCEPTED_INVOICE_ID}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'x-workspace-id': VERIFACTU_WORKSPACE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'Intento de edicion' }),
    });
    const body = (await response.json()) as { error?: string };

    assert.equal(response.status, 400);
    assert.match(body.error ?? '', /aceptada o anulada/i);
  });
});
