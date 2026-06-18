import fs from 'fs';
import path from 'path';
import { JSONFilePreset } from 'lowdb/node';
import { DB_NAMES, LEGACY_DB_NAMES, config } from '../config.js';
import { pushDbToRemote } from '../vercel/dbRemoteSync.js';

type DbRecord = { id: string } & Record<string, unknown>;

export type DbSchema = {
  [K in (typeof DB_NAMES)[keyof typeof DB_NAMES]]: DbRecord[];
};

const defaultData = Object.fromEntries(
  Object.values(DB_NAMES).map((name) => [name, []]),
) as unknown as DbSchema;

function migrateLegacyCollectionNames(data: DbSchema & Record<string, unknown>): boolean {
  let changed = false;

  for (const [legacy, current] of Object.entries(LEGACY_DB_NAMES)) {
    const legacyItems = data[legacy];
    if (!Array.isArray(legacyItems)) continue;

    const currentItems = data[current];
    if (!Array.isArray(currentItems)) {
      data[current] = legacyItems;
    } else if (legacyItems.length > 0) {
      data[current] = [...currentItems, ...legacyItems];
    }

    delete data[legacy];
    changed = true;
  }

  return changed;
}

type LowdbInstance = Awaited<ReturnType<typeof JSONFilePreset<DbSchema>>>;

export type DbAccessMode = 'read-write' | 'read-only';

let dbInstance: LowdbInstance | null = null;
let cachedDbMtimeMs: number | null = null;
let dbAccessMode: DbAccessMode = 'read-write';

export function setDbAccessMode(mode: DbAccessMode): void {
  dbAccessMode = mode;
}

function readDbMtimeMs(): number | null {
  try {
    return fs.statSync(config.dbPath).mtimeMs;
  } catch {
    return null;
  }
}

/** Tras escribir en memoria, el JSON en disco coincide hasta que otro proceso lo modifique. */
export function markDbWritten(): void {
  cachedDbMtimeMs = readDbMtimeMs();
}

/** Persiste db.json en Blob/S3 cuando el runtime es Vercel y hay storage remoto. */
export async function persistDbAfterWrite(): Promise<void> {
  markDbWritten();
  await pushDbToRemote(config.dbPath);
}

export async function getDb(): Promise<LowdbInstance> {
  if (!dbInstance) {
    if (dbAccessMode === 'read-only') {
      if (!fs.existsSync(config.dbPath)) {
        throw new Error(`db.json no encontrado (modo lectura): ${config.dbPath}`);
      }
      dbInstance = await JSONFilePreset<DbSchema>(config.dbPath, defaultData);
      await dbInstance.read();
      cachedDbMtimeMs = readDbMtimeMs();
      return dbInstance;
    }

    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    dbInstance = await JSONFilePreset<DbSchema>(config.dbPath, defaultData);

    if (migrateLegacyCollectionNames(dbInstance.data)) {
      await dbInstance.write();
    }

    for (const name of Object.values(DB_NAMES)) {
      if (!Array.isArray(dbInstance.data[name])) {
        dbInstance.data[name] = [];
      }
    }

    await dbInstance.write();
  }

  return dbInstance;
}

/** Recarga db.json solo si cambió en disco (evita lecturas repetidas por petición). */
export async function refreshDbFromDisk(): Promise<LowdbInstance> {
  const db = await getDb();
  const mtimeMs = readDbMtimeMs();
  if (mtimeMs === null || cachedDbMtimeMs !== mtimeMs) {
    await db.read();
    cachedDbMtimeMs = mtimeMs;
  }
  return db;
}

export async function initJsonDb(): Promise<void> {
  await getDb();
}

/** Solo Vercel: libera singleton tras pull remoto para releer db.json en disco. */
export function invalidateDbCacheForRemoteSync(): void {
  dbInstance = null;
  cachedDbMtimeMs = null;
}

/** Solo tests: libera el singleton para usar otro `DB_PATH`. */
export function resetDbInstanceForTests(): void {
  invalidateDbCacheForRemoteSync();
}
