import type { Client, ClientGroup, Workspace } from '@shared/types';
import { DEFAULT_CLIENT_GROUP_NAME } from '../../../shared/clientGroups.js';
import { DB_NAMES } from '../config.js';
import type { DataStore } from './dataStore.js';
import {
  getById,
  getByIdInWorkspace,
  insertDoc,
  listAll,
  listAllInWorkspace,
  updateDoc,
  deleteDoc,
  withDbTransaction,
} from './repository.js';

const LEGACY_DEFAULT_GROUP_NAMES = ['contacto', 'cliente', 'clientes'];

function sortGroups(groups: ClientGroup[]): ClientGroup[] {
  return [...groups].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });
}

function shouldNormalizeDefaultGroupName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return (
    normalized !== DEFAULT_CLIENT_GROUP_NAME.toLowerCase() &&
    LEGACY_DEFAULT_GROUP_NAMES.includes(normalized)
  );
}

async function markWorkspaceClientGroupSeeded(workspaceId: string): Promise<void> {
  const workspace = await getById<Workspace>(DB_NAMES.workspaces, workspaceId);
  if (!workspace || workspace.defaultClientGroupSeeded) return;
  await updateDoc<Workspace>(DB_NAMES.workspaces, workspaceId, { defaultClientGroupSeeded: true });
}

function findLegacyDefaultGroup(groups: ClientGroup[]): ClientGroup | undefined {
  return (
    groups.find((group) => group.isDefault) ??
    groups.find((group) => LEGACY_DEFAULT_GROUP_NAMES.includes(group.name.trim().toLowerCase()))
  );
}

async function normalizeLegacyDefaultGroup(group: ClientGroup): Promise<ClientGroup> {
  const updates: Partial<ClientGroup> = {};
  if (!group.isDefault) updates.isDefault = true;
  if (shouldNormalizeDefaultGroupName(group.name)) updates.name = DEFAULT_CLIENT_GROUP_NAME;
  if (Object.keys(updates).length === 0) return group;
  const updated = await updateDoc<ClientGroup>(DB_NAMES.clientGroups, group.id, updates);
  return updated ?? { ...group, ...updates };
}

/** Crea el grupo «Clientes» solo la primera vez por workspace (o normaliza legacy). */
export async function ensureDefaultClientGroup(workspaceId: string): Promise<ClientGroup | null> {
  const workspace = await getById<Workspace>(DB_NAMES.workspaces, workspaceId);
  if (!workspace) return null;

  const groups = await listAllInWorkspace<ClientGroup>(DB_NAMES.clientGroups, workspaceId);

  if (groups.length > 0) {
    await markWorkspaceClientGroupSeeded(workspaceId);
    const legacy = findLegacyDefaultGroup(groups);
    if (legacy) return normalizeLegacyDefaultGroup(legacy);
    return null;
  }

  const created: ClientGroup = {
    id: crypto.randomUUID(),
    workspaceId,
    name: DEFAULT_CLIENT_GROUP_NAME,
    isDefault: true,
    createdAt: new Date().toISOString(),
  };
  await insertDoc(DB_NAMES.clientGroups, created);
  await markWorkspaceClientGroupSeeded(workspaceId);
  return created;
}

export async function ensureDefaultClientGroups(): Promise<void> {
  const workspaces = await listAll<{ id: string }>(DB_NAMES.workspaces);
  for (const workspace of workspaces) {
    const defaultGroup = await ensureDefaultClientGroup(workspace.id);
    if (defaultGroup) {
      await backfillClientGroupIds(workspace.id, defaultGroup.id);
    }
  }
}

export async function backfillClientGroupIds(workspaceId: string, defaultGroupId: string): Promise<void> {
  if (!defaultGroupId) return;

  await withDbTransaction(async () => {
    const clients = await listAllInWorkspace<Client & { groupId?: string }>(
      DB_NAMES.clients,
      workspaceId,
    );

    for (const client of clients) {
      if (client.groupId) continue;
      await updateDoc<Client>(DB_NAMES.clients, client.id, { groupId: defaultGroupId });
    }
  });
}

export async function listClientGroupsForWorkspace(workspaceId: string): Promise<ClientGroup[]> {
  return loadClientGroupsForWorkspace(workspaceId, listAllInWorkspace);
}

/** P2b: lectura via DataStore (piloto GET /api/client-groups). */
export async function readClientGroupsForWorkspaceFromStore(
  workspaceId: string,
  store: Pick<DataStore, 'listAllInWorkspace'>,
): Promise<ClientGroup[]> {
  return loadClientGroupsForWorkspace(workspaceId, (collection, ws) =>
    store.listAllInWorkspace(collection, ws),
  );
}

async function loadClientGroupsForWorkspace(
  workspaceId: string,
  listInWorkspace: <T extends ClientGroup>(collection: string, ws: string) => Promise<T[]>,
): Promise<ClientGroup[]> {
  const groups = await listInWorkspace<ClientGroup>(DB_NAMES.clientGroups, workspaceId);
  return sortGroups(groups);
}

export async function getClientGroupInWorkspace(
  workspaceId: string,
  groupId: string,
): Promise<ClientGroup | null> {
  return getByIdInWorkspace<ClientGroup>(DB_NAMES.clientGroups, groupId, workspaceId);
}

export async function resolveClientGroupId(
  workspaceId: string,
  groupId?: string,
): Promise<string> {
  if (groupId) {
    const group = await getClientGroupInWorkspace(workspaceId, groupId);
    if (group) return group.id;
  }

  const groups = await listAllInWorkspace<ClientGroup>(DB_NAMES.clientGroups, workspaceId);
  const defaultGroup = groups.find((group) => group.isDefault) ?? groups[0];
  return defaultGroup?.id ?? '';
}

export async function deleteClientGroupInWorkspace(
  workspaceId: string,
  groupId: string,
  contactsAction: 'move_to_all' | 'delete_contacts' = 'move_to_all',
): Promise<'not_found' | 'deleted'> {
  const group = await getClientGroupInWorkspace(workspaceId, groupId);
  if (!group) return 'not_found';

  await withDbTransaction(async () => {
    const clients = await listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId);
    for (const client of clients) {
      if (client.groupId !== groupId) continue;
      if (contactsAction === 'delete_contacts') {
        await deleteDoc(DB_NAMES.clients, client.id);
      } else {
        await updateDoc<Client>(DB_NAMES.clients, client.id, { groupId: '' });
      }
    }

    await deleteDoc(DB_NAMES.clientGroups, groupId);
  });

  return 'deleted';
}
