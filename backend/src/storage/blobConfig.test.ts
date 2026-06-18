import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isBlobConfigured,
  resolveDbBlobPathname,
} from './blobConfig.js';

describe('blobConfig', () => {
  it('isBlobConfigured exige BLOB_READ_WRITE_TOKEN', () => {
    assert.equal(isBlobConfigured(), false);
    process.env.BLOB_READ_WRITE_TOKEN = '  test-token  ';
    assert.equal(isBlobConfigured(), true);
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it('resolveDbBlobPathname prioriza DB_BLOB_PATHNAME y reutiliza DB_S3_KEY', () => {
    delete process.env.DB_BLOB_PATHNAME;
    delete process.env.DB_S3_KEY;
    assert.equal(resolveDbBlobPathname(), 'crm-cetreria/db.json');

    process.env.DB_S3_KEY = 'demo/db.json';
    assert.equal(resolveDbBlobPathname(), 'demo/db.json');

    process.env.DB_BLOB_PATHNAME = 'blob-only/db.json';
    assert.equal(resolveDbBlobPathname(), 'blob-only/db.json');

    delete process.env.DB_BLOB_PATHNAME;
    delete process.env.DB_S3_KEY;
  });
});
