import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PORTS } from '../../shared/ports.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(rootDir, '.env') });

function resolveDbPath(): string {
  return process.env.DB_PATH ?? path.join(backendDir, 'data', 'db.json');
}

function resolveDocumentStorageDir(): string {
  return process.env.DOCUMENT_STORAGE_DIR ?? path.join(backendDir, 'data', 'document-pdfs');
}

export const config = {
  port: Number(process.env.PORT ?? PORTS.api),
  dbType: process.env.DB_TYPE ?? 'json',
  get dbPath() {
    return resolveDbPath();
  },
  jwtSecret: process.env.JWT_SECRET ?? 'crm-cetreria-dev-secret',
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.AWS_REGION ?? process.env.S3_REGION ?? 'eu-west-1',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    presignExpiresSeconds: Number(process.env.S3_PRESIGN_EXPIRES ?? 3600),
  },
  get documentStorageDir() {
    return resolveDocumentStorageDir();
  },
};

export const DB_NAMES = {
  users: 'users',
  workspaces: 'workspaces',
  workspaceMembers: 'workspace_members',
  clients: 'clients',
  activities: 'activities',
  events: 'events',
  documents: 'documents',
  reports: 'reports',
  activityTypes: 'activity_types',
  clientGroups: 'client_groups',
  documentTypeGroups: 'document_type_groups',
  invoiceConceptSettings: 'invoice_concept_settings',
  workspaceBillingSettings: 'workspace_billing_settings',
  workspaceScheduleSettings: 'workspace_schedule_settings',
  workspaceFeatureSettings: 'workspace_feature_settings',
  workspaceAppearanceSettings: 'workspace_appearance_settings',
  notifications: 'notifications',
  savedTableViewsPages: 'saved_table_views_pages',
  savedTableViewsUserPages: 'saved_table_views_user_pages',
  tableViewStateUserPages: 'table_view_state_user_pages',
  userInteractionPages: 'user_interaction_pages',
  userSchedules: 'user_schedules',
  workspaceScheduleHolidays: 'workspace_schedule_holidays',
} as const;

/** Claves antiguas de db.json (prefijo crm_) — solo migración al arrancar. */
export const LEGACY_DB_NAMES: Record<string, (typeof DB_NAMES)[keyof typeof DB_NAMES]> = {
  crm_users: DB_NAMES.users,
  crm_workspaces: DB_NAMES.workspaces,
  crm_workspace_members: DB_NAMES.workspaceMembers,
  crm_clients: DB_NAMES.clients,
  crm_activities: DB_NAMES.activities,
  crm_events: DB_NAMES.events,
  crm_documents: DB_NAMES.documents,
  crm_reports: DB_NAMES.reports,
  crm_activity_types: DB_NAMES.activityTypes,
  crm_client_groups: DB_NAMES.clientGroups,
  crm_document_type_groups: DB_NAMES.documentTypeGroups,
  crm_invoice_concept_settings: DB_NAMES.invoiceConceptSettings,
  crm_workspace_billing_settings: DB_NAMES.workspaceBillingSettings,
  crm_workspace_schedule_settings: DB_NAMES.workspaceScheduleSettings,
  crm_workspace_feature_settings: DB_NAMES.workspaceFeatureSettings,
  crm_workspace_appearance_settings: DB_NAMES.workspaceAppearanceSettings,
  crm_notifications: DB_NAMES.notifications,
};
