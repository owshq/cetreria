import { config } from '../config.js';
import { invalidateDbCacheForRemoteSync } from '../db/store.js';
import { isBlobConfigured } from '../storage/blobConfig.js';
import { isS3Configured } from '../storage/s3.js';
import { pullDbFromBlob, pushDbToBlob } from './dbBlobSync.js';
import { pullDbFromS3, pushDbToS3 } from './dbS3Sync.js';

/** Blob tiene prioridad sobre S3 en Vercel (demo solo-Vercel). */
export async function pullDbFromRemote(localPath: string): Promise<boolean> {
  if (isBlobConfigured()) return pullDbFromBlob(localPath);
  return pullDbFromS3(localPath);
}

export async function pushDbToRemote(localPath: string): Promise<void> {
  if (isBlobConfigured()) return pushDbToBlob(localPath);
  return pushDbToS3(localPath);
}

export function isRemoteDbSyncConfigured(): boolean {
  return Boolean(process.env.VERCEL) && (isBlobConfigured() || isS3Configured());
}

/**
 * En Vercel cada instancia serverless tiene su propio /tmp.
 * Hay que bajar db.json remoto al inicio de cada peticion; si no, crear/editar/borrar
 * falla de forma intermitente entre recargas (404, datos que reaparecen, etc.).
 */
export async function syncDbFromRemoteBeforeRequest(): Promise<void> {
  if (!isRemoteDbSyncConfigured()) return;
  await pullDbFromRemote(config.dbPath);
  invalidateDbCacheForRemoteSync();
}
