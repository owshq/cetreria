import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, '.vercel/output');
const staticDir = path.join(outputRoot, 'static');
const funcDir = path.join(outputRoot, 'functions/api.func');

function cleanOutput() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(staticDir, { recursive: true });
  fs.mkdirSync(funcDir, { recursive: true });
}

function buildFrontend() {
  execSync(
    `npx vite build --config frontend/vite.config.ts --outDir "${staticDir}" --emptyOutDir`,
    {
    cwd: root,
    stdio: 'inherit',
      env: { ...process.env },
    },
  );
}

async function buildApiFunction() {
  await esbuild.build({
    entryPoints: [path.join(root, 'backend/src/vercel/apiEntry.ts')],
    outfile: path.join(funcDir, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    sourcemap: true,
    logLevel: 'info',
    alias: {
      '@shared/types': path.join(root, 'shared/index.ts'),
    },
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    external: ['@vercel/node'],
  });

  fs.copyFileSync(path.join(root, 'backend/data/db.json'), path.join(funcDir, 'seed-db.json'));

  fs.writeFileSync(
    path.join(funcDir, '.vc-config.json'),
    `${JSON.stringify(
      {
        runtime: 'nodejs24.x',
        handler: 'index.js',
        launcherType: 'Nodejs',
        maxDuration: 60,
        memory: 1024,
      },
      null,
      2,
    )}\n`,
  );
}

function writeOutputConfig() {
  fs.writeFileSync(
    path.join(outputRoot, 'config.json'),
    `${JSON.stringify(
      {
        version: 3,
        routes: [
          { handle: 'filesystem' },
          { src: '/api/(.*)', dest: '/api' },
          { src: '/(.*)', dest: '/index.html' },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

cleanOutput();
buildFrontend();
await buildApiFunction();
writeOutputConfig();

console.log('Build Vercel listo en .vercel/output');
