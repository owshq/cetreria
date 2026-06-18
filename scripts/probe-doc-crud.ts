/**
 * Prueba rapida CRUD documentos en produccion.
 * Uso: npx tsx scripts/probe-doc-crud.ts
 */
import {
  DEFAULT_WORKSPACE_ID,
  HALCONERIA_USER_PASSWORDS_BY_EMAIL,
} from '@shared/types';

const BASE = (process.env.DEMO_URL ?? 'https://cetreria.vercel.app').replace(/\/$/, '');
const ADMIN_EMAIL = 'admin@faunayhalconeros.com';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: HALCONERIA_USER_PASSWORDS_BY_EMAIL[ADMIN_EMAIL],
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  return res.json() as Promise<{ token: string; workspaces: { id: string }[] }>;
}

async function main() {
  const session = await login();
  const workspaceId =
    session.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)?.id ??
    session.workspaces[0]?.id ??
    DEFAULT_WORKSPACE_ID;

  const headers = {
    Authorization: `Bearer ${session.token}`,
    'X-Workspace-Id': workspaceId,
    'Content-Type': 'application/json',
  };

  const bootRes = await fetch(`${BASE}/api/documents/bootstrap`, { headers });
  const boot = (await bootRes.json()) as {
    documents: { id: string; number: string; notes?: string }[];
    clients: { id: string }[];
  };
  console.log('bootstrap', bootRes.status, 'docs=', boot.documents?.length ?? 0);

  const marker = `probe-${Date.now()}`;
  const createRes = await fetch(`${BASE}/api/documents`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'delivery-note',
      clientId: boot.clients[0]!.id,
      date: new Date().toISOString().slice(0, 10),
      items: [{ name: 'Probe', quantity: 1, price: 10 }],
      total: 10,
      taxRate: 21,
      status: 'draft',
      notes: marker,
    }),
  });
  const created = (await createRes.json()) as { id?: string; error?: string; number?: string };
  console.log('create', createRes.status, created.id ?? created.error);

  if (!created.id) process.exit(1);

  const editRes = await fetch(`${BASE}/api/documents/${created.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ notes: `${marker}-edited` }),
  });
  const edited = (await editRes.json()) as { notes?: string; error?: string };
  console.log('edit', editRes.status, edited.notes ?? edited.error);

  await new Promise((r) => setTimeout(r, 2500));

  const getRes = await fetch(`${BASE}/api/documents/${created.id}`, { headers });
  const fetched = (await getRes.json()) as { notes?: string; error?: string };
  console.log('get after wait', getRes.status, fetched.notes ?? fetched.error);

  const pdfRes = await fetch(`${BASE}/api/documents/${created.id}/pdf`, { headers });
  console.log('pdf', pdfRes.status, pdfRes.headers.get('content-type'));

  const delRes = await fetch(`${BASE}/api/documents/${created.id}`, {
    method: 'DELETE',
    headers,
  });
  console.log('delete', delRes.status);

  const goneRes = await fetch(`${BASE}/api/documents/${created.id}`, { headers });
  console.log('get deleted', goneRes.status, (await goneRes.json()) as { error?: string });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
