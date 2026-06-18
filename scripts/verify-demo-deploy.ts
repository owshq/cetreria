/**
 * Smoke test de demo en produccion (API).
 * Uso: npx tsx scripts/verify-demo-deploy.ts
 *      DEMO_URL=https://cetreria.vercel.app npx tsx scripts/verify-demo-deploy.ts
 */
import assert from 'node:assert/strict';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import {
  HALCONERIA_USER_PASSWORDS_BY_EMAIL,
} from '@shared/types';

const BASE = (process.env.DEMO_URL ?? 'https://cetreria.vercel.app').replace(/\/$/, '');

const ADMIN_EMAIL = 'admin@faunayhalconeros.com';
const OPERATOR_EMAIL = 'sara@faunayhalconeros.com';

type LoginResponse = {
  token: string;
  user: { id: string; role: string; email: string };
  workspaces: { id: string }[];
};

type Client = { id: string; name: string; email: string };
type ActivityType = { id: string; name: string };
type Document = {
  id: string;
  type: string;
  number: string;
  pdfKey?: string;
  pdfSource?: string;
};
type Bootstrap = { documents: Document[]; clients: Client[] };

function log(step: string, ok: boolean, detail?: string) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ''}`);
}

async function request(
  path: string,
  options: RequestInit & { token?: string; workspaceId?: string } = {},
) {
  const headers = new Headers(options.headers);
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  if (options.workspaceId) headers.set('X-Workspace-Id', options.workspaceId);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { token: _t, workspaceId: _w, ...fetchOpts } = options;
  return fetch(`${BASE}${path}`, { ...fetchOpts, headers });
}

async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`login ${email}: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<LoginResponse>;
}

async function main() {
  // 0. Auditoria env (desde fuera: vercel env ls)
  console.log('Auditoria Vercel (manual): JWT_SECRET + VITE_API_URL deben existir en Production.');
  console.log(
    'Auditoria Vercel (manual): BLOB_READ_WRITE_TOKEN (Blob) o S3_BUCKET+AWS_* para persistencia.\n',
  );

  let failed = 0;

  const check = (step: string, ok: boolean, detail?: string) => {
    log(step, ok, detail);
    if (!ok) failed += 1;
  };

  // 1. Health
  try {
    const health = await request('/api/health');
    const body = (await health.json()) as { ok: boolean; database: string };
    check('GET /api/health', health.ok && body.ok === true, JSON.stringify(body));
  } catch (err) {
    check('GET /api/health', false, String(err));
  }

  // 2. Login admin + operario
  let adminSession: LoginResponse | null = null;
  let operatorSession: LoginResponse | null = null;
  try {
    adminSession = await login(ADMIN_EMAIL, HALCONERIA_USER_PASSWORDS_BY_EMAIL[ADMIN_EMAIL]!);
    check(
      'Login admin',
      adminSession.user.role === 'admin',
      adminSession.user.email,
    );
  } catch (err) {
    check('Login admin', false, String(err));
  }

  try {
    operatorSession = await login(
      OPERATOR_EMAIL,
      HALCONERIA_USER_PASSWORDS_BY_EMAIL[OPERATOR_EMAIL]!,
    );
    check(
      'Login operario',
      operatorSession.user.role === 'user',
      operatorSession.user.email,
    );
  } catch (err) {
    check('Login operario', false, String(err));
  }

  if (!adminSession || !operatorSession) {
    console.log(`\n=== Resultado: ${failed} fallo(s) — abortando flujos posteriores ===\n`);
    process.exit(1);
  }

  const workspaceId =
    adminSession.workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID)?.id ??
    adminSession.workspaces[0]?.id ??
    DEFAULT_WORKSPACE_ID;

  const adminToken = adminSession.token;
  const operatorToken = operatorSession.token;
  const adminUserId = adminSession.user.id;
  const operatorUserId = operatorSession.user.id;

  // 3. Bootstrap admin — clientes
  let clientId = '';
  try {
    const res = await request('/api/documents/bootstrap', {
      token: adminToken,
      workspaceId,
    });
    const body = (await res.json()) as Bootstrap;
    check('Bootstrap admin', res.ok && body.clients.length > 0, `${body.clients.length} contactos`);
    clientId = body.clients[0]!.id;
  } catch (err) {
    check('Bootstrap admin', false, String(err));
  }

  if (!clientId) {
    console.log(`\n=== Resultado: ${failed} fallo(s) ===\n`);
    process.exit(1);
  }

  // 4. Crear actividad (admin)
  let activityId = '';
  const today = new Date().toISOString().slice(0, 10);
  try {
    const typesRes = await request('/api/activity-types', { token: adminToken, workspaceId });
    const types = (await typesRes.json()) as ActivityType[];
    const formationType = types.find((t) => t.id === 'at-6' || t.name === 'Formación');
    const activityTypeId = formationType?.id ?? types[0]?.id ?? 'at-6';

    const res = await request('/api/activities', {
      method: 'POST',
      token: adminToken,
      workspaceId,
      body: JSON.stringify({
        clientId,
        userId: adminUserId,
        date: today,
        type: activityTypeId,
        description: `Smoke demo ${Date.now()}`,
        hours: 2,
        attachments: [],
        assigneeSlots: [
          {
            userId: operatorUserId,
            shift: 'M',
            startTime: '09:00',
            endTime: '11:00',
          },
        ],
      }),
    });
    const activity = (await res.json()) as { id: string };
    activityId = activity.id;
    check('Crear actividad', res.status === 201 && Boolean(activityId), activityId);

    const visibleRes = await request('/api/activities', { token: operatorToken, workspaceId });
    const visible = (await visibleRes.json()) as { id: string }[];
    check(
      'Operario ve actividad creada',
      visibleRes.ok && visible.some((a) => a.id === activityId),
      `${visible.length} actividades visibles`,
    );
  } catch (err) {
    check('Crear actividad', false, String(err));
  }

  // 5. Albaran (operario)
  let deliveryNoteId = '';
  try {
    const res = await request('/api/documents', {
      method: 'POST',
      token: operatorToken,
      workspaceId,
      body: JSON.stringify({
        type: 'delivery-note',
        clientId,
        activityId: activityId || undefined,
        date: today,
        items: [{ name: 'Servicio demo', description: 'Linea smoke', quantity: 1, price: 100 }],
        total: 100,
        status: 'draft',
      }),
    });
    const doc = (await res.json()) as Document & { error?: string };
    deliveryNoteId = doc.id;
    check(
      'Crear albaran (operario)',
      res.status === 201 && doc.type === 'delivery-note',
      res.status === 201 ? doc.number : `${res.status} ${doc.error ?? JSON.stringify(doc)}`,
    );
  } catch (err) {
    check('Crear albaran (operario)', false, String(err));
  }

  // 6. PDF albaran
  if (deliveryNoteId) {
    try {
      const res = await request(`/api/documents/${deliveryNoteId}/pdf`, {
        token: operatorToken,
        workspaceId,
      });
      const buf = await res.arrayBuffer();
      const isPdf =
        res.ok &&
        buf.byteLength > 500 &&
        res.headers.get('content-type')?.includes('pdf');
      check('PDF albaran', Boolean(isPdf), `${buf.byteLength} bytes`);
    } catch (err) {
      check('PDF albaran', false, String(err));
    }
  }

  // 7. Factura (admin)
  let invoiceId = '';
  try {
    const res = await request('/api/documents', {
      method: 'POST',
      token: adminToken,
      workspaceId,
      body: JSON.stringify({
        type: 'invoice',
        clientId,
        activityId: activityId || undefined,
        date: today,
        items: [{ name: 'Servicio demo', description: 'Linea smoke factura', quantity: 1, price: 121 }],
        total: 121,
        taxRate: 21,
        status: 'draft',
      }),
    });
    const doc = (await res.json()) as Document & { error?: string };
    invoiceId = doc.id;
    check(
      'Crear factura (admin)',
      res.status === 201 && doc.type === 'invoice',
      res.status === 201 ? doc.number : `${res.status} ${doc.error ?? JSON.stringify(doc)}`,
    );
  } catch (err) {
    check('Crear factura (admin)', false, String(err));
  }

  // 8. PDF factura
  if (invoiceId) {
    try {
      const res = await request(`/api/documents/${invoiceId}/pdf`, {
        token: adminToken,
        workspaceId,
      });
      const buf = await res.arrayBuffer();
      const isPdf =
        res.ok &&
        buf.byteLength > 500 &&
        res.headers.get('content-type')?.includes('pdf');
      check('PDF factura', Boolean(isPdf), `${buf.byteLength} bytes`);
    } catch (err) {
      check('PDF factura', false, String(err));
    }
  }

  // 9. Operario no ve facturas en bootstrap
  try {
    const res = await request('/api/documents/bootstrap', {
      token: operatorToken,
      workspaceId,
    });
    const body = (await res.json()) as Bootstrap;
    const hasInvoices = body.documents.some((d) => d.type === 'invoice');
    check('Operario sin facturas en bootstrap', res.ok && !hasInvoices, `docs=${body.documents.length}`);
  } catch (err) {
    check('Operario sin facturas en bootstrap', false, String(err));
  }

  // 10. Persistencia PDF (segunda lectura)
  if (deliveryNoteId) {
    try {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await request(`/api/documents/${deliveryNoteId}/pdf`, {
        token: operatorToken,
        workspaceId,
      });
      const buf = await res.arrayBuffer();
      check(
        'PDF albaran persiste (2a lectura)',
        res.ok && buf.byteLength > 500,
        res.ok ? `${buf.byteLength} bytes` : `HTTP ${res.status}`,
      );
    } catch (err) {
      check('PDF albaran persiste (2a lectura)', false, String(err));
    }
  }

  // 11. Persistencia remota (indirecta via pdfKey en documento)
  if (deliveryNoteId) {
    try {
      const res = await request(`/api/documents/${deliveryNoteId}`, {
        token: adminToken,
        workspaceId,
      });
      const doc = (await res.json()) as Document;
      const hasPdfKey = Boolean(doc.pdfKey);
      check(
        'Documento con pdfKey (Blob/S3/local)',
        res.ok && hasPdfKey,
        hasPdfKey ? doc.pdfKey! : 'sin clave — conectar Blob store o S3 en Vercel',
      );
    } catch (err) {
      check('Documento con pdfKey', false, String(err));
    }
  }

  console.log(`\n=== Resultado: ${failed} fallo(s) ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
