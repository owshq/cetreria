import type {
  Activity,
  CalendarEvent,
  Client,
  Document,
  DocumentTypeGroup,
  User,
  Workspace,
  WorkspaceMember,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc } from '../db/repository.js';

export const SMOKE_WORKSPACE_ID = 'f6000001-0000-4000-8000-000000000001';
export const SMOKE_ADMIN_ID = 'f6000002-0000-4000-8000-000000000001';
export const SMOKE_OPERATOR_ID = 'f6000003-0000-4000-8000-000000000001';

export const smokeAdminUser: User = {
  id: SMOKE_ADMIN_ID,
  name: 'Smoke Admin',
  email: 'smoke-admin@test.local',
  role: 'admin',
  password: 'unused',
};

export const smokeOperatorUser: User = {
  id: SMOKE_OPERATOR_ID,
  name: 'Smoke Operario',
  email: 'smoke-op@test.local',
  role: 'user',
  password: 'unused',
};

const smokeWorkspace: Workspace = {
  id: SMOKE_WORKSPACE_ID,
  name: 'Smoke Workspace',
  slug: 'smoke-ws',
  createdAt: '2026-01-01T00:00:00.000Z',
  defaultClientGroupSeeded: true,
};

const smokeMembers: WorkspaceMember[] = [
  {
    id: 'f6000004-0000-4000-8000-000000000001',
    workspaceId: SMOKE_WORKSPACE_ID,
    userId: SMOKE_ADMIN_ID,
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'f6000004-0000-4000-8000-000000000002',
    workspaceId: SMOKE_WORKSPACE_ID,
    userId: SMOKE_OPERATOR_ID,
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const smokeClientA: Client = {
  id: 'f6000005-0000-4000-8000-000000000001',
  workspaceId: SMOKE_WORKSPACE_ID,
  groupId: 'f6000006-0000-4000-8000-000000000001',
  name: 'Cliente A',
  email: 'a@test.local',
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

export const smokeClientB: Client = {
  ...smokeClientA,
  id: 'f6000005-0000-4000-8000-000000000002',
  name: 'Cliente B',
  email: 'b@test.local',
};

export const smokeActivityForOperator: Activity = {
  id: 'f6000007-0000-4000-8000-000000000001',
  workspaceId: SMOKE_WORKSPACE_ID,
  clientId: smokeClientA.id,
  userId: SMOKE_OPERATOR_ID,
  date: '2026-06-01',
  description: 'Trabajo smoke',
  hours: 2,
  type: 'work',
  attachments: [],
  createdAt: '2026-06-01T08:00:00.000Z',
};

export const smokeActivityOtherClient: Activity = {
  ...smokeActivityForOperator,
  id: 'f6000007-0000-4000-8000-000000000002',
  clientId: smokeClientB.id,
  userId: 'f6000008-0000-4000-8000-000000000001',
};

export const smokePublicDeliveryGroup: DocumentTypeGroup = {
  id: 'f6000009-0000-4000-8000-000000000001',
  workspaceId: SMOKE_WORKSPACE_ID,
  documentType: 'delivery-note',
  name: 'Albaranes publicos',
  isPublic: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const smokePrivateDeliveryGroup: DocumentTypeGroup = {
  ...smokePublicDeliveryGroup,
  id: 'f6000009-0000-4000-8000-000000000002',
  name: 'Albaranes privados',
  isPublic: false,
};

export const smokeInvoiceGroup: DocumentTypeGroup = {
  id: 'f6000009-0000-4000-8000-000000000003',
  workspaceId: SMOKE_WORKSPACE_ID,
  documentType: 'invoice',
  name: 'Facturas',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function smokeDocument(
  overrides: Partial<Document> & Pick<Document, 'id' | 'type'>,
): Document {
  return {
    workspaceId: SMOKE_WORKSPACE_ID,
    number: 'DOC-1',
    clientId: smokeClientA.id,
    date: '2026-06-01',
    items: [],
    total: 100,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    activityId: smokeActivityForOperator.id,
    ...overrides,
  };
}

export type SmokeBootstrapScenario = {
  documentTypeGroups: DocumentTypeGroup[];
  documents: Document[];
};

export const smokeBootstrapAdminScenario: SmokeBootstrapScenario = {
  documentTypeGroups: [
    smokePublicDeliveryGroup,
    smokePrivateDeliveryGroup,
    smokeInvoiceGroup,
  ],
  documents: [
    smokeDocument({ id: 'f600000a-0000-4000-8000-000000000001', type: 'invoice' }),
    smokeDocument({ id: 'f600000a-0000-4000-8000-000000000002', type: 'delivery-note', activityId: undefined }),
    smokeDocument({ id: 'f600000a-0000-4000-8000-000000000003', type: 'delivery-note' }),
    smokeDocument({
      id: 'f600000a-0000-4000-8000-000000000004',
      type: 'delivery-note',
      activityId: smokeActivityOtherClient.id,
    }),
  ],
};

export async function seedDocumentsBootstrapSmokeScenario(
  scenario: SmokeBootstrapScenario,
): Promise<void> {
  await insertDoc(DB_NAMES.workspaces, smokeWorkspace);
  await insertDoc(DB_NAMES.users, smokeAdminUser);
  await insertDoc(DB_NAMES.users, smokeOperatorUser);
  for (const member of smokeMembers) {
    await insertDoc(DB_NAMES.workspaceMembers, member);
  }
  await insertDoc(DB_NAMES.clients, smokeClientA);
  await insertDoc(DB_NAMES.clients, smokeClientB);
  await insertDoc(DB_NAMES.activities, smokeActivityForOperator);
  await insertDoc(DB_NAMES.activities, smokeActivityOtherClient);

  const events: CalendarEvent[] = [];
  for (const event of events) {
    await insertDoc(DB_NAMES.events, event);
  }
  for (const group of scenario.documentTypeGroups) {
    await insertDoc(DB_NAMES.documentTypeGroups, group);
  }
  for (const document of scenario.documents) {
    await insertDoc(DB_NAMES.documents, document);
  }
}
