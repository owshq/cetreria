import fs from 'node:fs';
import path from 'node:path';
import { get, put } from '@vercel/blob';
import {
  BLOB_PRIVATE_ACCESS,
  isBlobConfigured,
  resolveDbBlobPathname,
} from '../storage/blobConfig.js';

function shouldSyncDbToBlob(): boolean {
  return Boolean(process.env.VERCEL) && isBlobConfigured();
}

async function readBlobStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Descarga db.json desde Vercel Blob si existe. */
export async function pullDbFromBlob(localPath: string): Promise<boolean> {
  if (!shouldSyncDbToBlob()) return false;

  const pathname = resolveDbBlobPathname();
  const result = await get(pathname, { access: BLOB_PRIVATE_ACCESS });
  if (!result || result.statusCode !== 200 || !result.stream) return false;

  const bytes = await readBlobStream(result.stream);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, bytes);
  return true;
}

/** Sube db.json local a Vercel Blob tras cada escritura. */
export async function pushDbToBlob(localPath: string): Promise<void> {
  if (!shouldSyncDbToBlob()) return;
  if (!fs.existsSync(localPath)) return;

  const body = fs.readFileSync(localPath);
  await put(resolveDbBlobPathname(), body, {
    access: BLOB_PRIVATE_ACCESS,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
