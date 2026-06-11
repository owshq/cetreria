import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { DB_NAMES } from '../config.js';
import { auditLowdbData, exportLowdbReadOnly } from './exportLowdb.js';

describe('exportLowdbReadOnly', () => {
  let tempDir: string;
  let sourcePath: string;

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('genera manifest, checksum y no modifica input', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-export-test-'));
    sourcePath = path.join(tempDir, 'db.json');

    const fixture = {
      [DB_NAMES.clients]: [{ id: 'client-1', workspaceId: 'ws-1', name: 'A' }],
      [DB_NAMES.activities]: [{ id: 'act-1', workspaceId: 'ws-1', clientId: 'client-1' }],
      [DB_NAMES.documents]: [],
      [DB_NAMES.events]: [],
      [DB_NAMES.reports]: [],
      [DB_NAMES.users]: [],
    };

    fs.writeFileSync(sourcePath, JSON.stringify(fixture), 'utf8');
    const before = fs.readFileSync(sourcePath, 'utf8');
    const statBefore = fs.statSync(sourcePath);

    const result = exportLowdbReadOnly({
      sourcePath,
      exportRootDir: path.join(tempDir, 'out'),
      appVersion: 'test',
      exportedAt: '2026-06-12T12:00:00.000Z',
    });

    assert.ok(fs.existsSync(result.manifestPath));
    assert.ok(fs.existsSync(result.collectionsSummaryPath));
    assert.ok(fs.existsSync(result.copiedDbPath));
    assert.equal(result.checksumSha256.length, 64);

    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8')) as {
      checksumSha256: string;
      appVersion: string;
    };
    assert.equal(manifest.checksumSha256, result.checksumSha256);
    assert.equal(manifest.appVersion, 'test');

    const summary = JSON.parse(fs.readFileSync(result.collectionsSummaryPath, 'utf8')) as {
      collections: Record<string, { count: number }>;
    };
    assert.equal(summary.collections[DB_NAMES.clients]?.count, 1);

    assert.equal(fs.readFileSync(sourcePath, 'utf8'), before);
    assert.equal(fs.statSync(sourcePath).mtimeMs, statBefore.mtimeMs);
  });

  it('detecta ids duplicados y missing id', () => {
    const data = {
      [DB_NAMES.users]: [
        { id: 'u1', name: 'A' },
        { id: 'u1', name: 'B' },
        { name: 'Sin id' },
      ],
    };

    const audit = auditLowdbData(data);
    assert.deepEqual(audit.collections[DB_NAMES.users]?.duplicateIds, ['u1']);
    assert.equal(audit.collections[DB_NAMES.users]?.missingIdCount, 1);
  });

  it('detecta referencias rotas basicas', () => {
    const data = {
      [DB_NAMES.clients]: [{ id: 'client-1' }],
      [DB_NAMES.activities]: [{ id: 'act-1', clientId: 'missing-client' }],
      [DB_NAMES.documents]: [{ id: 'doc-1', clientId: 'client-1', activityId: 'missing-act' }],
      [DB_NAMES.events]: [{ id: 'ev-1', activityId: 'missing-act' }],
      [DB_NAMES.reports]: [
        { id: 'rep-1', clientId: 'missing-client', workerUserId: 'missing-user' },
      ],
      [DB_NAMES.users]: [],
    };

    const audit = auditLowdbData(data);
    const fields = audit.brokenReferences.map((item) => `${item.collection}.${item.field}`);
    assert.ok(fields.includes(`${DB_NAMES.activities}.clientId`));
    assert.ok(fields.includes(`${DB_NAMES.documents}.activityId`));
    assert.ok(fields.includes(`${DB_NAMES.events}.activityId`));
    assert.ok(fields.includes(`${DB_NAMES.reports}.clientId`));
    assert.ok(fields.includes(`${DB_NAMES.reports}.workerUserId`));
  });
});
