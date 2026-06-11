import type { DataStore } from './dataStore.js';
import { NotImplementedError } from './dataStore.js';

export const COUCHDB_NOT_IMPLEMENTED_MESSAGE =
  'CouchDB provider is not implemented in this release.';

/** Stub seguro: compila pero no conecta ni persiste datos. */
export function createCouchDbStore(): DataStore {
  throw new NotImplementedError(COUCHDB_NOT_IMPLEMENTED_MESSAGE);
}
