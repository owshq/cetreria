import http from 'node:http';
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
const requestTimeoutMs = 3000;

function probeHealth(): Promise<{ ok: boolean; database?: string }> {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: requestTimeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false });
          return;
        }
        try {
          const body = JSON.parse(data) as { database?: string };
          resolve({ ok: true, database: body.database });
        } catch {
          resolve({ ok: true });
        }
      });
    });
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<number> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await probeHealth();
    if (result.ok) {
      const database = result.database ?? 'json';
      console.log(
        `Backend listo en ${apiUrl(apiPort)} (BD: ${database}). Frontend :${frontendPort} proxy /api -> :${apiPort}.`,
      );
      return 0;
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

    await sleep(delayMs);
  }

  console.error(
    `El backend no respondio en ${healthUrl} tras ${(maxAttempts * delayMs) / 1000}s.\n` +
      'En Windows, revisa si hay un proceso colgado en el puerto:\n' +
      `  netstat -ano | findstr ":${apiPort}"\n` +
      '  taskkill /PID <pid> /F\n' +
      'Luego vuelve a ejecutar: npm run dev\n' +
      `O revisa que backend/data/db.json exista (npm run setup-db).`,
  );
  return 1;
}

const exitCode = await main();
process.exitCode = exitCode;
