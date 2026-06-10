import type { Activity, ActivityType, CalendarEvent, Client, Document, MonthlyReport, User } from '@shared/types';
import { DEFAULT_WORKSPACE_ID, documentPdfKey, legacyDocumentPdfKey } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';
import { addUserToWorkspace, ensureDefaultWorkspace, ensureUserWorkspaceMembership } from '../services/workspaces.js';
import { normalizeClientRecord } from '../services/clientRecords.js';
import { ensureDefaultClientGroup, backfillClientGroupIds } from './clientGroups.js';
import { ensureActivityTypesForWorkspace } from './activityTypes.js';

type WorkspaceScoped = { workspaceId?: string };

function backfillWorkspaceId<T extends WorkspaceScoped>(items: T[], workspaceId: string): T[] {
  return items.map((item) =>
    item.workspaceId ? item : { ...item, workspaceId },
  );
}

export async function migrateWorkspaces(): Promise<void> {
  const db = await refreshDbFromDisk();
  let changed = false;

  const workspace = await ensureDefaultWorkspace();
  const workspaceId = workspace.id;

  const users = db.data[DB_NAMES.users] as unknown as User[];
  for (const user of users) {
    await ensureUserWorkspaceMembership(user, workspaceId);
  }

  const allWorkspaces = db.data[DB_NAMES.workspaces] as { id: string }[];
  for (const ws of allWorkspaces) {
    await ensureActivityTypesForWorkspace(ws.id);
    const defaultGroup = await ensureDefaultClientGroup(ws.id);
    if (defaultGroup) {
      await backfillClientGroupIds(ws.id, defaultGroup.id);
    }
  }

  const collections: Array<(typeof DB_NAMES)[keyof typeof DB_NAMES]> = [
    DB_NAMES.clients,
    DB_NAMES.activities,
    DB_NAMES.events,
    DB_NAMES.documents,
    DB_NAMES.reports,
    DB_NAMES.activityTypes,
    DB_NAMES.clientGroups,
  ];

  for (const collection of collections) {
    const items = db.data[collection] as WorkspaceScoped[];
    const migrated = backfillWorkspaceId(items, workspaceId);
    if (JSON.stringify(migrated) !== JSON.stringify(items)) {
      db.data[collection] = migrated as typeof db.data[typeof collection];
      changed = true;
    }
  }

  const clients = db.data[DB_NAMES.clients] as unknown as Client[];
  const repairedClients = clients.map((client) => normalizeClientRecord(client, workspaceId));
  if (JSON.stringify(repairedClients) !== JSON.stringify(clients)) {
    db.data[DB_NAMES.clients] = repairedClients as unknown as typeof db.data[typeof DB_NAMES.clients];
    changed = true;
  }

  const documents = db.data[DB_NAMES.documents] as unknown as Document[];
  const migratedDocuments = documents.map((doc) => {
    if (!doc.workspaceId) return doc;
    const nextKey = documentPdfKey(doc);
    if (doc.pdfKey === nextKey) return doc;
    if (!doc.pdfKey || doc.pdfKey === legacyDocumentPdfKey(doc)) {
      changed = true;
      return { ...doc, pdfKey: nextKey };
    }
    return doc;
  });
  if (JSON.stringify(migratedDocuments) !== JSON.stringify(documents)) {
    db.data[DB_NAMES.documents] =
      migratedDocuments as unknown as typeof db.data[typeof DB_NAMES.documents];
    changed = true;
  }

  if (!db.data[DB_NAMES.workspaces].some((item) => item.id === DEFAULT_WORKSPACE_ID)) {
    db.data[DB_NAMES.workspaces] = [workspace as unknown as (typeof db.data)[typeof DB_NAMES.workspaces][number], ...db.data[DB_NAMES.workspaces]];
    changed = true;
  }

  if (changed) {
    await db.write();
    console.log('Datos migrados: workspaces y workspaceId aplicados.');
  }
}

export { addUserToWorkspace };
