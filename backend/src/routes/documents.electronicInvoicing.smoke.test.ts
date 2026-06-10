import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { ElectronicInvoicingGateResult } from '@shared/types';

describe('POST /api/documents/:id/electronic-invoicing/approve smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let adminToken: string;
  let operatorToken: string;
  let VERIFACTU_WORKSPACE_ID: string;
  let VERIFACTU_ADMIN_ID: string;
  let VERIFACTU_OPERATOR_ID: string;
  let VERIFACTU_PENDING_INVOICE_ID: string;
  let VERIFACTU_DELIVERY_NOTE_ID: string;
  let seedVerifactuSmokeScenario: typeof import('../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-einv-smoke-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');

    const fixtureMod = await import('../test/verifactuSmokeFixture.js');
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    VERIFACTU_ADMIN_ID = fixtureMod.VERIFACTU_ADMIN_ID;
    VERIFACTU_OPERATOR_ID = fixtureMod.VERIFACTU_OPERATOR_ID;
    VERIFACTU_PENDING_INVOICE_ID = fixtureMod.VERIFACTU_PENDING_INVOICE_ID;
    VERIFACTU_DELIVERY_NOTE_ID = fixtureMod.VERIFACTU_DELIVERY_NOTE_ID;
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function approveElectronicInvoicing(
    token: string,
    documentId: string,
  ): Promise<{ status: number; body: ElectronicInvoicingGateResult & { error?: string } }> {
    const response = await fetch(
      `${baseUrl}/api/documents/${documentId}/electronic-invoicing/approve`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-workspace-id': VERIFACTU_WORKSPACE_ID,
        },
      },
    );
    const body = (await response.json()) as ElectronicInvoicingGateResult & { error?: string };
    return { status: response.status, body };
  }

  it('admin aprueba factura pendiente via gate y recibe accepted', async () => {
    const { status, body } = await approveElectronicInvoicing(
      adminToken,
      VERIFACTU_PENDING_INVOICE_ID,
    );

    assert.equal(status, 200, body.error ?? JSON.stringify(body));
    assert.equal(body.outcome, 'accepted');
    assert.equal(body.providerId, 'es_verifactu');
    assert.equal(body.document.verifactuStatus, 'aceptado');
    assert.ok(body.document.pdfKey);
  });

  it('operario no puede aprobar via gate', async () => {
    const { status, body } = await approveElectronicInvoicing(
      operatorToken,
      VERIFACTU_PENDING_INVOICE_ID,
    );

    assert.equal(status, 403);
    assert.equal(body.error, 'Permiso denegado');
  });

  it('albaran devuelve not_required sin error HTTP', async () => {
    const { status, body } = await approveElectronicInvoicing(
      adminToken,
      VERIFACTU_DELIVERY_NOTE_ID,
    );

    assert.equal(status, 200);
    assert.equal(body.outcome, 'not_required');
    assert.equal(body.providerId, null);
  });
});
