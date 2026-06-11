import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { exportLowdbReadOnly } from '../db/exportLowdb.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appVersion = process.env.npm_package_version ?? null;

const result = exportLowdbReadOnly({
  sourcePath: config.dbPath,
  exportRootDir: path.join(backendDir, 'data', 'export'),
  appVersion: appVersion ?? undefined,
});

console.log(JSON.stringify(result, null, 2));
