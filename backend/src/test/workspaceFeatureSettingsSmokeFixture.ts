import type { User, Workspace, WorkspaceBillingSettings, WorkspaceMember } from '@shared/types';
import { defaultWorkspaceDocumentFormats } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc } from '../db/repository.js';
import {
  VERIFACTU_ADMIN_ID,
  VERIFACTU_INVOICE_GROUP_ID,
  VERIFACTU_OPERATOR_ID,
  VERIFACTU_PENDING_INVOICE_ID,
  VERIFACTU_WORKSPACE_ID,
  verifactuClient,
  verifactuInvoice,
} from './verifactuSmokeFixture.js';

export {
  VERIFACTU_ADMIN_ID,
  VERIFACTU_OPERATOR_ID,
  VERIFACTU_PENDING_INVOICE_ID,
  VERIFACTU_WORKSPACE_ID,
};

const toggleWorkspace: Workspace = {
  id: VERIFACTU_WORKSPACE_ID,
  name: 'Verifactu Toggle Workspace',
  slug: 'verifactu-toggle',
  createdAt: '2026-01-01T00:00:00.000Z',
  defaultClientGroupSeeded: true,
};

const toggleAdmin: User = {
  id: VERIFACTU_ADMIN_ID,
  name: 'Toggle Admin',
  email: 'toggle-admin@test.local',
  role: 'admin',
  password: 'unused',
};

const toggleOperator: User = {
  id: VERIFACTU_OPERATOR_ID,
  name: 'Toggle Operario',
  email: 'toggle-op@test.local',
  role: 'user',
  password: 'unused',
};

const toggleMembers: WorkspaceMember[] = [
  {
    id: 'f7000004-0000-4000-8000-000000000099',
    workspaceId: VERIFACTU_WORKSPACE_ID,
    userId: VERIFACTU_ADMIN_ID,
    role: 'owner',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'f7000004-0000-4000-8000-000000000098',
    workspaceId: VERIFACTU_WORKSPACE_ID,
    userId: VERIFACTU_OPERATOR_ID,
    role: 'member',
    joinedAt: '2026-01-01T00:00:00.000Z',
  },
];

export async function seedWorkspaceFeatureToggleScenario(options?: {
  billingVerifactuEnabled?: boolean;
  withInvoice?: boolean;
}): Promise<void> {
  const billingVerifactuEnabled = options?.billingVerifactuEnabled ?? false;
  const withInvoice = options?.withInvoice ?? false;

  await insertDoc(DB_NAMES.workspaces, toggleWorkspace);
  await insertDoc(DB_NAMES.users, toggleAdmin);
  await insertDoc(DB_NAMES.users, toggleOperator);
  for (const member of toggleMembers) {
    await insertDoc(DB_NAMES.workspaceMembers, member);
  }

  const billing: WorkspaceBillingSettings = {
    id: VERIFACTU_WORKSPACE_ID,
    workspaceId: VERIFACTU_WORKSPACE_ID,
    companyName: 'Empresa Toggle SL',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    defaultTaxRate: 21,
    documentFormats: defaultWorkspaceDocumentFormats(),
    verifactuEnabled: billingVerifactuEnabled,
    verifactuEnvironment: 'sandbox',
    issuerNif: 'B12345678',
  };
  await insertDoc(DB_NAMES.workspaceBillingSettings, billing);

  if (withInvoice) {
    await insertDoc(DB_NAMES.clients, verifactuClient);
    await insertDoc(DB_NAMES.activities, {
      id: 'f7000007-0000-4000-8000-000000000001',
      workspaceId: VERIFACTU_WORKSPACE_ID,
      clientId: verifactuClient.id,
      userId: VERIFACTU_ADMIN_ID,
      date: '2026-06-01',
      description: 'Actividad verifactu toggle',
      hours: 1,
      type: 'work',
      attachments: [],
      createdAt: '2026-06-01T08:00:00.000Z',
    });
    await insertDoc(DB_NAMES.documentTypeGroups, {
      id: VERIFACTU_INVOICE_GROUP_ID,
      workspaceId: VERIFACTU_WORKSPACE_ID,
      documentType: 'invoice',
      name: 'Facturas toggle',
      isPublic: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await insertDoc(
      DB_NAMES.documents,
      verifactuInvoice({ id: VERIFACTU_PENDING_INVOICE_ID }),
    );
  }
}
