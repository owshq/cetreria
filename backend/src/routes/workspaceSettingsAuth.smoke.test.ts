import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';

const ADMIN_USER_ID = 'b1000001-0000-4000-8000-000000000001';

const PRIVATE_SETTINGS_ROUTES = [
  '/api/workspace-feature-settings',
  '/api/workspace-schedule-settings',
] as const;

describe('workspace settings auth smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let adminToken: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-workspace-settings-auth-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;
    process.env.DOCUMENT_STORAGE_DIR = path.join(tempDir, 'document-pdfs');

    const dbMod = await import('../db/store.js');
    resetDb = dbMod.resetDbInstanceForTests;

    const { signToken } = await import('../middleware/auth.js');
    const { createApp } = await import('../app.js');

    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    adminToken = signToken({
      id: ADMIN_USER_ID,
      name: 'Administrador',
      email: 'admin@faunayhalconeros.com',
      role: 'admin',
    });
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const { bootstrapDb } = await import('../db/bootstrapDb.js');
    await bootstrapDb();
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  for (const route of PRIVATE_SETTINGS_ROUTES) {
    it(`${route} responde 401 sin sesion`, async () => {
      const response = await fetch(`${baseUrl}${route}`);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error: string };
      assert.equal(body.error, 'No autenticado');
    });

    it(`${route} responde 200 con sesion y workspace`, async () => {
      const response = await fetch(`${baseUrl}${route}`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'X-Workspace-Id': DEFAULT_WORKSPACE_ID,
        },
      });
      assert.equal(response.status, 200);
      const body = (await response.json()) as { workspaceId: string };
      assert.equal(body.workspaceId, DEFAULT_WORKSPACE_ID);
    });
  }
});
