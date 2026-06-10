import type { Document, DocumentTypeGroup } from '@shared/types';
import { canonicalDocumentTypeGroupIsPublic } from '@shared/types';
import {
  DEFAULT_DOCUMENT_TYPE_GROUP_LABELS,
  DOCUMENT_TYPE_GROUP_ORDER,
} from '../../../shared/documentTypeGroups.js';
import { DB_NAMES } from '../config.js';
import type { DataStore } from './dataStore.js';
import {
  deleteDoc,
  getByIdInWorkspace,
  insertDoc,
  listAll,
  listAllInWorkspace,
  updateDoc,
  withDbTransaction,
} from './repository.js';

function sortGroups(groups: DocumentTypeGroup[]): DocumentTypeGroup[] {
  return [...groups].sort((a, b) => {
    const orderA = DOCUMENT_TYPE_GROUP_ORDER.indexOf(a.documentType);
    const orderB = DOCUMENT_TYPE_GROUP_ORDER.indexOf(b.documentType);
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, 'es');
  });
}

/** Crea los grupos-tipo por defecto (Facturas, Albaranes) que falten en el workspace. */
export async function ensureDefaultDocumentTypeGroups(workspaceId: string): Promise<void> {
  const existing = await listAllInWorkspace<DocumentTypeGroup>(
    DB_NAMES.documentTypeGroups,
    workspaceId,
  );
  const existingTypes = new Set(existing.map((group) => group.documentType));

  const now = new Date().toISOString();
  for (const documentType of DOCUMENT_TYPE_GROUP_ORDER) {
    if (existingTypes.has(documentType)) continue;

    const group: DocumentTypeGroup = {
      id: crypto.randomUUID(),
      workspaceId,
      documentType,
      name: DEFAULT_DOCUMENT_TYPE_GROUP_LABELS[documentType],
      isPublic: documentType === 'delivery-note',
      createdAt: now,
    };
    await insertDoc(DB_NAMES.documentTypeGroups, group);
  }
}

export async function ensureDefaultDocumentTypeGroupsForAllWorkspaces(): Promise<void> {
  const workspaces = await listAll<{ id: string }>(DB_NAMES.workspaces);
  for (const workspace of workspaces) {
    await ensureDefaultDocumentTypeGroups(workspace.id);
  }
  await migrateDocumentTypeGroupVisibilityForAllWorkspaces();
}

/** Persiste isPublic en grupos legacy; facturas siempre isPublic false. */
export async function migrateDocumentTypeGroupVisibilityForAllWorkspaces(): Promise<void> {
  const groups = await listAll<DocumentTypeGroup>(DB_NAMES.documentTypeGroups);
  for (const group of groups) {
    if (group.documentType === 'invoice') {
      if (group.isPublic === false) continue;
      await updateDoc<DocumentTypeGroup>(DB_NAMES.documentTypeGroups, group.id, { isPublic: false });
      continue;
    }

    if (group.isPublic !== undefined) continue;
    await updateDoc<DocumentTypeGroup>(DB_NAMES.documentTypeGroups, group.id, {
      isPublic: canonicalDocumentTypeGroupIsPublic(group.documentType),
    });
  }
}

export async function listDocumentTypeGroupsForWorkspace(
  workspaceId: string,
): Promise<DocumentTypeGroup[]> {
  return loadDocumentTypeGroupsForWorkspace(workspaceId, listAllInWorkspace);
}

/** P2: lectura via DataStore (piloto GET /api/document-type-groups). */
export async function readDocumentTypeGroupsForWorkspaceFromStore(
  workspaceId: string,
  store: Pick<DataStore, 'listAllInWorkspace'>,
): Promise<DocumentTypeGroup[]> {
  return loadDocumentTypeGroupsForWorkspace(workspaceId, (collection, ws) =>
    store.listAllInWorkspace(collection, ws),
  );
}

async function loadDocumentTypeGroupsForWorkspace(
  workspaceId: string,
  listInWorkspace: <T extends DocumentTypeGroup>(
    collection: string,
    ws: string,
  ) => Promise<T[]>,
): Promise<DocumentTypeGroup[]> {
  await ensureDefaultDocumentTypeGroups(workspaceId);
  const groups = await listInWorkspace<DocumentTypeGroup>(
    DB_NAMES.documentTypeGroups,
    workspaceId,
  );
  return sortGroups(groups);
}

export async function getDocumentTypeGroupInWorkspace(
  workspaceId: string,
  groupId: string,
): Promise<DocumentTypeGroup | null> {
  return getByIdInWorkspace<DocumentTypeGroup>(
    DB_NAMES.documentTypeGroups,
    groupId,
    workspaceId,
  );
}

export async function deleteDocumentTypeGroupInWorkspace(
  workspaceId: string,
  groupId: string,
  documentsAction: 'keep' | 'delete_documents' = 'keep',
): Promise<'not_found' | 'deleted'> {
  const group = await getDocumentTypeGroupInWorkspace(workspaceId, groupId);
  if (!group) return 'not_found';

  await withDbTransaction(async () => {
    if (documentsAction === 'delete_documents') {
      const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
      for (const document of documents) {
        if (document.type !== group.documentType) continue;
        await deleteDoc(DB_NAMES.documents, document.id);
      }
    }

    await deleteDoc(DB_NAMES.documentTypeGroups, groupId);
  });

  return 'deleted';
}
