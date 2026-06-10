import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';
import type { DocumentStorage } from './types.js';

function resolvePath(key: string): string {
  const safeKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const base = path.resolve(config.documentStorageDir);
  const full = path.resolve(base, safeKey);
  if (!full.startsWith(base)) {
    throw new Error('Ruta de documento no válida');
  }
  return full;
}

export function createLocalDocumentStorage(): DocumentStorage {
  return {
    driver: 'local',
    async upload(key, body) {
      const filePath = resolvePath(key);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, body);
    },
    async download(key) {
      const filePath = resolvePath(key);
      try {
        return await fs.readFile(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      const filePath = resolvePath(key);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    },
  };
}
