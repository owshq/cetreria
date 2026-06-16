import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';

const ADMIN_USER_ID = 'b1000001-0000-4000-8000-000000000001';

describe('GET /api/ws/notifications HTTP fallback smoke', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let server: http.Server;
  let baseUrl: string;
  let resetDb: () => void;
  let adminToken: string;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-ws-notifications-smoke-'));
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

  it('sin auth responde 401 controlado (no 404)', async () => {
    const response = await fetch(`${baseUrl}/api/ws/notifications`);
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: string };
    assert.equal(body.error, 'No autenticado');
  });

  it('con auth responde 200 con inbox estable', async () => {
    const response = await fetch(
      `${baseUrl}/api/ws/notifications?token=${encodeURIComponent(adminToken)}&workspaceId=${encodeURIComponent(DEFAULT_WORKSPACE_ID)}`,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      transport: string;
      notifications: unknown[];
      unreadCount: number;
    };
    assert.equal(body.transport, 'http');
    assert.ok(Array.isArray(body.notifications));
    assert.equal(typeof body.unreadCount, 'number');
  });

  it('acepta Authorization Bearer y X-Workspace-Id', async () => {
    const response = await fetch(`${baseUrl}/api/ws/notifications`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'X-Workspace-Id': DEFAULT_WORKSPACE_ID,
      },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { transport: string };
    assert.equal(body.transport, 'http');
  });
});
