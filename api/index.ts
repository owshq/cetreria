import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../backend/src/app.js';
import { bootstrapDb } from '../backend/src/db/bootstrapDb.js';
import { pullDbFromS3, pushDbToS3 } from '../backend/src/vercel/dbS3Sync.js';
import { prepareVercelRuntime } from '../backend/src/vercel/prepareRuntime.js';

const funcDir = path.dirname(fileURLToPath(import.meta.url));
const seedDbPath = path.join(funcDir, 'seed-db.json');

let app: ReturnType<typeof createApp> | null = null;
let bootPromise: Promise<void> | null = null;

async function ensureApp(): Promise<ReturnType<typeof createApp>> {
  if (app) return app;
  if (!bootPromise) {
    bootPromise = (async () => {
      prepareVercelRuntime(seedDbPath);
      const dbPath = process.env.DB_PATH;
      if (dbPath) {
        await pullDbFromS3(dbPath);
      }
      await bootstrapDb();
      if (dbPath) {
        await pushDbToS3(dbPath);
      }
      app = createApp();
    })();
  }
  await bootPromise;
  return app!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expressApp = await ensureApp();
  return expressApp(req, res);
}
