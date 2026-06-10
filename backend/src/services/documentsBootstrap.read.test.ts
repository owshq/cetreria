import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  Activity,
  CalendarEvent,
  Client,
  Document,
  DocumentTypeGroup,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import type { DataStore } from '../db/dataStore.js';
import type { AuthUser } from '../middleware/auth.js';
import { readDocumentsBootstrapFromStore } from './documentsBootstrap.js';

const WORKSPACE_ID = 'ws-1';

const admin: AuthUser = { id: 'admin-1', name: 'Admin', email: 'admin@test.com', role: 'admin' };
const operator: AuthUser = {
  id: 'op-1',
  name: 'Operario',
  email: 'op@test.com',
  role: 'user',
};

const clientA: Client = {
  id: 'client-a',
  workspaceId: WORKSPACE_ID,
  groupId: 'group-1',
  name: 'Cliente A',
  email: 'a@test.com',
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
  createdAt: '2026-01-01T00:00:00.000Z',
};

const clientB: Client = {
  ...clientA,
  id: 'client-b',
  name: 'Cliente B',
  email: 'b@test.com',
};

const activityForOperator: Activity = {
  id: 'act-1',
  workspaceId: WORKSPACE_ID,
  clientId: clientA.id,
  userId: operator.id,
  date: '2026-06-01',
  description: 'Trabajo',
  hours: 2,
  type: 'work',
  attachments: [],
  createdAt: '2026-06-01T08:00:00.000Z',
};

const activityOtherClient: Activity = {
  ...activityForOperator,
  id: 'act-2',
  clientId: clientB.id,
  userId: 'other-op',
};

const events: CalendarEvent[] = [];

const publicDeliveryGroup: DocumentTypeGroup = {
  id: 'grp-alb',
  workspaceId: WORKSPACE_ID,
  documentType: 'delivery-note',
  name: 'Albaranes',
  isPublic: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const privateDeliveryGroup: DocumentTypeGroup = {
  ...publicDeliveryGroup,
  id: 'grp-alb-priv',
  isPublic: false,
};

const invoiceGroup: DocumentTypeGroup = {
  id: 'grp-inv',
  workspaceId: WORKSPACE_ID,
  documentType: 'invoice',
  name: 'Facturas',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function doc(overrides: Partial<Document> & Pick<Document, 'id' | 'type'>): Document {
  return {
    workspaceId: WORKSPACE_ID,
    number: 'DOC-1',
    clientId: clientA.id,
    date: '2026-06-01',
    items: [],
    total: 100,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    activityId: activityForOperator.id,
    ...overrides,
  };
}

type BootstrapCollections = {
  documents: Document[];
  clients: Client[];
  documentTypeGroups: DocumentTypeGroup[];
  activities: Activity[];
  events: CalendarEvent[];
};

function mockBootstrapStore(data: BootstrapCollections): Pick<DataStore, 'listAllInWorkspace'> {
  const byCollection: Record<string, unknown[]> = {
    [DB_NAMES.documents]: data.documents,
    [DB_NAMES.clients]: data.clients,
    [DB_NAMES.documentTypeGroups]: data.documentTypeGroups,
    [DB_NAMES.activities]: data.activities,
    [DB_NAMES.events]: data.events,
  };

  return {
    listAllInWorkspace: async (collection: string, workspaceId: string) =>
      ((byCollection[collection] ?? []) as { workspaceId?: string }[]).filter(
        (item) => item.workspaceId === workspaceId,
      ),
  } as Pick<DataStore, 'listAllInWorkspace'>;
}

const baseCollections = (): BootstrapCollections => ({
  documents: [
    doc({ id: 'inv-1', type: 'invoice' }),
    doc({ id: 'alb-public', type: 'delivery-note', activityId: undefined }),
    doc({ id: 'alb-private', type: 'delivery-note', activityId: activityForOperator.id }),
    doc({ id: 'alb-other', type: 'delivery-note', activityId: activityOtherClient.id }),
  ],
  clients: [clientA, clientB],
  documentTypeGroups: [publicDeliveryGroup, privateDeliveryGroup, invoiceGroup],
  activities: [activityForOperator, activityOtherClient],
  events,
});

describe('readDocumentsBootstrapFromStore', () => {
  it('admin recibe facturas, albaranes y contactos', async () => {
    const result = await readDocumentsBootstrapFromStore(
      WORKSPACE_ID,
      admin,
      mockBootstrapStore(baseCollections()),
    );

    assert.deepEqual(result.documents.map((item) => item.id).sort(), [
      'alb-other',
      'alb-private',
      'alb-public',
      'inv-1',
    ]);
    assert.deepEqual(result.clients.map((item) => item.id).sort(), ['client-a', 'client-b']);
    assert.equal(result.documentTypeGroups.length, 3);
    assert.equal(result.activities.length, 2);
  });

  it('operario no recibe facturas', async () => {
    const result = await readDocumentsBootstrapFromStore(
      WORKSPACE_ID,
      operator,
      mockBootstrapStore(baseCollections()),
    );

    assert.ok(result.documents.every((item) => item.type !== 'invoice'));
    assert.ok(!result.documentTypeGroups.some((group) => group.documentType === 'invoice'));
  });

  it('operario recibe albaranes publicos sin actividad asignada', async () => {
    const collections = baseCollections();
    collections.documentTypeGroups = [publicDeliveryGroup, invoiceGroup];
    collections.documents = [
      doc({ id: 'alb-public', type: 'delivery-note', activityId: undefined }),
      doc({ id: 'alb-private-unassigned', type: 'delivery-note', activityId: undefined }),
    ];

    const result = await readDocumentsBootstrapFromStore(
      WORKSPACE_ID,
      operator,
      mockBootstrapStore(collections),
    );

    assert.deepEqual(
      result.documents.map((item) => item.id).sort(),
      ['alb-private-unassigned', 'alb-public'],
    );
  });

  it('operario recibe albaranes privados ligados a actividad asignada', async () => {
    const collections = baseCollections();
    collections.documentTypeGroups = [privateDeliveryGroup, invoiceGroup];
    collections.documents = [
      doc({ id: 'alb-private', type: 'delivery-note', activityId: activityForOperator.id }),
      doc({ id: 'alb-other', type: 'delivery-note', activityId: activityOtherClient.id }),
    ];

    const result = await readDocumentsBootstrapFromStore(
      WORKSPACE_ID,
      operator,
      mockBootstrapStore(collections),
    );

    assert.ok(result.documents.some((item) => item.id === 'alb-private'));
    assert.ok(!result.documents.some((item) => item.id === 'alb-other'));
  });

  it('operario solo recibe contactos de actividades asignadas', async () => {
    const result = await readDocumentsBootstrapFromStore(
      WORKSPACE_ID,
      operator,
      mockBootstrapStore(baseCollections()),
    );

    assert.deepEqual(result.clients.map((client) => client.id), [clientA.id]);
    assert.equal(result.activities.length, 1);
    assert.equal(result.activities[0]?.id, activityForOperator.id);
  });
});
