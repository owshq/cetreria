/**
 * Prueba E2E del modal de importación con Chrome del sistema.
 * Ejecutar: npx tsx --tsconfig frontend/tsconfig.json scripts/verify-import-ui-e2e.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const apiBase = 'http://localhost:3001/api';
const frontendBase = 'http://localhost:3000';

async function loginAsAdmin(): Promise<{ token: string; user: { id: string; name: string; email: string; role: string } }> {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@faunayhalconeros.com', password: 'admin123' }),
  });
  if (!res.ok) throw new Error(`Login falló: ${res.status}`);
  return (await res.json()) as { token: string; user: { id: string; name: string; email: string; role: string } };
}

async function main() {
  const { token, user } = await loginAsAdmin();
  const unique = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-import-e2e-'));
  const csvPath = path.join(tmpDir, 'clientes-test.csv');
  fs.writeFileSync(
    csvPath,
    `Cliente;Contacto;Dirección;Estado\nUI E2E ${unique};e2e-ui-${unique}@test.com | +34 633 444 555;Calle UI 1;Activo\n`,
    'utf8',
  );

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.evaluateOnNewDocument((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('user', JSON.stringify(auth.user));
  }, { token, user });

  await page.goto(`${frontendBase}/clients`, { waitUntil: 'networkidle0' });

  const importBtn = await page.waitForSelector('[aria-label="Importar clientes CSV"]');
  if (!importBtn) throw new Error('Botón Importar no encontrado');
  console.log('✓ Botón Importar CSV visible');

  await importBtn.click();
  await page.waitForSelector('h3');
  const title = await page.$eval('h3', (el) => el.textContent);
  if (!title?.includes('Importar clientes')) throw new Error('Modal no abierto');
  console.log('✓ Modal de importación abierto');

  const fileInput = await page.$('input[type="file"]');
  if (!fileInput) throw new Error('Input file no encontrado');
  const accept = await fileInput.evaluate((el) => el.getAttribute('accept'));
  if (!accept?.includes('.csv')) throw new Error(`accept incorrecto: ${accept}`);
  console.log('✓ Input file oculto con accept CSV');

  let fileInputClicked = false;
  await page.evaluate(() => {
    const input = document.querySelector('input[type="file"]');
    input?.addEventListener('click', () => {
      (window as unknown as { __fileInputClicked?: boolean }).__fileInputClicked = true;
    });
  });

  await page.click('text/Arrastra un archivo CSV');
  await new Promise((r) => setTimeout(r, 300));
  fileInputClicked = await page.evaluate(
    () => (window as unknown as { __fileInputClicked?: boolean }).__fileInputClicked === true,
  );
  if (!fileInputClicked) throw new Error('Clic en dropzone no dispara fileInput.click()');
  console.log('✓ Clic en dropzone abre selector de archivos (fileInput.click)');

  await fileInput.uploadFile(csvPath);
  await page.waitForFunction(() => document.body.textContent?.includes('1 fila'));
  console.log('✓ Archivo subido, paso review activo');

  await page.waitForFunction(() => document.body.textContent?.includes('✓ Cliente'));
  console.log('✓ Columnas detectadas en vista previa');

  const importConfirm = await page.waitForSelector('button');
  const buttons = await page.$$('button');
  let clicked = false;
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => el.textContent ?? '');
    if (text.includes('Importar 1 cliente')) {
      await btn.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) throw new Error('Botón confirmar importación no encontrado');

  await page.waitForFunction(
    () => document.body.textContent?.includes('Importación completada'),
    { timeout: 15000 },
  );
  console.log('✓ Importación completada con mensaje de éxito');

  const closeButtons = await page.$$('button');
  for (const btn of closeButtons) {
    const text = await btn.evaluate((el) => el.textContent ?? '');
    if (text.trim() === 'Cerrar') {
      await btn.click();
      break;
    }
  }

  await page.waitForFunction(
    (name) => document.body.textContent?.includes(name),
    { timeout: 10000 },
    `UI E2E ${unique}`,
  );
  console.log('✓ Cliente importado visible en listado');

  const listRes = await fetch(`${apiBase}/clients`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const clients = (await listRes.json()) as { id: string; email: string }[];
  const imported = clients.find((c) => c.email === `e2e-ui-${unique}@test.com`);
  if (imported) {
    await fetch(`${apiBase}/clients/${imported.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('✓ Cliente de prueba eliminado');
  }

  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nE2E UI: todas las pruebas pasaron');
}

main().catch((e) => {
  console.error('✗ E2E UI falló:', e instanceof Error ? e.message : e);
  process.exit(1);
});
