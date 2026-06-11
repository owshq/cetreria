import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';
import { backfillMissingDocumentDisplayNames } from '../services/documentDisplayNames.js';

type WorkspaceRow = { id: string; workspaceId?: string };

/**
 * Congela displayName en documentos legacy usando el formato actual del workspace.
 */
export async function migrateDocumentDisplayNames(): Promise<void> {
  const db = await refreshDbFromDisk();
  const workspaces = [...db.data[DB_NAMES.workspaces]] as WorkspaceRow[];
  let total = 0;

  for (const workspace of workspaces) {
    const workspaceId = workspace.workspaceId ?? workspace.id;
    total += await backfillMissingDocumentDisplayNames(workspaceId);
  }

  if (total > 0) {
    console.log(`Migracion displayName: ${total} documento(s) actualizado(s).`);
  }
}
