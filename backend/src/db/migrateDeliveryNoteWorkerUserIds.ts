import type { Activity, Document } from '@shared/types';
import { findActivityDeliveryNoteForWorker } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';

/**
 * Asigna workerUserId a albaranes legacy vinculados a actividades con informes.
 */
export async function migrateDeliveryNoteWorkerUserIds(): Promise<void> {
  const db = await refreshDbFromDisk();
  const activities = [...db.data[DB_NAMES.activities]] as unknown as Activity[];
  const documents = [...db.data[DB_NAMES.documents]] as unknown as Document[];
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  let updated = 0;

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index];
    if (
      document.type !== 'delivery-note' ||
      !document.activityId ||
      document.workerUserId
    ) {
      continue;
    }

    const activity = activityById.get(document.activityId);
    if (!activity?.workReports?.length) continue;

    for (const report of activity.workReports) {
      if (report.status !== 'submitted' || (report.workedMinutes ?? 0) <= 0) continue;
      const resolved = findActivityDeliveryNoteForWorker(
        activity.id,
        report.userId,
        documents,
        activity,
      );
      if (resolved?.id !== document.id) continue;

      documents[index] = { ...document, workerUserId: report.userId };
      updated += 1;
      break;
    }
  }

  if (updated > 0) {
    db.data[DB_NAMES.documents] = documents as unknown as typeof db.data[typeof DB_NAMES.documents];
    await db.write();
    console.log(`Migracion workerUserId: ${updated} albaran(es) actualizado(s).`);
  }
}
