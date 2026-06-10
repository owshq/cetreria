import { createLocalDocumentStorage } from './local.js';
import { createS3DocumentStorage, isS3Configured } from './s3.js';
import type { DocumentStorage } from './types.js';

let storage: DocumentStorage | null = null;

export function getDocumentStorage(): DocumentStorage {
  if (!storage) {
    storage = isS3Configured() ? createS3DocumentStorage() : createLocalDocumentStorage();
    console.log(
      `📄 Almacenamiento de documentos: ${storage.driver === 's3' ? 'Amazon S3' : 'local (desarrollo)'}`,
    );
  }
  return storage;
}

export function getDocumentStorageDriver(): DocumentStorage['driver'] {
  return getDocumentStorage().driver;
}
