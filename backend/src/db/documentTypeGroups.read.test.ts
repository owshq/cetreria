import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { DocumentTypeGroup } from '@shared/types';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import { readDocumentTypeGroupsForWorkspaceFromStore } from './documentTypeGroups.js';

describe('readDocumentTypeGroupsForWorkspaceFromStore', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let store: Awaited<ReturnType<typeof import('./jsonFileStore.js').createJsonFileStore>>;
  let documentTypeGroupsCollection: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-doc-type-groups-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;

    const configMod = await import('../config.js');
    const storeMod = await import('./jsonFileStore.js');
    const dbMod = await import('./store.js');

    documentTypeGroupsCollection = configMod.DB_NAMES.documentTypeGroups;
    store = storeMod.createJsonFileStore();
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;
  });

  beforeEach(async () => {
    resetDb();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    await initDb();
  });

  after(() => {
    resetDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lista grupos del workspace via DataStore y crea defaults si faltan', async () => {
    const groups = await readDocumentTypeGroupsForWorkspaceFromStore(
      DEFAULT_WORKSPACE_ID,
      store,
    );

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((group) => group.documentType).sort(),
      ['delivery-note', 'invoice'],
    );
    assert.ok(groups.every((group) => group.workspaceId === DEFAULT_WORKSPACE_ID));

    const persisted = await store.listAllInWorkspace<DocumentTypeGroup>(
      documentTypeGroupsCollection,
      DEFAULT_WORKSPACE_ID,
    );
    assert.equal(persisted.length, 2);
  });

  it('ordena facturas antes que albaranes', async () => {
    const groups = await readDocumentTypeGroupsForWorkspaceFromStore(
      DEFAULT_WORKSPACE_ID,
      store,
    );

    assert.equal(groups[0]?.documentType, 'invoice');
    assert.equal(groups[1]?.documentType, 'delivery-note');
  });
});
