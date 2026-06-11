import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';

/** Workspace efimero de smoke Verifactu; no debe persistir en db.json de desarrollo. */
export const EPHEMERAL_SMOKE_WORKSPACE_IDS = new Set([
  'f7000001-0000-4000-8000-000000000001',
  'f6000001-0000-4000-8000-000000000001',
]);

const TEST_USER_EMAIL_SUFFIX = '@test.local';

type DbEntity = { id: string; workspaceId?: string; email?: string };

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

function dedupeActivityTypes<T extends { id: string; workspaceId?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${item.workspaceId ?? ''}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function belongsToEphemeralWorkspace(entity: DbEntity): boolean {
  if (entity.workspaceId && EPHEMERAL_SMOKE_WORKSPACE_IDS.has(entity.workspaceId)) return true;
  if (EPHEMERAL_SMOKE_WORKSPACE_IDS.has(entity.id)) return true;
  return false;
}

/**
 * Elimina duplicados por id y datos efimeros de smoke tests que filtraron a db.json local.
 */
export async function migrateDbHygiene(): Promise<void> {
  const db = await refreshDbFromDisk();
  let changed = false;

  const ephemeralWorkspaceIds = EPHEMERAL_SMOKE_WORKSPACE_IDS;

  const filterEphemeral = <T extends DbEntity>(items: T[]): T[] =>
    items.filter((item) => !belongsToEphemeralWorkspace(item));

  const dedupeCollections: Array<{
    key: (typeof DB_NAMES)[keyof typeof DB_NAMES];
    dedupe: <T extends { id: string }>(items: T[]) => T[];
    filterSmoke?: boolean;
  }> = [
    { key: DB_NAMES.users, dedupe: dedupeById },
    { key: DB_NAMES.workspaces, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceMembers, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.clients, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.activities, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.events, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.documents, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.reports, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.clientGroups, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.documentTypeGroups, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.invoiceConceptSettings, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceBillingSettings, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceScheduleSettings, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceFeatureSettings, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceAppearanceSettings, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.notifications, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.savedTableViewsPages, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.savedTableViewsUserPages, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.tableViewStateUserPages, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.userInteractionPages, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.userSchedules, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.workspaceScheduleHolidays, dedupe: dedupeById, filterSmoke: true },
    { key: DB_NAMES.activityTypes, dedupe: dedupeActivityTypes, filterSmoke: true },
  ];

  for (const { key, dedupe, filterSmoke } of dedupeCollections) {
    const raw = [...db.data[key]] as DbEntity[];
    let next = dedupe(raw);
    if (filterSmoke) {
      next = filterEphemeral(next);
    }
    if (JSON.stringify(next) !== JSON.stringify(raw)) {
      db.data[key] = next as typeof db.data[typeof key];
      changed = true;
    }
  }

  const memberUserIds = new Set(
    (db.data[DB_NAMES.workspaceMembers] as unknown as Array<{ userId: string }>).map(
      (m) => m.userId,
    ),
  );
  const usersBefore = [...db.data[DB_NAMES.users]] as Array<{ id: string; email?: string }>;
  const usersAfter = usersBefore.filter((user) => {
    const email = user.email?.trim().toLowerCase() ?? '';
    if (!email.endsWith(TEST_USER_EMAIL_SUFFIX)) return true;
    return memberUserIds.has(user.id);
  });
  if (JSON.stringify(usersAfter) !== JSON.stringify(usersBefore)) {
    db.data[DB_NAMES.users] = usersAfter as typeof db.data[typeof DB_NAMES.users];
    changed = true;
  }

  if (changed) {
    await db.write();
    console.log(
      `Higiene de BD: duplicados y smoke efimero eliminados (workspaces: ${[...ephemeralWorkspaceIds].join(', ')}).`,
    );
  }
}
