import { createBlobDocumentStorage } from './blob.js';
import { isBlobConfigured } from './blobConfig.js';
import { createLocalDocumentStorage } from './local.js';
import { createS3DocumentStorage, isS3Configured } from './s3.js';
import type { DocumentStorage } from './types.js';

let storage: DocumentStorage | null = null;

function resolveDocumentStorageLabel(driver: DocumentStorage['driver']): string {
  if (driver === 'blob') return 'Vercel Blob';
  if (driver === 's3') return 'Amazon S3';
  return 'local (desarrollo)';
}

export function getDocumentStorage(): DocumentStorage {
  if (!storage) {
    if (isBlobConfigured()) {
      storage = createBlobDocumentStorage();
    } else if (isS3Configured()) {
      storage = createS3DocumentStorage();
    } else {
      storage = createLocalDocumentStorage();
    }
    console.log(`📄 Almacenamiento de documentos: ${resolveDocumentStorageLabel(storage.driver)}`);
  }
  return storage;
}

export function getDocumentStorageDriver(): DocumentStorage['driver'] {
  return getDocumentStorage().driver;
}
