import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isRemoteDbSyncConfigured,
  syncDbFromRemoteBeforeRequest,
} from './dbRemoteSync.js';

describe('dbRemoteSync', () => {
  it('isRemoteDbSyncConfigured requiere VERCEL y Blob token', () => {
    const savedVercel = process.env.VERCEL;
    const savedToken = process.env.BLOB_READ_WRITE_TOKEN;

    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.equal(isRemoteDbSyncConfigured(), false);

    process.env.VERCEL = '1';
    assert.equal(isRemoteDbSyncConfigured(), false);

    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    assert.equal(isRemoteDbSyncConfigured(), true);

    if (savedVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = savedVercel;
    if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
  });

  it('syncDbFromRemoteBeforeRequest no hace nada fuera de Vercel', async () => {
    delete process.env.VERCEL;
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    await syncDbFromRemoteBeforeRequest();
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
});
