import type { Activity, ActivityType, CalendarEvent, Client, Document } from '@shared/types';
import {
  activityTypeCreatesDeliveryNote,
  allAssigneesSubmittedWorkReports,
  buildActivityDeliveryNoteItems,
  getDocumentFormatsForType,
  getActivityTypeLabel,
  nextDocumentNumber,
  resolveActivityType,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getByIdInWorkspace, insertDoc, listAllInWorkspace, updateDoc } from '../db/repository.js';
import { normalizeDocumentPayload } from './documentRecords.js';
import { syncDocumentPdf } from './documentFiles.js';
import { getWorkspaceBillingSettings } from './workspaceBillingSettings.js';
import { notifyDocumentChanged } from './notifications.js';
import type { AuthUser } from '../middleware/auth.js';

function activityHasDeliveryNote(
  activityId: string,
  documents: readonly Document[],
): boolean {
  return documents.some(
    (doc) => doc.activityId === activityId && doc.type === 'delivery-note',
  );
}

function findActivityDeliveryNote(
  activityId: string,
  documents: readonly Document[],
): Document | null {
  return (
    documents.find(
      (doc) => doc.activityId === activityId && doc.type === 'delivery-note',
    ) ?? null
  );
}

function activityGeneratesDeliveryNote(
  activity: Activity,
  activityTypes: readonly ActivityType[],
): boolean {
  const type = resolveActivityType(activity.type, activityTypes as ActivityType[]);
  return activityTypeCreatesDeliveryNote(type);
}

async function buildNormalizedDeliveryNotePayload(options: {
  activity: Activity;
  activityTypes: readonly ActivityType[];
  client: Client;
  workspaceId: string;
  existingDocument?: Document | null;
}) {
  const { activity, activityTypes, client, workspaceId, existingDocument } = options;
  const billingSettings = await getWorkspaceBillingSettings(workspaceId);
  const serviceLabel = getActivityTypeLabel(activity.type, activityTypes as ActivityType[]);
  const items = buildActivityDeliveryNoteItems(activity, serviceLabel);
  if (items.length === 0) {
    return null;
  }

  const notes = [
    'Albaran generado automaticamente a partir de los informes de trabajo.',
    activity.description.trim() || undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const normalized = normalizeDocumentPayload(
    {
      type: 'delivery-note',
      clientId: activity.clientId,
      activityId: activity.id,
      date: activity.date,
      items,
      notes: existingDocument?.notes?.trim() || notes,
      status: existingDocument?.status ?? 'sent',
      taxRate: existingDocument?.taxRate,
      billingAddress: existingDocument?.billingAddress,
    },
    {
      client,
      defaultTaxRate: billingSettings.defaultTaxRate,
    },
  );

  if (!normalized.billingAddress.email) {
    return null;
  }

  return { normalized, billingSettings };
}

export async function syncActivityDeliveryNoteFromWorkReports(options: {
  workspaceId: string;
  activity: Activity;
  event: CalendarEvent | null;
  activityTypes: readonly ActivityType[];
  actingUser: AuthUser;
}): Promise<Document | null> {
  const { workspaceId, activity, event, activityTypes, actingUser } = options;

  if (!activityGeneratesDeliveryNote(activity, activityTypes)) {
    return null;
  }

  if (!allAssigneesSubmittedWorkReports(activity, event)) {
    return null;
  }

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  const existing = findActivityDeliveryNote(activity.id, documents);
  if (!existing) {
    return ensureActivityDeliveryNoteFromWorkReports(options);
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    activity.clientId,
    workspaceId,
  );
  if (!client) {
    console.warn(
      `[activityDeliveryNote] Sin contacto para actividad ${activity.id}; no se actualiza albaran`,
    );
    return existing;
  }

  const payload = await buildNormalizedDeliveryNotePayload({
    activity,
    activityTypes,
    client,
    workspaceId,
    existingDocument: existing,
  });
  if (!payload) {
    return existing;
  }

  const updated = await updateDoc<Document>(DB_NAMES.documents, existing.id, {
    items: payload.normalized.items,
    subtotal: payload.normalized.subtotal,
    taxRate: payload.normalized.taxRate,
    taxAmount: payload.normalized.taxAmount,
    total: payload.normalized.total,
  });
  if (!updated) {
    return existing;
  }

  await notifyDocumentChanged(workspaceId, actingUser, 'document.updated', updated, client);

  try {
    return await syncDocumentPdf(updated, actingUser);
  } catch (error) {
    console.error('[activityDeliveryNote] Error al regenerar PDF del albaran', error);
    return updated;
  }
}

export async function ensureActivityDeliveryNoteFromWorkReports(options: {
  workspaceId: string;
  activity: Activity;
  event: CalendarEvent | null;
  activityTypes: readonly ActivityType[];
  actingUser: AuthUser;
}): Promise<Document | null> {
  const { workspaceId, activity, event, activityTypes, actingUser } = options;

  if (!activityGeneratesDeliveryNote(activity, activityTypes)) {
    return null;
  }

  if (!allAssigneesSubmittedWorkReports(activity, event)) {
    return null;
  }

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  if (activityHasDeliveryNote(activity.id, documents)) {
    return findActivityDeliveryNote(activity.id, documents);
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    activity.clientId,
    workspaceId,
  );
  if (!client) {
    console.warn(
      `[activityDeliveryNote] Sin contacto para actividad ${activity.id}; no se crea albaran`,
    );
    return null;
  }

  const payload = await buildNormalizedDeliveryNotePayload({
    activity,
    activityTypes,
    client,
    workspaceId,
  });
  if (!payload) {
    return null;
  }

  const numberFormat = getDocumentFormatsForType(
    payload.billingSettings.documentFormats,
    'delivery-note',
  ).number;

  const document: Document = {
    type: 'delivery-note',
    clientId: activity.clientId,
    activityId: activity.id,
    date: activity.date,
    items: payload.normalized.items,
    subtotal: payload.normalized.subtotal,
    taxRate: payload.normalized.taxRate,
    taxAmount: payload.normalized.taxAmount,
    total: payload.normalized.total,
    notes: payload.normalized.notes,
    billingAddress: payload.normalized.billingAddress,
    status: 'sent',
    workspaceId,
    id: crypto.randomUUID(),
    number: nextDocumentNumber(documents, 'delivery-note', numberFormat, activity.date),
    createdAt: new Date().toISOString(),
    pdfSource: 'generated',
  };

  await insertDoc(DB_NAMES.documents, document);
  await notifyDocumentChanged(workspaceId, actingUser, 'document.created', document, client);

  try {
    return await syncDocumentPdf(document, actingUser);
  } catch (error) {
    console.error('[activityDeliveryNote] Error al generar PDF del albaran', error);
    return document;
  }
}
