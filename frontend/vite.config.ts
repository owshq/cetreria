import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { PORTS, apiUrl } from '../shared/ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(rootDir, '.env') });

const apiPort = Number(process.env.PORT ?? PORTS.api);
const frontendPort = Number(process.env.FRONTEND_PORT ?? PORTS.frontend);

export default defineConfig({
  root: __dirname,
  envDir: rootDir,
  cacheDir: path.join(rootDir, 'node_modules/.vite'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared/types': path.resolve(rootDir, 'shared/index.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiUrl(apiPort),
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
