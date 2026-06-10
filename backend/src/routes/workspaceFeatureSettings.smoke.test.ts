import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Document, WorkspaceBillingSettings, WorkspaceFeatureSettings } from '@shared/types';
import {
  VERIFACTU_ADMIN_ID,
  VERIFACTU_OPERATOR_ID,
  VERIFACTU_PENDING_INVOICE_ID,
  VERIFACTU_WORKSPACE_ID,
  seedWorkspaceFeatureToggleScenario,
} from '../test/workspaceFeatureSettingsSmokeFixture.js';

describe('workspace-feature-settings Veri*Factu toggle smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let adminToken: string;
  let operatorToken: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-feature-toggle-smoke-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');
    delete process.env.VERIFACTU_PRODUCTION_ENABLED;

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
      name: 'Toggle Admin',
      email: 'toggle-admin@test.local',
      role: 'admin',
    });
    operatorToken = signToken({
      id: VERIFACTU_OPERATOR_ID,
      name: 'Toggle Operario',
      email: 'toggle-op@test.local',
      role: 'user',
    });
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
    await seedWorkspaceFeatureToggleScenario({ billingVerifactuEnabled: false, withInvoice: true });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function getFeatureSettings(
    token: string,
  ): Promise<{ status: number; body: WorkspaceFeatureSettings & { error?: string } }> {
    const response = await fetch(`${baseUrl}/api/workspace-feature-settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': VERIFACTU_WORKSPACE_ID,
      },
    });
    const body = (await response.json()) as WorkspaceFeatureSettings & { error?: string };
    return { status: response.status, body };
  }

  async function putFeatureSettings(
    token: string,
    patch: Partial<WorkspaceFeatureSettings>,
  ): Promise<{ status: number; body: WorkspaceFeatureSettings & { error?: string } }> {
    const response = await fetch(`${baseUrl}/api/workspace-feature-settings`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': VERIFACTU_WORKSPACE_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });
    const body = (await response.json()) as WorkspaceFeatureSettings & { error?: string };
    return { status: response.status, body };
  }

  async function getBillingSettings(
    token: string,
  ): Promise<{ status: number; body: WorkspaceBillingSettings & { error?: string } }> {
    const response = await fetch(`${baseUrl}/api/workspace-billing-settings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-workspace-id': VERIFACTU_WORKSPACE_ID,
      },
    });
    const body = (await response.json()) as WorkspaceBillingSettings & { error?: string };
    return { status: response.status, body };
  }

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

  it('GET devuelve verifactuEnabled false por defecto', async () => {
    const { status, body } = await getFeatureSettings(adminToken);
    assert.equal(status, 200);
    assert.equal(body.verifactuEnabled, false);
  });

  it('PUT activa verifactuEnabled, persiste feature settings y sincroniza billing', async () => {
    const put = await putFeatureSettings(adminToken, { verifactuEnabled: true });
    assert.ok(put.status === 201 || put.status === 200, put.body.error ?? JSON.stringify(put.body));
    assert.equal(put.body.verifactuEnabled, true);

    const feature = await getFeatureSettings(adminToken);
    assert.equal(feature.body.verifactuEnabled, true);

    const billing = await getBillingSettings(adminToken);
    assert.equal(billing.body.verifactuEnabled, true);
  });

  it('operario no puede actualizar funcionalidades', async () => {
    const { status } = await putFeatureSettings(operatorToken, { verifactuEnabled: true });
    assert.equal(status, 403);
  });

  it('con toggle desactivado el envio Veri*Factu falla', async () => {
    const { status, body } = await submitVerifactu(adminToken, VERIFACTU_PENDING_INVOICE_ID);
    assert.equal(status, 400);
    assert.match(body.error ?? '', /no esta activado/i);
  });

  it('activar toggle habilita envio sandbox y desactivar lo bloquea de nuevo', async () => {
    const enable = await putFeatureSettings(adminToken, { verifactuEnabled: true });
    assert.ok(enable.status === 201 || enable.status === 200);

    const accepted = await submitVerifactu(adminToken, VERIFACTU_PENDING_INVOICE_ID);
    assert.equal(accepted.status, 200, accepted.body.error ?? JSON.stringify(accepted.body));
    assert.equal(accepted.body.verifactuStatus, 'aceptado');

    const disable = await putFeatureSettings(adminToken, { verifactuEnabled: false });
    assert.equal(disable.status, 200);
    assert.equal(disable.body.verifactuEnabled, false);

    const billing = await getBillingSettings(adminToken);
    assert.equal(billing.body.verifactuEnabled, false);

    const { updateDoc } = await import('../db/repository.js');
    const { DB_NAMES } = await import('../config.js');
    await updateDoc<Document>(DB_NAMES.documents, VERIFACTU_PENDING_INVOICE_ID, {
      verifactuStatus: 'pendiente',
      verifactuSubmittedAt: undefined,
      verifactuHash: undefined,
      verifactuCsv: undefined,
      verifactuQrUrl: undefined,
      verifactuQrDataUrl: undefined,
      status: 'draft',
    });

    const blocked = await submitVerifactu(adminToken, VERIFACTU_PENDING_INVOICE_ID);
    assert.equal(blocked.status, 400);
    assert.match(blocked.body.error ?? '', /no esta activado/i);
  });
});
