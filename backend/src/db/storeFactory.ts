import type { DataStore } from './dataStore.js';
import { NotImplementedError } from './dataStore.js';
import { COUCHDB_NOT_IMPLEMENTED_MESSAGE, createCouchDbStore } from './couchDbStore.js';
import { createJsonFileStore } from './jsonFileStore.js';

export type DatabaseProvider = 'json' | 'couchdb';

let cachedStore: DataStore | null = null;

/** DATABASE_PROVIDER con alias legacy DB_TYPE. Por defecto: json. */
export function resolveDatabaseProvider(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseProvider {
  const raw = (env.DATABASE_PROVIDER ?? env.DB_TYPE ?? 'json').trim().toLowerCase();
  if (raw === 'json') return 'json';
  if (raw === 'couchdb') return 'couchdb';
  throw new Error(`Unsupported DATABASE_PROVIDER: ${raw}`);
}

export function createDataStore(provider: DatabaseProvider): DataStore {
  if (provider === 'json') {
    return createJsonFileStore();
  }
  return createCouchDbStore();
}

export function getDataStore(): DataStore {
  if (!cachedStore) {
    cachedStore = createDataStore(resolveDatabaseProvider());
  }
  return cachedStore;
}

/** Solo tests: libera singleton entre casos con distinto provider. */
export function resetDataStoreForTests(): void {
  cachedStore = null;
}

export { COUCHDB_NOT_IMPLEMENTED_MESSAGE, NotImplementedError };
