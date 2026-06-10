import type { Activity, ActivityType } from '@shared/types';
import { DEFAULT_ACTIVITY_TYPES } from '../../../shared/activityTypes.js';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc, listAll, listAllInWorkspace, updateDoc, withDbTransaction } from './repository.js';

export async function ensureActivityTypesForWorkspace(workspaceId: string): Promise<void> {
  const existing = await listAllInWorkspace<ActivityType>(DB_NAMES.activityTypes, workspaceId);
  const existingIds = new Set(existing.map((type) => type.id));
  const missing = DEFAULT_ACTIVITY_TYPES.filter((type) => !existingIds.has(type.id));

  if (missing.length === 0) return;

  await withDbTransaction(async () => {
    for (const type of missing) {
      await insertDoc(DB_NAMES.activityTypes, {
        ...type,
        workspaceId,
      });
    }
  });

  if (existing.length === 0) {
    console.log(`Tipos de actividad inicializados para workspace ${workspaceId}.`);
    return;
  }

  console.log(
    `Tipos de actividad faltantes añadidos en workspace ${workspaceId}: ${missing.map((t) => t.id).join(', ')}`,
  );
}

export async function ensureActivityTypes() {
  const workspaces = await listAll<{ id: string }>(DB_NAMES.workspaces);
  for (const workspace of workspaces) {
    await ensureActivityTypesForWorkspace(workspace.id);
  }

  await withDbTransaction(async () => {
    const activities = await listAll<Activity & { workspaceId?: string }>(DB_NAMES.activities);
    for (const activity of activities) {
      if (activity.workspaceId && activity.workspaceId !== DEFAULT_WORKSPACE_ID) continue;
      const match = DEFAULT_ACTIVITY_TYPES.find(
        (t) => t.id === activity.type || t.name === activity.type,
      );
      if (match && activity.type !== match.id) {
        await updateDoc<Activity>(DB_NAMES.activities, activity.id, { type: match.id });
      }
    }
  });
}
