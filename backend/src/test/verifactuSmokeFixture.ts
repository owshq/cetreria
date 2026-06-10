import type {
  Activity,
  Client,
  Document,
  DocumentTypeGroup,
  User,
  Workspace,
  WorkspaceBillingSettings,
  WorkspaceMember,
} from '@shared/types';
import { defaultWorkspaceDocumentFormats } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc } from '../db/repository.js';

export const VERIFACTU_WORKSPACE_ID = 'f7000001-0000-4000-8000-000000000001';
export const VERIFACTU_ADMIN_ID = 'f7000002-0000-4000-8000-000000000001';
export const VERIFACTU_OPERATOR_ID = 'f7000003-0000-4000-8000-000000000001';
export const VERIFACTU_CLIENT_ID = 'f7000005-0000-4000-8000-000000000001';
export const VERIFACTU_INVOICE_GROUP_ID = 'f7000009-0000-4000-8000-000000000001';

export const VERIFACTU_PENDING_INVOICE_ID = 'f700000a-0000-4000-8000-000000000001';
export const VERIFACTU_DELIVERY_NOTE_ID = 'f700000a-0000-4000-8000-000000000002';
export const VERIFACTU_UPLOADED_INVOICE_ID = 'f700000a-0000-4000-8000-000000000003';
export const VERIFACTU_ACCEPTED_INVOICE_ID = 'f700000a-0000-4000-8000-000000000004';

const verifactuAdminUser: User = {
  id: VERIFACTU_ADMIN_ID,
  name: 'Verifactu Admin',
  email: 'verifactu-admin@test.local',
  role: 'admin',
  password: 'unused',
};

const verifactuOperatorUser: User = {
  id: VERIFACTU_OPERATOR_ID,
  name: 'Verifactu Operario',
  email: 'verifactu-op@test.local',
  role: 'user',
  password: 'unused',
};

const verifactuWorkspace: Workspace = {
  id: VERIFACTU_WORKSPACE_ID,
  name: 'Verifactu Smoke Workspace',
  slug: 'verifactu-smoke',
  createdAt: '2026-01-01T00:00:00.000Z',
  defaultClientGroupSeeded: true,
};

const verifactuMembers: WorkspaceMember[] = [
  {
    id: 'f7000004-0000-4000-8000-000000000001',
    workspaceId: VERIFACTU_WORKSPACE_ID,
    userId: VERIFACTU_ADMIN_ID,
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'f7000004-0000-4000-8000-000000000002',
    workspaceId: VERIFACTU_WORKSPACE_ID,
    userId: VERIFACTU_OPERATOR_ID,
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const verifactuClient: Client = {
  id: VERIFACTU_CLIENT_ID,
  workspaceId: VERIFACTU_WORKSPACE_ID,
  groupId: 'f7000006-0000-4000-8000-000000000001',
  name: 'Cliente Verifactu',
  email: 'cliente@test.local',
  phone: '',
  address: 'Calle Test 1',
  city: 'Madrid',
  postalCode: '28001',
  country: 'Espana',
  state: '',
  website: '',
  technicalInfo: '',
  observations: [],
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  customFields: { NIF: '12345678Z' },
};

const verifactuActivity: Activity = {
  id: 'f7000007-0000-4000-8000-000000000001',
  workspaceId: VERIFACTU_WORKSPACE_ID,
  clientId: VERIFACTU_CLIENT_ID,
  userId: VERIFACTU_ADMIN_ID,
  date: '2026-06-01',
  description: 'Actividad verifactu',
  hours: 1,
  type: 'work',
  attachments: [],
  createdAt: '2026-06-01T08:00:00.000Z',
};

const verifactuInvoiceGroup: DocumentTypeGroup = {
  id: VERIFACTU_INVOICE_GROUP_ID,
  workspaceId: VERIFACTU_WORKSPACE_ID,
  documentType: 'invoice',
  name: 'Facturas verifactu',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const defaultInvoiceLine = {
  name: 'Servicio',
  description: 'Linea de prueba',
  quantity: 1,
  price: 100,
};

export function verifactuInvoice(
  overrides: Partial<Document> & Pick<Document, 'id'>,
): Document {
  return {
    workspaceId: VERIFACTU_WORKSPACE_ID,
    type: 'invoice',
    number: 'VF-2026-001',
    clientId: VERIFACTU_CLIENT_ID,
    date: '2026-06-01',
    items: [defaultInvoiceLine],
    subtotal: 100,
    taxRate: 21,
    taxAmount: 21,
    total: 121,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    activityId: verifactuActivity.id,
    templateId: 'classic',
    pdfSource: 'generated',
    verifactuStatus: 'pendiente',
    ...overrides,
  };
}

export type VerifactuSmokeScenario = {
  billingSettings?: Partial<WorkspaceBillingSettings>;
  documents: Document[];
};

export const verifactuSandboxScenario: VerifactuSmokeScenario = {
  billingSettings: {
    companyName: 'Empresa Verifactu SL',
    verifactuEnabled: true,
    verifactuEnvironment: 'sandbox',
    issuerNif: 'B12345678',
  },
  documents: [
    verifactuInvoice({ id: VERIFACTU_PENDING_INVOICE_ID }),
    verifactuInvoice({
      id: VERIFACTU_DELIVERY_NOTE_ID,
      type: 'delivery-note',
      verifactuStatus: undefined,
    }),
    verifactuInvoice({
      id: VERIFACTU_UPLOADED_INVOICE_ID,
      number: 'VF-UP-001',
      pdfSource: 'uploaded',
      pdfKey: 'workspaces/test/uploaded.pdf',
      pdfContentType: 'application/pdf',
    }),
    verifactuInvoice({
      id: VERIFACTU_ACCEPTED_INVOICE_ID,
      number: 'VF-ACC-001',
      verifactuStatus: 'aceptado',
      verifactuSubmittedAt: '2026-06-01T12:00:00.000Z',
      verifactuHash: 'a'.repeat(64),
      verifactuCsv: 'AAAA-BBBB-CCCC-DDDD',
      status: 'sent',
    }),
  ],
};

export async function seedVerifactuSmokeScenario(
  scenario: VerifactuSmokeScenario = verifactuSandboxScenario,
): Promise<void> {
  await insertDoc(DB_NAMES.workspaces, verifactuWorkspace);
  await insertDoc(DB_NAMES.users, verifactuAdminUser);
  await insertDoc(DB_NAMES.users, verifactuOperatorUser);
  for (const member of verifactuMembers) {
    await insertDoc(DB_NAMES.workspaceMembers, member);
  }
  await insertDoc(DB_NAMES.clients, verifactuClient);
  await insertDoc(DB_NAMES.activities, verifactuActivity);
  await insertDoc(DB_NAMES.documentTypeGroups, verifactuInvoiceGroup);

  const billing: WorkspaceBillingSettings = {
    id: VERIFACTU_WORKSPACE_ID,
    workspaceId: VERIFACTU_WORKSPACE_ID,
    companyName: scenario.billingSettings?.companyName ?? 'Empresa Verifactu SL',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    defaultTaxRate: 21,
    documentFormats: defaultWorkspaceDocumentFormats(),
    verifactuEnabled: scenario.billingSettings?.verifactuEnabled ?? true,
    verifactuEnvironment: scenario.billingSettings?.verifactuEnvironment ?? 'sandbox',
    issuerNif: scenario.billingSettings?.issuerNif ?? 'B12345678',
  };
  await insertDoc(DB_NAMES.workspaceBillingSettings, billing);

  for (const document of scenario.documents) {
    await insertDoc(DB_NAMES.documents, document);
  }
}
