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
  workspaceId?: string;
};

const TEST_USER: TestUser = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Contract Test',
  email: 'contract@test.local',
};

const WORKSPACE_A = '30000000-0000-4000-8000-000000000001';
const WORKSPACE_B = '30000000-0000-4000-8000-000000000002';

describe('JsonFileStore contract', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let store: DataStore;
  let usersCollection: string;
  let clientsCollection: string;
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
    clientsCollection = configMod.DB_NAMES.clients;
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

  it('listAllInWorkspace filtra por workspaceId', async () => {
    const clientA = {
      id: '40000000-0000-4000-8000-000000000001',
      workspaceId: WORKSPACE_A,
      groupId: 'g1',
      name: 'A',
      email: 'a@test.local',
      phone: '',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      state: '',
      website: '',
      technicalInfo: '',
      observations: [],
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const clientB = { ...clientA, id: '40000000-0000-4000-8000-000000000002', workspaceId: WORKSPACE_B };

    await store.insertDoc(clientsCollection, clientA);
    await store.insertDoc(clientsCollection, clientB);

    const inA = await store.listAllInWorkspace(clientsCollection, WORKSPACE_A);
    assert.equal(inA.length, 1);
    assert.equal(inA[0]?.id, clientA.id);
  });

  it('findByFieldInWorkspace filtra campo y workspace', async () => {
    const client = {
      id: '50000000-0000-4000-8000-000000000001',
      workspaceId: WORKSPACE_A,
      groupId: 'group-target',
      name: 'Target',
      email: 'target@test.local',
      phone: '',
      address: '',
      city: '',
      postalCode: '',
      country: '',
      state: '',
      website: '',
      technicalInfo: '',
      observations: [],
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    await store.insertDoc(clientsCollection, client);

    const matches = await store.findByFieldInWorkspace(
      clientsCollection,
      'groupId',
      'group-target',
      WORKSPACE_A,
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.id, client.id);

    const otherWorkspace = await store.findByFieldInWorkspace(
      clientsCollection,
      'groupId',
      'group-target',
      WORKSPACE_B,
    );
    assert.equal(otherWorkspace.length, 0);
  });
});
