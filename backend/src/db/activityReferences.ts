import type { CalendarEvent, Document } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace, updateDoc, withDbTransaction } from './repository.js';

/** Quita activityId de documentos y eventos que apuntan a una actividad concreta. */
export async function clearActivityReferences(
  activityId: string,
  workspaceId: string,
): Promise<{ documents: number; events: number }> {
  return withDbTransaction(async () => {
    let documents = 0;
    let events = 0;

    const linkedDocs = await findByFieldInWorkspace<Document>(
      DB_NAMES.documents,
      'activityId',
      activityId,
      workspaceId,
    );
    for (const doc of linkedDocs) {
      await updateDoc<Document>(DB_NAMES.documents, doc.id, { activityId: undefined });
      documents += 1;
    }

    const linkedEvents = await findByFieldInWorkspace<CalendarEvent>(
      DB_NAMES.events,
      'activityId',
      activityId,
      workspaceId,
    );
    for (const event of linkedEvents) {
      await updateDoc<CalendarEvent>(DB_NAMES.events, event.id, { activityId: undefined });
      events += 1;
    }

    return { documents, events };
  });
}
