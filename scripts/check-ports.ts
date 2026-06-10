import net from 'node:net';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORTS, apiUrl } from '../shared/ports.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env') });

const apiPort = Number(process.env.PORT ?? PORTS.api);
const frontendPort = Number(process.env.FRONTEND_PORT ?? PORTS.frontend);

function isPortFreeOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function isPortFree(port: number): Promise<boolean> {
  if (!(await isPortFreeOnHost(port, '127.0.0.1'))) {
    return false;
  }
  try {
    return await isPortFreeOnHost(port, '::1');
  } catch {
    return true;
  }
}

async function isApiHealthy(port: number): Promise<boolean> {
  try {
    const response = await fetch(`${apiUrl(port)}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const checks = [
  { label: 'API (PORT)', port: apiPort, envVar: 'PORT' },
  { label: 'Frontend (FRONTEND_PORT)', port: frontendPort, envVar: 'FRONTEND_PORT' },
];

const blocked: typeof checks = [];
let apiAlreadyRunning = false;

for (const check of checks) {
  if (await isPortFree(check.port)) {
    continue;
  }

  if (check.port === apiPort && (await isApiHealthy(apiPort))) {
    apiAlreadyRunning = true;
    continue;
  }

  blocked.push(check);
}

if (blocked.length === 0) {
  if (apiAlreadyRunning) {
    console.log(
      `API ya activa en ${apiUrl(apiPort)}. Frontend :${frontendPort} (proxy /api en dev).`,
    );
  } else {
    console.log(
      `Puertos libres: frontend :${frontendPort}, API :${apiPort} (proxy /api en dev).`,
    );
  }
  process.exit(0);
}

console.error('No se puede iniciar: puertos en uso:\n');
for (const check of blocked) {
  console.error(`  - ${check.label} = ${check.port}`);
}
console.error(
  '\nEn Windows, revisa procesos:\n' +
    `  netstat -ano | findstr ":${frontendPort}"\n` +
    `  netstat -ano | findstr ":${apiPort}"\n` +
    '  taskkill /PID <pid> /F\n' +
    '\nO cambia los puertos en .env (FRONTEND_PORT y PORT deben ser distintos).',
);
process.exit(1);
