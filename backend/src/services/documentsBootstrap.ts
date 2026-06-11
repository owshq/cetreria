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
import { getDataStore } from '../db/storeFactory.js';
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

/** Lectura cruda del workspace via DataStore. */
export async function loadDocumentsBootstrap(workspaceId: string): Promise<DocumentsBootstrap> {
  const store = getDataStore();
  const [documents, clients, documentTypeGroups, activities] = await Promise.all([
    store.listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    store.listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
    store.listAllInWorkspace<DocumentTypeGroup>(DB_NAMES.documentTypeGroups, workspaceId),
    store.listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
  ]);

  return { documents, clients, documentTypeGroups, activities };
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
