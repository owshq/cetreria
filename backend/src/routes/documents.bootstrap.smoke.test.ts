import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { DocumentsBootstrapResponse } from '../services/documentsBootstrap.js';

type BootstrapPayload = DocumentsBootstrapResponse;

describe('GET /api/documents/bootstrap smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let adminToken: string;
  let operatorToken: string;
  let seedDocumentsBootstrapSmokeScenario: typeof import('../test/documentsBootstrapSmokeFixture.js').seedDocumentsBootstrapSmokeScenario;
  let smokeBootstrapAdminScenario: typeof import('../test/documentsBootstrapSmokeFixture.js').smokeBootstrapAdminScenario;
  let smokeDocument: typeof import('../test/documentsBootstrapSmokeFixture.js').smokeDocument;
  let smokeInvoiceGroup: typeof import('../test/documentsBootstrapSmokeFixture.js').smokeInvoiceGroup;
  let smokePrivateDeliveryGroup: typeof import('../test/documentsBootstrapSmokeFixture.js').smokePrivateDeliveryGroup;
  let smokePublicDeliveryGroup: typeof import('../test/documentsBootstrapSmokeFixture.js').smokePublicDeliveryGroup;
  let SMOKE_ADMIN_ID: string;
  let SMOKE_OPERATOR_ID: string;
  let SMOKE_WORKSPACE_ID: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-bootstrap-smoke-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;

    const fixtureMod = await import('../test/documentsBootstrapSmokeFixture.js');
    seedDocumentsBootstrapSmokeScenario = fixtureMod.seedDocumentsBootstrapSmokeScenario;
    smokeBootstrapAdminScenario = fixtureMod.smokeBootstrapAdminScenario;
    smokeDocument = fixtureMod.smokeDocument;
    smokeInvoiceGroup = fixtureMod.smokeInvoiceGroup;
    smokePrivateDeliveryGroup = fixtureMod.smokePrivateDeliveryGroup;
    smokePublicDeliveryGroup = fixtureMod.smokePublicDeliveryGroup;
    SMOKE_ADMIN_ID = fixtureMod.SMOKE_ADMIN_ID;
    SMOKE_OPERATOR_ID = fixtureMod.SMOKE_OPERATOR_ID;
    SMOKE_WORKSPACE_ID = fixtureMod.SMOKE_WORKSPACE_ID;

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
      id: SMOKE_ADMIN_ID,
      name: 'Smoke Admin',
      email: 'smoke-admin@test.local',
      role: 'admin',
    });
    operatorToken = signToken({
      id: SMOKE_OPERATOR_ID,
      name: 'Smoke Operario',
      email: 'smoke-op@test.local',
      role: 'user',
    });
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedDocumentsBootstrapSmokeScenario(smokeBootstrapAdminScenario);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function fetchBootstrap(token: string): Promise<{ status: number; body: BootstrapPayload }> {
    const response = await fetch(`${baseUrl}/api/documents/bootstrap`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': SMOKE_WORKSPACE_ID,
      },
    });
    const body = (await response.json()) as BootstrapPayload;
    return { status: response.status, body };
  }

  it('admin recibe facturas, albaranes y clientes', async () => {
    const { status, body } = await fetchBootstrap(adminToken);

    assert.equal(status, 200);
    assert.deepEqual(body.documents.map((item) => item.id).sort(), [
      'f600000a-0000-4000-8000-000000000001',
      'f600000a-0000-4000-8000-000000000002',
      'f600000a-0000-4000-8000-000000000003',
      'f600000a-0000-4000-8000-000000000004',
    ]);
    assert.deepEqual(body.clients.map((item) => item.id).sort(), [
      'f6000005-0000-4000-8000-000000000001',
      'f6000005-0000-4000-8000-000000000002',
    ]);
    assert.equal(body.documentTypeGroups.length, 3);
    assert.equal(body.activities.length, 2);
  });

  it('operario no recibe facturas', async () => {
    const { status, body } = await fetchBootstrap(operatorToken);

    assert.equal(status, 200);
    assert.ok(body.documents.every((item) => item.type !== 'invoice'));
    assert.ok(!body.documentTypeGroups.some((group) => group.documentType === 'invoice'));
  });

  it('operario recibe albaranes publicos', async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedDocumentsBootstrapSmokeScenario({
      documentTypeGroups: [smokePublicDeliveryGroup, smokeInvoiceGroup],
      documents: [
        smokeDocument({
          id: 'f600000a-0000-4000-8000-000000000010',
          type: 'delivery-note',
          activityId: undefined,
        }),
      ],
    });

    const { status, body } = await fetchBootstrap(operatorToken);

    assert.equal(status, 200);
    assert.deepEqual(body.documents.map((item) => item.id), [
      'f600000a-0000-4000-8000-000000000010',
    ]);
  });

  it('operario solo recibe contactos vinculados a actividades asignadas', async () => {
    const { status, body } = await fetchBootstrap(operatorToken);

    assert.equal(status, 200);
    assert.deepEqual(body.clients.map((item) => item.id), [
      'f6000005-0000-4000-8000-000000000001',
    ]);
    assert.equal(body.activities.length, 1);
    assert.equal(body.activities[0]?.id, 'f6000007-0000-4000-8000-000000000001');
  });

  it('operario recibe albaranes privados solo por actividad asignada', async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedDocumentsBootstrapSmokeScenario({
      documentTypeGroups: [smokePrivateDeliveryGroup, smokeInvoiceGroup],
      documents: [
        smokeDocument({ id: 'f600000a-0000-4000-8000-000000000020', type: 'delivery-note' }),
        smokeDocument({
          id: 'f600000a-0000-4000-8000-000000000021',
          type: 'delivery-note',
          activityId: 'f6000007-0000-4000-8000-000000000002',
        }),
      ],
    });

    const { status, body } = await fetchBootstrap(operatorToken);

    assert.equal(status, 200);
    assert.deepEqual(body.documents.map((item) => item.id), [
      'f600000a-0000-4000-8000-000000000020',
    ]);
  });
});
