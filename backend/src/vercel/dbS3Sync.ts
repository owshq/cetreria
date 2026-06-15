import fs from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { createS3Client, isS3Configured } from '../storage/s3.js';

function shouldSyncDbToS3(): boolean {
  return Boolean(process.env.VERCEL) && isS3Configured();
}

function isMissingKeyError(err: unknown): boolean {
  const code = (err as { name?: string }).name;
  return code === 'NoSuchKey' || code === 'NotFound';
}

/** Descarga db.json desde S3 si existe (S3 manda sobre seed local). */
export async function pullDbFromS3(localPath: string): Promise<boolean> {
  if (!shouldSyncDbToS3()) return false;

  const client = createS3Client();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.s3.bucket,
        Key: config.dbS3Key,
      }),
    );
    if (!response.Body) return false;

    const bytes = await response.Body.transformToByteArray();
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, bytes);
    return true;
  } catch (err) {
    if (isMissingKeyError(err)) return false;
    throw err;
  }
}

/** Sube db.json local a S3 tras cada escritura en Vercel. */
export async function pushDbToS3(localPath: string): Promise<void> {
  if (!shouldSyncDbToS3()) return;
  if (!fs.existsSync(localPath)) return;

  const client = createS3Client();
  const body = fs.readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: config.dbS3Key,
      Body: body,
      ContentType: 'application/json',
    }),
  );
}
