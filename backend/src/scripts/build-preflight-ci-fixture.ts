import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { DEFAULT_ACTIVITY_TYPES } from '../../../shared/activityTypes.js';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  ClientGroup,
  Document,
  User,
  Workspace,
  WorkspaceMember,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { toSeedUser, halconeriaUserSpec } from '../db/halconeriaUsers.js';
import {
  SEED_ACTIVITY_IDS,
  SEED_CLIENT_IDS,
  SEED_DOCUMENT_IDS,
  SEED_EVENT_IDS,
  SEED_USER_IDS,
} from '../db/seedIds.js';

const WS = DEFAULT_WORKSPACE_ID;
const GROUP_ID = 'a1000001-0000-4000-8000-000000000001';
const MEMBER_ID = 'a1000002-0000-4000-8000-000000000002';

const emptyCollections = Object.fromEntries(
  Object.values(DB_NAMES).map((name) => [name, []]),
) as unknown as Record<(typeof DB_NAMES)[keyof typeof DB_NAMES], unknown[]>;

const adminUser = toSeedUser(SEED_USER_IDS.admin, halconeriaUserSpec('admin'));
const users: User[] = [
  {
    ...adminUser,
    password: await bcrypt.hash(adminUser.password, 4),
  },
];

const workspaces: Workspace[] = [
  {
    id: WS,
    name: 'Fixture CI',
    slug: 'fixture-ci',
    createdAt: '2026-01-01',
    defaultClientGroupSeeded: true,
  },
];

const workspaceMembers: WorkspaceMember[] = [
  {
    id: MEMBER_ID,
    workspaceId: WS,
    userId: SEED_USER_IDS.admin,
    role: 'owner',
    joinedAt: '2026-01-01',
  },
];

const clientGroups: ClientGroup[] = [
  {
    id: GROUP_ID,
    workspaceId: WS,
    name: 'Clientes',
    isDefault: true,
    createdAt: '2026-01-01',
  },
];

const clients: Client[] = [
  {
    id: SEED_CLIENT_IDS.industrias,
    workspaceId: WS,
    groupId: GROUP_ID,
    name: 'Contacto CI',
    email: 'contacto-ci@example.test',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    website: '',
    technicalInfo: '',
    observations: [],
    status: 'active',
    createdAt: '2026-01-01',
  },
];

const activityTypes: ActivityType[] = DEFAULT_ACTIVITY_TYPES.map((type) => ({
  ...type,
  workspaceId: WS,
}));

const activities: Activity[] = [
  {
    id: SEED_ACTIVITY_IDS.revision,
    workspaceId: WS,
    clientId: SEED_CLIENT_IDS.industrias,
    userId: SEED_USER_IDS.admin,
    date: '2026-04-05',
    type: 'at-1',
    description: 'Actividad de prueba CI',
    hours: 1,
    attachments: [],
    createdAt: '2026-04-05T10:00:00',
  },
];

const events: CalendarEvent[] = [
  {
    id: SEED_EVENT_IDS.mantenimiento,
    workspaceId: WS,
    title: 'Mantenimiento - Contacto CI',
    description: 'Evento de prueba CI',
    date: '2026-04-10',
    startTime: '09:00',
    endTime: '10:00',
    assignedTo: [SEED_USER_IDS.admin],
    createdBy: SEED_USER_IDS.admin,
    clientId: SEED_CLIENT_IDS.industrias,
    activityId: SEED_ACTIVITY_IDS.revision,
    history: [{ action: 'Creado', user: 'Admin', timestamp: '2026-04-01T10:00:00' }],
  },
];

const documents: Document[] = [
  {
    id: SEED_DOCUMENT_IDS.factura,
    workspaceId: WS,
    type: 'invoice',
    number: 'F-CI-001',
    clientId: SEED_CLIENT_IDS.industrias,
    activityId: SEED_ACTIVITY_IDS.revision,
    date: '2026-04-05',
    items: [{ name: 'Servicio', description: '', quantity: 1, price: 100 }],
    total: 100,
    status: 'draft',
    createdAt: '2026-04-05',
  },
];

const fixture = {
  ...emptyCollections,
  [DB_NAMES.users]: users,
  [DB_NAMES.workspaces]: workspaces,
  [DB_NAMES.workspaceMembers]: workspaceMembers,
  [DB_NAMES.clientGroups]: clientGroups,
  [DB_NAMES.clients]: clients,
  [DB_NAMES.activityTypes]: activityTypes,
  [DB_NAMES.activities]: activities,
  [DB_NAMES.events]: events,
  [DB_NAMES.documents]: documents,
};

const outPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/fixtures/preflight-ci.db.json',
);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
console.log(`Fixture CI escrito en ${outPath}`);
