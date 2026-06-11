import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { ElectronicInvoicingProviderHealth } from '@shared/types';

describe('GET /api/electronic-invoicing/providers/es_verifactu/health smoke', {
  concurrency: false,
}, () => {
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
  let seedVerifactuSmokeScenario: typeof import('../test/verifactuSmokeFixture.js').seedVerifactuSmokeScenario;
  let verifactuSandboxScenario: typeof import('../test/verifactuSmokeFixture.js').verifactuSandboxScenario;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-einv-health-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    process.env.VERIFACTU_MODULE_ENABLED = 'true';
    delete process.env.VERIFACTU_CERT_PATH;

    const fixtureMod = await import('../test/verifactuSmokeFixture.js');
    VERIFACTU_WORKSPACE_ID = fixtureMod.VERIFACTU_WORKSPACE_ID;
    VERIFACTU_ADMIN_ID = fixtureMod.VERIFACTU_ADMIN_ID;
    VERIFACTU_OPERATOR_ID = fixtureMod.VERIFACTU_OPERATOR_ID;
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
    delete process.env.VERIFACTU_MODULE_ENABLED;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function fetchHealth(token: string): Promise<{
    status: number;
    body: ElectronicInvoicingProviderHealth & { error?: string };
  }> {
    const response = await fetch(
      `${baseUrl}/api/electronic-invoicing/providers/es_verifactu/health`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-workspace-id': VERIFACTU_WORKSPACE_ID,
        },
      },
    );
    const body = (await response.json()) as ElectronicInvoicingProviderHealth & { error?: string };
    return { status: response.status, body };
  }

  it('admin recibe health con certificateStatus missing y productionReady false', async () => {
    const { status, body } = await fetchHealth(adminToken);

    assert.equal(status, 200, body.error ?? JSON.stringify(body));
    assert.equal(body.providerId, 'es_verifactu');
    assert.equal(body.country, 'ES');
    assert.equal(body.authority, 'AEAT');
    assert.equal(body.mode, 'sandbox');
    assert.equal(body.certificateStatus, 'missing');
    assert.equal(body.productionReady, false);
  });

  it('operario no puede leer health del provider', async () => {
    const { status, body } = await fetchHealth(operatorToken);

    assert.equal(status, 403);
    assert.equal(body.error, 'Permiso denegado');
  });
});
