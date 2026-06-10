import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORTS, apiUrl } from '../shared/ports.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env') });

const apiPort = Number(process.env.PORT ?? PORTS.api);
const frontendPort = Number(process.env.FRONTEND_PORT ?? PORTS.frontend);
const healthUrl = `${apiUrl(apiPort)}/api/health`;
const maxAttempts = 180;
const delayMs = 500;
const fetchTimeoutMs = 3000;

async function probeHealth(): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(fetchTimeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  if (await probeHealth()) {
    let database = 'json';
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(fetchTimeoutMs) });
      const body = (await response.json().catch(() => ({}))) as { database?: string };
      database = body.database ?? database;
    } catch {
      // ya confirmamos ok arriba
    }
    console.log(
      `Backend listo en ${apiUrl(apiPort)} (BD: ${database}). Frontend :${frontendPort} proxy /api -> :${apiPort}.`,
    );
    process.exit(0);
  }

  if (attempt === 1) {
    console.log(
      `Esperando al backend en ${healthUrl}...\n` +
        `(La BD no escucha en :${frontendPort}; Vite redirige /api al API en :${apiPort}.)`,
    );
  } else if (attempt % 20 === 0) {
    const elapsedSec = Math.round((attempt * delayMs) / 1000);
    console.log(`... aun esperando al backend (${elapsedSec}s)`);
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

console.error(
  `El backend no respondio en ${healthUrl} tras ${(maxAttempts * delayMs) / 1000}s.\n` +
    'En Windows, revisa si hay un proceso colgado en el puerto:\n' +
    `  netstat -ano | findstr ":${apiPort}"\n` +
    '  taskkill /PID <pid> /F\n' +
    'Luego vuelve a ejecutar: npm run dev\n' +
    `O revisa que backend/data/db.json exista (npm run setup-db).`,
);
process.exit(1);
