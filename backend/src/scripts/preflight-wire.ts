import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  ClientGroup,
  Document,
  User,
  Workspace,
} from '@shared/types';
import {
  DEFAULT_WORKSPACE_ID,
  documentPdfKey,
  legacyDocumentPdfKey,
} from '@shared/types';
import { config, DB_NAMES } from '../config.js';
import { bootstrapDb } from '../db/bootstrapDb.js';
import { assertPreflightDbIntegrity } from '../db/preflightIntegrity.js';
import { listAll } from '../db/repository.js';
import { initJsonDb } from '../db/store.js';

const checkOnly = process.argv.includes('--check');

if (checkOnly) {
  await initJsonDb();
} else {
  await bootstrapDb();
}

const sampleDoc: Document = {
  id: '00000000-0000-4000-8000-000000000099',
  workspaceId: DEFAULT_WORKSPACE_ID,
  type: 'invoice',
  number: 'F-PREFLIGHT',
  clientId: '00000000-0000-4000-8000-000000000098',
  date: '2026-01-01',
  items: [],
  total: 0,
  status: 'draft',
  createdAt: '2026-01-01',
};

const pdfKey = documentPdfKey(sampleDoc);
const legacyKey = legacyDocumentPdfKey(sampleDoc);

if (!pdfKey.startsWith(`workspaces/${DEFAULT_WORKSPACE_ID}/documents/`)) {
  throw new Error(`documentPdfKey inválida: ${pdfKey}`);
}

const label = checkOnly ? 'PREFLIGHT CHECK' : 'PREFLIGHT';

console.log(`=== ${label}: shared/documentPdf (imports ESM OK) ===`);
console.log({ pdfKey, legacyKey });

const dbPath = config.dbPath;
if (checkOnly && !existsSync(dbPath)) {
  console.log(`=== ${label}: sin db.json (${dbPath}), omitiendo integridad ===`);
} else {
  const clients = await listAll<Client>(DB_NAMES.clients);
  const events = await listAll<CalendarEvent>(DB_NAMES.events);
  const activities = await listAll<Activity>(DB_NAMES.activities);
  const documents = await listAll<Document>(DB_NAMES.documents);
  const users = await listAll<User>(DB_NAMES.users);
  const workspaces = await listAll<Workspace>(DB_NAMES.workspaces);
  const clientGroups = await listAll<ClientGroup>(DB_NAMES.clientGroups);
  const activityTypes = await listAll<ActivityType>(DB_NAMES.activityTypes);

  assertPreflightDbIntegrity({
    clients,
    activities,
    events,
    documents,
    users,
    workspaces,
    clientGroups,
    activityTypes,
  });
  console.log(`=== ${label}: integridad referencial OK ===`);

  if (!checkOnly) {
    console.log('=== PREFLIGHT: eventos ↔ actividades ===');
    for (const event of events) {
      const activity = activities.find((item) => item.id === event.activityId);
      console.log({
        event: event.title,
        activityId: event.activityId ?? '(sin vínculo)',
        activityType: activity?.type ?? '(sin actividad)',
        activityDesc: activity?.description?.slice(0, 40) ?? '—',
      });
    }
  }

  const legacyPdfKeys = documents.filter(
    (doc) =>
      doc.pdfKey &&
      !doc.pdfKey.startsWith('workspaces/') &&
      doc.pdfKey === legacyDocumentPdfKey(doc),
  );
  if (legacyPdfKeys.length > 0) {
    console.warn(
      `=== ${label}: documentos con pdfKey legacy (se migran al abrir) ===`,
      legacyPdfKeys.map((doc) => doc.number),
    );
  }
}

console.log(`=== ${label} OK ===`);

const appSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app.ts'),
  'utf8',
);
const serverSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server.ts'),
  'utf8',
);
if (!appSource.includes("app.use('/api/workspaces', workspacesRoutes)")) {
  throw new Error('app.ts no monta /api/workspaces');
}
if (!serverSource.includes('bootstrapDb()')) {
  throw new Error('server.ts no usa bootstrapDb unificado');
}
console.log('=== PREFLIGHT: /api/workspaces y bootstrapDb() registrados ===');
