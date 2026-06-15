/**
 * Captura pantallas principales del SaaS para documentacion.
 * Uso: node scripts/capture-saas-screenshots.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'docs', 'capturas-saas');
const BASE = 'http://localhost:3000';
const LOGIN = { email: 'admin@faunayhalconeros.com', password: 'admin123' };

const ROUTES = [
  { file: '01-login', url: '/login', auth: false },
  { file: '02-inicio-dashboard', url: '/home', auth: true },
  { file: '03-actividades-calendario', url: '/activities', auth: true },
  {
    file: '04-actividad-detalle-modal',
    url: '/activities/c6ab237a-b266-49b7-9ca5-9cdc2df21c8e',
    auth: true,
    waitMs: 1200,
  },
  { file: '05-nueva-actividad-modal', url: '/activities/new', auth: true, waitMs: 1200 },
  { file: '06-clientes-lista', url: '/clients', auth: true },
  {
    file: '07-cliente-detalle',
    url: '/clients/6220c3fa-8a34-4bd0-88cf-4e733677cbb0',
    auth: true,
    waitMs: 1500,
  },
  { file: '08-documentos-lista', url: '/docs', auth: true },
  {
    file: '09-documento-detalle',
    url: '/docs/8f3a2c1e-4b9d-4a2f-9e18-6d4f7a2b9c01',
    auth: true,
    waitMs: 2000,
  },
  { file: '10-reportes-lista', url: '/reports', auth: true, waitMs: 1500 },
  {
    file: '11-reporte-detalle',
    url: '/reports/6f3a08a9-d8b3-4613-a724-cd3d56484b92',
    auth: true,
    waitMs: 2500,
  },
  { file: '12-configuracion', url: '/settings', auth: true, waitMs: 1200 },
  { file: '13-ayuda', url: '/help', auth: true, waitMs: 1200 },
  {
    file: '14-actividades-todos-usuarios',
    url: '/activities?userId=all',
    auth: true,
    waitMs: 1500,
  },
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', LOGIN.email);
  await page.fill('#password', LOGIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function capture(page, { file, url, waitMs = 900 }) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs);
  const target = path.join(OUT_DIR, `${file}.png`);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`OK ${file}.png`);
}

async function captureNotificationsPopup(page) {
  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const bell = page.locator('[aria-label*="Notific"], button:has(svg.lucide-bell)').first();
  if (await bell.count()) {
    await bell.click();
    await page.waitForTimeout(700);
  }
  await page.screenshot({
    path: path.join(OUT_DIR, '15-notificaciones-panel.png'),
    fullPage: false,
  });
  console.log('OK 15-notificaciones-panel.png');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'es-ES',
  });
  const page = await context.newPage();

  let loggedIn = false;
  for (const route of ROUTES) {
    if (route.auth && !loggedIn) {
      await login(page);
      loggedIn = true;
    }
    if (!route.auth) {
      await capture(page, route);
      continue;
    }
    await capture(page, route);
  }

  if (loggedIn) {
    await captureNotificationsPopup(page);
  }

  await browser.close();
  console.log(`\nCapturas guardadas en: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
