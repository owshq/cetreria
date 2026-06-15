import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../backend/src/app.js';
import { bootstrapDb } from '../backend/src/db/bootstrapDb.js';
import { pullDbFromS3, pushDbToS3 } from '../backend/src/vercel/dbS3Sync.js';
import { prepareVercelRuntime } from '../backend/src/vercel/prepareRuntime.js';

const funcDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(funcDir, '..');

function resolveSeedDbPath(): string | null {
  const candidates = [
    path.join(funcDir, 'seed-db.json'),
    path.join(repoRoot, 'backend/data/db.json'),
    path.join(process.cwd(), 'backend/data/db.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

let app: ReturnType<typeof createApp> | null = null;
let bootPromise: Promise<void> | null = null;

async function ensureApp(): Promise<ReturnType<typeof createApp>> {
  if (app) return app;
  if (!bootPromise) {
    bootPromise = (async () => {
      prepareVercelRuntime(resolveSeedDbPath());
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
