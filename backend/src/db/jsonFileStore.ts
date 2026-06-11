import type { DataStore } from './dataStore.js';
import {
  countDocs,
  deleteDoc,
  findByFieldInWorkspace,
  getById,
  insertDoc,
  listAll,
  listAllInWorkspace,
  updateDoc,
  withDbTransaction,
} from './repository.js';

export function createJsonFileStore(): DataStore {
  const store: DataStore = {
    driver: 'json',
    listAll,
    listAllInWorkspace,
    getById,
    insertDoc,
    updateDoc,
    deleteDoc,
    findByFieldInWorkspace,
    countDocs,
    withTransaction(fn) {
      return withDbTransaction(() => fn(store));
    },
  };
  return store;
}

/** Instancia singleton del backend JSON actual (lowdb). */
export const jsonFileStore = createJsonFileStore();
