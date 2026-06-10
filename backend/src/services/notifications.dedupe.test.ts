import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Notification } from '@shared/types';
import { notificationDedupeIdentity } from '@shared/types';

const WORKSPACE_ID = 'a0000001-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000099';
const ACTOR = { id: '10000000-0000-4000-8000-000000000001', name: 'Admin' };

describe('notifications dedupe', { concurrency: false }, () => {
  let tempDir: string;
  let dbPath: string;
  let resetDb: () => void;
  let initDb: () => Promise<void>;
  let insertDoc: typeof import('../db/repository.js').insertDoc;
  let DB_NAMES: typeof import('../config.js').DB_NAMES;
  let emitNotifications: typeof import('./notifications.js').emitNotifications;
  let listNotificationsForUser: typeof import('./notifications.js').listNotificationsForUser;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-notifications-dedupe-'));
    dbPath = path.join(tempDir, 'db.json');
    process.env.DB_PATH = dbPath;

    const configMod = await import('../config.js');
    const dbMod = await import('../db/store.js');
    const repoMod = await import('../db/repository.js');
    const notificationsMod = await import('./notifications.js');

    DB_NAMES = configMod.DB_NAMES;
    insertDoc = repoMod.insertDoc;
    resetDb = dbMod.resetDbInstanceForTests;
    initDb = dbMod.initJsonDb;
    emitNotifications = notificationsMod.emitNotifications;
    listNotificationsForUser = notificationsMod.listNotificationsForUser;
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

  it('notificationDedupeIdentity usa entity cuando no hay dedupeKey', () => {
    const identity = notificationDedupeIdentity({
      action: 'activity.updated',
      entityType: 'activity',
      entityId: 'act-1',
      href: '/activities/act-1',
    });
    assert.equal(identity, 'activity.updated:activity:act-1');
  });

  it('emitNotifications hace upsert en lugar de duplicar', async () => {
    await emitNotifications({
      workspaceId: WORKSPACE_ID,
      action: 'activity.updated',
      actor: ACTOR,
      recipientUserIds: [USER_ID],
      title: 'Actividad actualizada',
      message: 'Cliente � primera',
      href: '/activities/act-1',
      entityType: 'activity',
      entityId: 'act-1',
      broadcast: false,
    });

    await emitNotifications({
      workspaceId: WORKSPACE_ID,
      action: 'activity.updated',
      actor: ACTOR,
      recipientUserIds: [USER_ID],
      title: 'Actividad actualizada',
      message: 'Cliente � segunda',
      href: '/activities/act-1',
      entityType: 'activity',
      entityId: 'act-1',
      broadcast: false,
    });

    const items = await listNotificationsForUser(WORKSPACE_ID, USER_ID);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.message, 'Cliente � segunda');
    assert.equal(items[0]?.dedupeKey, 'activity.updated:act-1');
  });

  it('listNotificationsForUser elimina duplicados legacy sin dedupeKey', async () => {
    const base = {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      category: 'activity' as const,
      action: 'activity.updated' as const,
      title: 'Actividad actualizada',
      message: 'Duplicado',
      href: '/activities/legacy-act',
      entityType: 'activity',
      entityId: 'legacy-act',
      actorUserId: ACTOR.id,
      actorUserName: ACTOR.name,
    };

    await insertDoc<Notification>(DB_NAMES.notifications, {
      ...base,
      id: '11111111-1111-4111-8111-111111111111',
      createdAt: '2026-06-01T10:00:00.000Z',
    });
    await insertDoc<Notification>(DB_NAMES.notifications, {
      ...base,
      id: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-06-02T10:00:00.000Z',
    });

    const items = await listNotificationsForUser(WORKSPACE_ID, USER_ID);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, '22222222-2222-4222-8222-222222222222');
  });
});
