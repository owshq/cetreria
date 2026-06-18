import { del, get, put } from '@vercel/blob';
import { BLOB_PRIVATE_ACCESS } from './blobConfig.js';
import type { DocumentStorage } from './types.js';

function normalizeKey(key: string): string {
  return key.replace(/\\/g, '/').replace(/^\/+/, '');
}

async function readBlobStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function createBlobDocumentStorage(): DocumentStorage {
  return {
    driver: 'blob',
    async upload(key, body, contentType = 'application/pdf') {
      await put(normalizeKey(key), Buffer.from(body), {
        access: BLOB_PRIVATE_ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
      });
    },
    async download(key) {
      const result = await get(normalizeKey(key), {
        access: BLOB_PRIVATE_ACCESS,
        useCache: false,
      });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return readBlobStream(result.stream);
    },
    async delete(key) {
      await del(normalizeKey(key));
    },
    async getViewUrl(_key) {
      // Blobs privados: el PDF se sirve via API autenticada, no URL directa.
      return null;
    },
  };
}
