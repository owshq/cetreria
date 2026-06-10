import type {
  Activity,
  CalendarEvent,
  Client,
  Document,
  DocumentTypeGroup,
  DocumentsBootstrap,
} from '@shared/types';
import { filterClientsForUser, filterDocumentTypeGroupsForUser } from '@shared/types';
import { DB_NAMES } from '../config.js';
import type { DataStore } from '../db/dataStore.js';
import { filterCollectionInWorkspace } from '../db/repository.js';
import { refreshDbFromDisk } from '../db/store.js';
import type { AuthUser } from '../middleware/auth.js';
import {
  filterActivitiesForUser,
  filterDocumentsForUserInWorkspace,
} from '../utils/activityVisibility.js';

export type DocumentsBootstrapResponse = {
  documents: Document[];
  clients: Client[];
  documentTypeGroups: DocumentTypeGroup[];
  activities: Activity[];
};

/** Lectura cruda del workspace (repository / refreshDbFromDisk). */
export async function loadDocumentsBootstrap(workspaceId: string): Promise<DocumentsBootstrap> {
  const db = await refreshDbFromDisk();

  return {
    documents: filterCollectionInWorkspace(
      db.data[DB_NAMES.documents] as unknown as Document[],
      workspaceId,
    ),
    clients: filterCollectionInWorkspace(
      db.data[DB_NAMES.clients] as unknown as Client[],
      workspaceId,
    ),
    documentTypeGroups: filterCollectionInWorkspace(
      db.data[DB_NAMES.documentTypeGroups] as unknown as DocumentTypeGroup[],
      workspaceId,
    ),
    activities: filterCollectionInWorkspace(
      db.data[DB_NAMES.activities] as unknown as Activity[],
      workspaceId,
    ),
  };
}

/** P2c: bootstrap visible via DataStore (piloto GET /api/documents/bootstrap). */
export async function readDocumentsBootstrapFromStore(
  workspaceId: string,
  user: AuthUser,
  store: Pick<DataStore, 'listAllInWorkspace'>,
): Promise<DocumentsBootstrapResponse> {
  const [documents, clients, documentTypeGroups, activities, events] = await Promise.all([
    store.listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    store.listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
    store.listAllInWorkspace<DocumentTypeGroup>(DB_NAMES.documentTypeGroups, workspaceId),
    store.listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
    store.listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
  ]);

  return {
    documentTypeGroups: filterDocumentTypeGroupsForUser(documentTypeGroups, user),
    activities: filterActivitiesForUser(activities, events, user),
    documents: filterDocumentsForUserInWorkspace(
      documents,
      activities,
      events,
      user,
      documentTypeGroups,
    ),
    clients: filterClientsForUser(clients, activities, events, user),
  };
}
