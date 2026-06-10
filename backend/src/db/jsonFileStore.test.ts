import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { DataStore } from './dataStore.js';

type TestUser = {
  id: string;
  name: string;
  email: string;
};

const TEST_USER: TestUser = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Contract Test',
  email: 'contract@test.local',
};

describe('JsonFileStore contract', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let store: DataStore;
  let usersCollection: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-datastore-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;

    const configMod = await import('../config.js');
    const storeMod = await import('./jsonFileStore.js');
    const dbMod = await import('./store.js');

    usersCollection = configMod.DB_NAMES.users;
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

  it('insertDoc + getById + listAll', async () => {
    assert.equal(await store.countDocs(usersCollection), 0);

    await store.insertDoc(usersCollection, TEST_USER);

    assert.equal(await store.countDocs(usersCollection), 1);
    const loaded = await store.getById<TestUser>(usersCollection, TEST_USER.id);
    assert.deepEqual(loaded, TEST_USER);

    const all = await store.listAll<TestUser>(usersCollection);
    assert.equal(all.length, 1);
    assert.equal(all[0]?.email, TEST_USER.email);
  });

  it('updateDoc aplica parches parciales', async () => {
    await store.insertDoc(usersCollection, TEST_USER);

    const updated = await store.updateDoc<TestUser>(usersCollection, TEST_USER.id, {
      name: 'Updated Name',
    });
    assert.ok(updated);
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.email, TEST_USER.email);

    const loaded = await store.getById<TestUser>(usersCollection, TEST_USER.id);
    assert.equal(loaded?.name, 'Updated Name');
  });

  it('deleteDoc elimina el documento', async () => {
    await store.insertDoc(usersCollection, TEST_USER);

    assert.equal(await store.deleteDoc(usersCollection, TEST_USER.id), true);
    assert.equal(await store.getById(usersCollection, TEST_USER.id), null);
    assert.equal(await store.countDocs(usersCollection), 0);
    assert.equal(await store.deleteDoc(usersCollection, TEST_USER.id), false);
  });

  it('withTransaction persiste varias inserciones en un solo write', async () => {
    const userA: TestUser = {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'User A',
      email: 'a@test.local',
    };
    const userB: TestUser = {
      id: '20000000-0000-4000-8000-000000000002',
      name: 'User B',
      email: 'b@test.local',
    };

    await store.withTransaction(async (tx) => {
      await tx.insertDoc(usersCollection, userA);
      await tx.insertDoc(usersCollection, userB);
      return null;
    });

    assert.equal(await store.countDocs(usersCollection), 2);
    assert.ok(await store.getById(usersCollection, userA.id));
    assert.ok(await store.getById(usersCollection, userB.id));
  });
});
