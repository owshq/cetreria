import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'api/index.js');

await esbuild.build({
  entryPoints: [path.join(root, 'backend/src/vercel/apiEntry.ts')],
  outfile: outFile,
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

console.log(`API bundle listo: ${outFile}`);
