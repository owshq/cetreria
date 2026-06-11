import type { Client, Document } from '@shared/types';
import {
  buildDocumentDisplayNameForDocument,
  type DocumentDisplayNameMigrationPolicy,
  type WorkspaceDocumentFormats,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listAllInWorkspace, updateDoc } from '../db/repository.js';
import { getWorkspaceBillingSettings } from './workspaceBillingSettings.js';

function resolveClientNameForDocument(document: Document, client?: Client | null): string {
  return document.billingAddress?.name?.trim() || client?.name?.trim() || '';
}

export function buildDisplayNameForDocumentRecord(
  formats: WorkspaceDocumentFormats | null | undefined,
  document: Pick<Document, 'type' | 'number' | 'date'>,
  clientName: string,
): string {
  return buildDocumentDisplayNameForDocument(formats, document, clientName).trim();
}

export async function applyDocumentDisplayNameMigration(
  workspaceId: string,
  policy: DocumentDisplayNameMigrationPolicy,
  previousFormats: WorkspaceDocumentFormats,
  nextFormats: WorkspaceDocumentFormats,
): Promise<number> {
  const [documents, clients] = await Promise.all([
    listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  let updatedCount = 0;

  for (const document of documents) {
    const clientName = resolveClientNameForDocument(document, clientsById.get(document.clientId));

    if (policy === 'keep' && document.displayName?.trim()) {
      continue;
    }

    const formats = policy === 'keep' ? previousFormats : nextFormats;
    const nextDisplayName = buildDisplayNameForDocumentRecord(formats, document, clientName);
    if (!nextDisplayName) continue;
    if (document.displayName?.trim() === nextDisplayName) continue;

    await updateDoc<Document>(DB_NAMES.documents, document.id, { displayName: nextDisplayName });
    updatedCount += 1;
  }

  return updatedCount;
}

export async function backfillMissingDocumentDisplayNames(workspaceId: string): Promise<number> {
  const billingSettings = await getWorkspaceBillingSettings(workspaceId);
  const formats = billingSettings.documentFormats;
  if (!formats) return 0;

  const [documents, clients] = await Promise.all([
    listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));

  let updatedCount = 0;

  for (const document of documents) {
    if (document.displayName?.trim()) continue;

    const clientName = resolveClientNameForDocument(document, clientsById.get(document.clientId));
    const displayName = buildDisplayNameForDocumentRecord(formats, document, clientName);
    if (!displayName) continue;

    await updateDoc<Document>(DB_NAMES.documents, document.id, { displayName });
    updatedCount += 1;
  }

  return updatedCount;
}
