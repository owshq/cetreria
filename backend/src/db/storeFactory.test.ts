import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  COUCHDB_NOT_IMPLEMENTED_MESSAGE,
  createDataStore,
  getDataStore,
  resetDataStoreForTests,
  resolveDatabaseProvider,
} from './storeFactory.js';
import { NotImplementedError } from './dataStore.js';

describe('storeFactory', () => {
  const originalProvider = process.env.DATABASE_PROVIDER;
  const originalDbType = process.env.DB_TYPE;

  afterEach(() => {
    if (originalProvider === undefined) delete process.env.DATABASE_PROVIDER;
    else process.env.DATABASE_PROVIDER = originalProvider;
    if (originalDbType === undefined) delete process.env.DB_TYPE;
    else process.env.DB_TYPE = originalDbType;
    resetDataStoreForTests();
  });

  it('DATABASE_PROVIDER vacio resuelve json', () => {
    delete process.env.DATABASE_PROVIDER;
    delete process.env.DB_TYPE;
    assert.equal(resolveDatabaseProvider(), 'json');
  });

  it('DATABASE_PROVIDER=json resuelve json', () => {
    process.env.DATABASE_PROVIDER = 'json';
    assert.equal(resolveDatabaseProvider(), 'json');
  });

  it('DB_TYPE legacy alias resuelve json', () => {
    delete process.env.DATABASE_PROVIDER;
    process.env.DB_TYPE = 'json';
    assert.equal(resolveDatabaseProvider(), 'json');
  });

  it('DATABASE_PROVIDER=couchdb lanza error explicito en createDataStore', () => {
    assert.throws(
      () => createDataStore('couchdb'),
      (error: unknown) => {
        assert.ok(error instanceof NotImplementedError);
        assert.equal(error.message, COUCHDB_NOT_IMPLEMENTED_MESSAGE);
        return true;
      },
    );
  });

  it('getDataStore con couchdb falla de forma controlada', () => {
    process.env.DATABASE_PROVIDER = 'couchdb';
    resetDataStoreForTests();
    assert.throws(
      () => getDataStore(),
      (error: unknown) => {
        assert.ok(error instanceof NotImplementedError);
        assert.equal(error.message, COUCHDB_NOT_IMPLEMENTED_MESSAGE);
        return true;
      },
    );
  });

  it('getDataStore con json devuelve driver json', () => {
    process.env.DATABASE_PROVIDER = 'json';
    resetDataStoreForTests();
    assert.equal(getDataStore().driver, 'json');
  });
});
