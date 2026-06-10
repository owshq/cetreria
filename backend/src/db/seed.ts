import bcrypt from 'bcryptjs';
import type { Activity, CalendarEvent, Client, Document, MonthlyReport, User } from '@shared/types';
import { DEFAULT_ACTIVITY_TYPES } from '../../../shared/activityTypes.js';
import { HALCONERIA_INVOICE_CONCEPTS } from '../../../shared/halconeriaInvoiceConcepts.js';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { countDocs, insertDoc, withDbTransaction } from './repository.js';
import { HALCONERIA_USER_SPECS, toSeedUser } from './halconeriaUsers.js';
import {
  SEED_ACTIVITY_IDS,
  SEED_CLIENT_IDS,
  SEED_DOCUMENT_IDS,
  SEED_EVENT_IDS,
  SEED_USER_IDS,
} from './seedIds.js';

const defaultUsers: User[] = HALCONERIA_USER_SPECS.map((spec) =>
  toSeedUser(SEED_USER_IDS[spec.key], spec),
);

const defaultClients: Client[] = [
  {
    id: SEED_CLIENT_IDS.industrias,
    workspaceId: DEFAULT_WORKSPACE_ID,
    groupId: '',
    name: 'Industrias Técnicas S.L.',
    email: 'contacto@industriastecnicas.com',
    phone: '+34 91 234 5678',
    address: 'Calle Principal 123, Madrid',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    website: 'https://www.industriastecnicas.com',
    technicalInfo: 'Sistema de control automático - Modelo XR-2000',
    observations: [],
    status: 'active',
    createdAt: '2024-01-15',
  },
  {
    id: SEED_CLIENT_IDS.comercial,
    workspaceId: DEFAULT_WORKSPACE_ID,
    groupId: '',
    name: 'Comercial Distribuidora',
    email: 'info@comercialdist.com',
    phone: '+34 93 567 8901',
    address: 'Avenida Industrial 45, Barcelona',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    website: '',
    technicalInfo: 'Instalación eléctrica de baja tensión',
    observations: [],
    status: 'active',
    createdAt: '2024-02-20',
  },
  {
    id: SEED_CLIENT_IDS.almacenes,
    workspaceId: DEFAULT_WORKSPACE_ID,
    groupId: '',
    name: 'Almacenes del Norte',
    email: 'almacenes@norte.com',
    phone: '+34 94 321 0987',
    address: 'Polígono Norte 67, Bilbao',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    website: '',
    technicalInfo: 'Sistema de climatización industrial',
    observations: [],
    status: 'active',
    createdAt: '2024-03-10',
  },
];

const defaultActivities: Activity[] = [
  {
    id: SEED_ACTIVITY_IDS.revision,
    workspaceId: DEFAULT_WORKSPACE_ID,
    clientId: SEED_CLIENT_IDS.industrias,
    userId: SEED_USER_IDS.sara,
    date: '2026-04-05',
    type: 'at-1',
    description: 'Revisión trimestral del sistema de control. Todo funcionando correctamente.',
    hours: 3,
    attachments: [],
    createdAt: '2026-04-05T10:30:00',
  },
  {
    id: SEED_ACTIVITY_IDS.instalacion,
    workspaceId: DEFAULT_WORKSPACE_ID,
    clientId: SEED_CLIENT_IDS.comercial,
    userId: SEED_USER_IDS.raul,
    date: '2026-04-07',
    type: 'at-2',
    description: 'Instalación de nuevo cuadro eléctrico en almacén 2.',
    hours: 6,
    attachments: [],
    createdAt: '2026-04-07T09:00:00',
  },
  {
    id: SEED_ACTIVITY_IDS.certificacion,
    workspaceId: DEFAULT_WORKSPACE_ID,
    clientId: SEED_CLIENT_IDS.comercial,
    userId: SEED_USER_IDS.juan,
    date: '2026-04-12',
    type: 'at-4',
    description: 'Certificación anual de instalación',
    hours: 4,
    attachments: [],
    createdAt: '2026-04-12T10:00:00',
  },
];

const defaultEvents: CalendarEvent[] = [
  {
    id: SEED_EVENT_IDS.mantenimiento,
    workspaceId: DEFAULT_WORKSPACE_ID,
    title: 'Mantenimiento - Industrias Técnicas',
    description: 'Revisión mensual programada',
    date: '2026-04-10',
    startTime: '09:00',
    endTime: '12:00',
    assignedTo: [SEED_USER_IDS.sara],
    createdBy: SEED_USER_IDS.admin,
    clientId: SEED_CLIENT_IDS.industrias,
    activityId: SEED_ACTIVITY_IDS.revision,
    history: [{ action: 'Creado', user: 'Admin', timestamp: '2026-04-01T10:00:00' }],
  },
  {
    id: SEED_EVENT_IDS.certificacion,
    workspaceId: DEFAULT_WORKSPACE_ID,
    title: 'Inspección - Comercial Distribuidora',
    description: 'Certificación anual de instalación',
    date: '2026-04-12',
    startTime: '10:00',
    endTime: '14:00',
    assignedTo: [SEED_USER_IDS.juan],
    createdBy: SEED_USER_IDS.admin,
    clientId: SEED_CLIENT_IDS.comercial,
    activityId: SEED_ACTIVITY_IDS.certificacion,
    history: [{ action: 'Creado', user: 'Admin', timestamp: '2026-04-02T11:00:00' }],
  },
];

const defaultDocuments: Document[] = [
  {
    id: SEED_DOCUMENT_IDS.factura,
    workspaceId: DEFAULT_WORKSPACE_ID,
    type: 'invoice',
    number: 'F-2026-001',
    clientId: SEED_CLIENT_IDS.industrias,
    activityId: SEED_ACTIVITY_IDS.revision,
    date: '2026-03-31',
    items: [
      {
        name: HALCONERIA_INVOICE_CONCEPTS[0].label,
        description: '',
        quantity: 1,
        price: 350,
      },
      {
        name: HALCONERIA_INVOICE_CONCEPTS[1].label,
        description: '',
        quantity: 1,
        price: 120,
      },
    ],
    total: 485,
    status: 'paid',
    createdAt: '2026-03-31',
  },
  {
    id: SEED_DOCUMENT_IDS.albaran,
    workspaceId: DEFAULT_WORKSPACE_ID,
    type: 'delivery-note',
    number: 'A-2026-001',
    clientId: SEED_CLIENT_IDS.comercial,
    activityId: SEED_ACTIVITY_IDS.instalacion,
    date: '2026-04-07',
    items: [
      {
        name: HALCONERIA_INVOICE_CONCEPTS[7].label,
        description: '',
        quantity: 2,
        price: 360,
      },
    ],
    total: 720,
    status: 'sent',
    createdAt: '2026-04-07',
  },
];

async function hashUserPasswords(users: User[]): Promise<User[]> {
  return Promise.all(
    users.map(async (user) => ({
      ...user,
      password: await bcrypt.hash(user.password, 10),
    })),
  );
}

export async function seedIfEmpty() {
  const userCount = await countDocs(DB_NAMES.users);
  if (userCount > 0) return;

  const users = await hashUserPasswords(defaultUsers);
  await withDbTransaction(async () => {
    for (const user of users) await insertDoc(DB_NAMES.users, user);
    for (const type of DEFAULT_ACTIVITY_TYPES.map((item) => ({
      ...item,
      workspaceId: DEFAULT_WORKSPACE_ID,
    }))) {
      await insertDoc(DB_NAMES.activityTypes, type);
    }
    for (const client of defaultClients) await insertDoc(DB_NAMES.clients, client);
    for (const activity of defaultActivities) await insertDoc(DB_NAMES.activities, activity);
    for (const event of defaultEvents) await insertDoc(DB_NAMES.events, event);
    for (const document of defaultDocuments) await insertDoc(DB_NAMES.documents, document);
  });

  console.log('Base de datos inicializada con datos de ejemplo.');
}

export async function seedReports(reports: MonthlyReport[]) {
  await withDbTransaction(async () => {
    for (const report of reports) {
      await insertDoc(DB_NAMES.reports, report);
    }
  });
}
