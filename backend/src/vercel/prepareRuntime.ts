import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DATA_ROOT = '/tmp/crm-cetreria';

/**
 * Ajusta rutas de datos en Vercel: /tmp es el unico directorio escribible.
 * Copia seed-db.json junto al handler si aun no hay base de datos.
 */
export function prepareVercelRuntime(seedDbPath: string | null): void {
  if (!process.env.VERCEL) return;

  const dataRoot = process.env.VERCEL_DATA_ROOT ?? DEFAULT_DATA_ROOT;
  const dbPath = process.env.DB_PATH ?? path.join(dataRoot, 'db.json');
  const documentStorageDir =
    process.env.DOCUMENT_STORAGE_DIR ?? path.join(dataRoot, 'document-pdfs');

  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(documentStorageDir, { recursive: true });

  if (!fs.existsSync(dbPath) && seedDbPath && fs.existsSync(seedDbPath)) {
    fs.copyFileSync(seedDbPath, dbPath);
  }

  process.env.DB_PATH = dbPath;
  process.env.DOCUMENT_STORAGE_DIR = documentStorageDir;
}
