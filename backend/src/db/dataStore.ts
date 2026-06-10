/** Documento minimo persistido (id estable). */
export type StoreDocument = { id: string };

export type StoreWithWorkspace = { workspaceId?: string };

/**
 * Contrato de persistencia del CRM.
 * Implementacion actual: JSON/lowdb via `JsonFileStore`.
 * Futuro: adapter CouchDB u otro backend documental.
 */
export interface DataStore {
  readonly driver: 'json';

  listAll<T extends StoreDocument>(collection: string): Promise<T[]>;

  listAllInWorkspace<T extends StoreWithWorkspace & StoreDocument>(
    collection: string,
    workspaceId: string,
  ): Promise<T[]>;

  getById<T extends StoreDocument>(collection: string, id: string): Promise<T | null>;

  insertDoc<T extends StoreDocument>(collection: string, doc: T): Promise<T>;

  updateDoc<T extends StoreDocument>(
    collection: string,
    id: string,
    patch: Partial<T>,
  ): Promise<T | null>;

  deleteDoc(collection: string, id: string): Promise<boolean>;

  countDocs(collection: string): Promise<number>;

  /** Agrupa mutaciones en una sola escritura a disco. */
  withTransaction<T>(fn: (store: DataStore) => Promise<T>): Promise<T>;
}
