import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import { DB_NAMES, config } from '../config.js';
import { persistDbAfterWrite, refreshDbFromDisk } from './store.js';

type DbName = (typeof DB_NAMES)[keyof typeof DB_NAMES];

type DbHandle = Awaited<ReturnType<typeof refreshDbFromDisk>>;

type ActiveTransaction = {
  db: DbHandle;
  changed: boolean;
};

/** Serializa escrituras en el mismo proceso (read-modify-write atómico). */
let writeQueue: Promise<void> = Promise.resolve();
let activeTx: ActiveTransaction | null = null;

function withWriteMutex<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function getCollection(dbName: string) {
  return dbName as DbName;
}

async function resolveDb(): Promise<DbHandle> {
  if (activeTx) return activeTx.db;
  return refreshDbFromDisk();
}

function markTxChanged(): void {
  if (activeTx) activeTx.changed = true;
}

/** Marca la transacción activa como sucia tras mutar `db.data` directamente. */
export function touchDbTransaction(): void {
  markTxChanged();
}

/**
 * Un refresh, mutaciones en memoria (insertDoc/updateDoc/deleteDoc) y un solo write al final.
 * Las llamadas anidadas reutilizan la misma transacción.
 */
export async function withDbTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTx) {
    return fn();
  }

  return withWriteMutex(async () => {
    const db = await refreshDbFromDisk();
    activeTx = { db, changed: false };
    try {
      const result = await fn();
      if (activeTx.changed) {
        await activeTx.db.write();
        await persistDbAfterWrite();
      }
      return result;
    } finally {
      activeTx = null;
    }
  });
}

export async function listAll<T extends { id: string }>(dbName: string): Promise<T[]> {
  const db = await resolveDb();
  return [...db.data[getCollection(dbName)]] as T[];
}

export async function getById<T extends { id: string }>(
  dbName: string,
  id: string,
): Promise<T | null> {
  const db = await resolveDb();
  const doc = db.data[getCollection(dbName)].find((item) => item.id === id);
  return doc ? ({ ...doc } as T) : null;
}

export async function insertDoc<T extends { id: string }>(
  dbName: string,
  entity: T,
): Promise<T> {
  if (activeTx) {
    const db = await resolveDb();
    db.data[getCollection(dbName)].push({ ...entity });
    markTxChanged();
    return entity;
  }

  return withWriteMutex(async () => {
    const db = await refreshDbFromDisk();
    db.data[getCollection(dbName)].push({ ...entity });
    await db.write();
    await persistDbAfterWrite();
    return entity;
  });
}

export async function updateDoc<T extends { id: string }>(
  dbName: string,
  id: string,
  updates: Partial<T>,
): Promise<T | null> {
  if (activeTx) {
    const db = await resolveDb();
    const collection = db.data[getCollection(dbName)];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const merged = { ...collection[index], ...updates, id };
    collection[index] = merged;
    markTxChanged();
    return merged as T;
  }

  return withWriteMutex(async () => {
    const db = await refreshDbFromDisk();
    const collection = db.data[getCollection(dbName)];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const merged = { ...collection[index], ...updates, id };
    collection[index] = merged;
    await db.write();
    await persistDbAfterWrite();
    return merged as T;
  });
}

export async function deleteDoc(dbName: string, id: string): Promise<boolean> {
  if (activeTx) {
    const db = await resolveDb();
    const collection = db.data[getCollection(dbName)];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return false;

    collection.splice(index, 1);
    markTxChanged();
    return true;
  }

  return withWriteMutex(async () => {
    const db = await refreshDbFromDisk();
    const collection = db.data[getCollection(dbName)];
    const index = collection.findIndex((item) => item.id === id);
    if (index === -1) return false;

    collection.splice(index, 1);
    await db.write();
    await persistDbAfterWrite();
    return true;
  });
}

export async function findByField<T extends { id: string }>(
  dbName: string,
  field: string,
  value: string,
): Promise<T[]> {
  const db = await resolveDb();
  return db.data[getCollection(dbName)].filter((item) => item[field] === value) as T[];
}

export type WithWorkspace = { workspaceId?: string };

export function belongsToWorkspace<T extends WithWorkspace>(
  item: T,
  workspaceId: string,
): boolean {
  return (
    item.workspaceId === workspaceId ||
    (!item.workspaceId && workspaceId === DEFAULT_WORKSPACE_ID)
  );
}

export function filterCollectionInWorkspace<T extends WithWorkspace>(
  items: T[],
  workspaceId: string,
): T[] {
  return items.filter((item) => belongsToWorkspace(item, workspaceId));
}

export async function listAllInWorkspace<T extends WithWorkspace & { id: string }>(
  dbName: string,
  workspaceId: string,
): Promise<T[]> {
  const items = await listAll<T>(dbName);
  return items.filter(
    (item) =>
      item.workspaceId === workspaceId ||
      (!item.workspaceId && workspaceId === DEFAULT_WORKSPACE_ID),
  );
}

export async function getByIdInWorkspace<T extends WithWorkspace & { id: string }>(
  dbName: string,
  id: string,
  workspaceId: string,
): Promise<T | null> {
  const item = await getById<T>(dbName, id);
  if (!item) return null;
  if (item.workspaceId === workspaceId) return item;
  if (!item.workspaceId && workspaceId === DEFAULT_WORKSPACE_ID) return item;
  return null;
}

export async function findByFieldInWorkspace<T extends WithWorkspace & { id: string }>(
  dbName: string,
  field: string,
  value: string,
  workspaceId: string,
): Promise<T[]> {
  const items = await findByField<T>(dbName, field, value);
  return filterCollectionInWorkspace(items, workspaceId);
}

export async function countDocs(dbName: string): Promise<number> {
  const db = await resolveDb();
  return db.data[getCollection(dbName)].length;
}

export { DB_NAMES, config };
