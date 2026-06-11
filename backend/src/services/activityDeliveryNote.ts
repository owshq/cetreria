import type { Activity, ActivityType, CalendarEvent, Client, Document } from '@shared/types';
import {
  ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER,
  activityTypeCreatesDeliveryNote,
  buildActivityDeliveryNoteItemsForWorker,
  findActivityDeliveryNoteForWorker,
  getActivityWorkReport,
  getSubmittedActivityWorkReports,
  getDocumentFormatsForType,
  getActivityTypeLabel,
  nextDocumentNumber,
  reopenActivityWorkReportForWorker,
  resolveActivityType,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { deleteDoc, getByIdInWorkspace, insertDoc, listAllInWorkspace, updateDoc } from '../db/repository.js';
import { normalizeDocumentPayload } from './documentRecords.js';
import { deleteDocumentPdf, syncDocumentPdf } from './documentFiles.js';
import { getWorkspaceBillingSettings } from './workspaceBillingSettings.js';
import { buildDisplayNameForDocumentRecord } from './documentDisplayNames.js';
import { notifyActivityChanged, notifyDocumentChanged } from './notifications.js';
import type { AuthUser } from '../middleware/auth.js';

function activityGeneratesDeliveryNote(
  activity: Activity,
  activityTypes: readonly ActivityType[],
): boolean {
  const type = resolveActivityType(activity.type, activityTypes as ActivityType[]);
  return activityTypeCreatesDeliveryNote(type);
}

async function resolveWorkerDeliveryNote(
  activity: Activity,
  workerUserId: string,
  documents: readonly Document[],
  workspaceId: string,
  client: Client,
  actingUser: AuthUser,
): Promise<Document | null> {
  let existing = findActivityDeliveryNoteForWorker(
    activity.id,
    workerUserId,
    documents,
    activity,
  );
  if (!existing || existing.workerUserId) {
    return existing;
  }

  const updated = await updateDoc<Document>(DB_NAMES.documents, existing.id, { workerUserId });
  if (!updated) {
    return existing;
  }

  existing = updated;
  await notifyDocumentChanged(workspaceId, actingUser, 'document.updated', existing, client);
  return existing;
}

async function buildNormalizedDeliveryNotePayload(options: {
  activity: Activity;
  activityTypes: readonly ActivityType[];
  client: Client;
  workspaceId: string;
  items: Document['items'];
  existingDocument?: Document | null;
  notesPrefix?: string;
}) {
  const { activity, activityTypes, client, workspaceId, items, existingDocument, notesPrefix } =
    options;
  if (items.length === 0) {
    return null;
  }

  const billingSettings = await getWorkspaceBillingSettings(workspaceId);
  const notes = [
    notesPrefix ?? 'Albaran generado automaticamente a partir de los informes de trabajo.',
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

async function persistDeliveryNoteUpdate(options: {
  workspaceId: string;
  client: Client;
  existing: Document;
  payload: NonNullable<Awaited<ReturnType<typeof buildNormalizedDeliveryNotePayload>>>;
  actingUser: AuthUser;
}): Promise<Document> {
  const { workspaceId, client, existing, payload, actingUser } = options;
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

async function createDeliveryNoteRecord(options: {
  workspaceId: string;
  activity: Activity;
  client: Client;
  documents: readonly Document[];
  payload: NonNullable<Awaited<ReturnType<typeof buildNormalizedDeliveryNotePayload>>>;
  actingUser: AuthUser;
  workerUserId?: string;
}): Promise<Document | null> {
  const { workspaceId, activity, client, documents, payload, actingUser, workerUserId } = options;
  const typeFormats = getDocumentFormatsForType(
    payload.billingSettings.documentFormats,
    'delivery-note',
  );
  const documentNumber = nextDocumentNumber(
    documents,
    'delivery-note',
    typeFormats.number,
    activity.date,
  );
  const displayName = buildDisplayNameForDocumentRecord(
    payload.billingSettings.documentFormats,
    { type: 'delivery-note', number: documentNumber, date: activity.date },
    client.name,
  );

  const document: Document = {
    type: 'delivery-note',
    clientId: activity.clientId,
    activityId: activity.id,
    workerUserId,
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
    number: documentNumber,
    displayName: displayName || undefined,
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

/** Crea o actualiza el albaran del operario al enviar su informe de trabajo. */
export async function ensureWorkerDeliveryNoteFromWorkReport(options: {
  workspaceId: string;
  activity: Activity;
  event: CalendarEvent | null;
  activityTypes: readonly ActivityType[];
  actingUser: AuthUser;
  workerUserId: string;
}): Promise<Document | null> {
  const { workspaceId, activity, activityTypes, actingUser, workerUserId } = options;

  if (!activityGeneratesDeliveryNote(activity, activityTypes)) {
    return null;
  }

  const serviceLabel = getActivityTypeLabel(activity.type, activityTypes as ActivityType[]);
  const items = buildActivityDeliveryNoteItemsForWorker(
    activity,
    serviceLabel,
    workerUserId,
    options.event,
  );

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    activity.clientId,
    workspaceId,
  );
  if (!client) {
    console.warn(
      `[activityDeliveryNote] Sin contacto para actividad ${activity.id}; no se crea albaran`,
    );
    return findActivityDeliveryNoteForWorker(activity.id, workerUserId, documents, activity);
  }

  const existing = await resolveWorkerDeliveryNote(
    activity,
    workerUserId,
    documents,
    workspaceId,
    client,
    actingUser,
  );

  if (items.length === 0) {
    return existing;
  }

  const report = getActivityWorkReport(activity, workerUserId);
  const canCreateNew =
    report?.status === 'submitted' && (report.workedMinutes ?? 0) > 0;
  if (!existing && !canCreateNew) {
    return null;
  }

  const payload = await buildNormalizedDeliveryNotePayload({
    activity,
    activityTypes,
    client,
    workspaceId,
    items,
    existingDocument: existing,
    notesPrefix: 'Albaran generado automaticamente desde el informe de trabajo del operario.',
  });
  if (!payload) {
    return existing;
  }

  if (existing) {
    return persistDeliveryNoteUpdate({
      workspaceId,
      client,
      existing,
      payload,
      actingUser,
    });
  }

  return createDeliveryNoteRecord({
    workspaceId,
    activity,
    client,
    documents,
    payload,
    actingUser,
    workerUserId,
  });
}

/** Actualiza los albaranes de operarios existentes tras cambiar conceptos extra. */
export async function syncWorkerDeliveryNotesAfterExtraItemsChange(options: {
  workspaceId: string;
  activity: Activity;
  activityTypes: readonly ActivityType[];
  actingUser: AuthUser;
}): Promise<void> {
  const { workspaceId, activity, activityTypes, actingUser } = options;

  if (!activityGeneratesDeliveryNote(activity, activityTypes)) {
    return;
  }

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  const workerUserIds = new Set<string>();

  for (const doc of documents) {
    if (
      doc.activityId === activity.id &&
      doc.type === 'delivery-note' &&
      doc.workerUserId &&
      doc.workerUserId !== ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER
    ) {
      workerUserIds.add(doc.workerUserId);
    }
  }

  for (const report of getSubmittedActivityWorkReports(activity)) {
    if (report.workedMinutes > 0) {
      workerUserIds.add(report.userId);
    }
  }

  for (const workerUserId of workerUserIds) {
    await ensureWorkerDeliveryNoteFromWorkReport({
      workspaceId,
      activity,
      event: null,
      activityTypes,
      actingUser,
      workerUserId,
    });
  }

  const legacyExtraNote =
    documents.find(
      (doc) =>
        doc.activityId === activity.id &&
        doc.type === 'delivery-note' &&
        doc.workerUserId === ACTIVITY_EXTRA_ITEMS_DELIVERY_NOTE_MARKER,
    ) ?? null;
  if (!legacyExtraNote) {
    return;
  }

  try {
    await deleteDocumentPdf(legacyExtraNote);
  } catch (error) {
    console.error('[activityDeliveryNote] Error al eliminar PDF del albaran legacy de extras', error);
  }
  await deleteDoc(DB_NAMES.documents, legacyExtraNote.id);
}

/** Reabre el informe del operario al eliminar su albaran vinculado a la actividad. */
export async function reopenWorkReportAfterDeliveryNoteRemoval(options: {
  workspaceId: string;
  activityId: string;
  workerUserId: string;
  actingUser: AuthUser;
}): Promise<Activity | null> {
  const { workspaceId, activityId, workerUserId, actingUser } = options;
  const existing = await getByIdInWorkspace<Activity>(DB_NAMES.activities, activityId, workspaceId);
  if (!existing) return null;

  const report = getActivityWorkReport(existing, workerUserId);
  if (!report || report.status !== 'submitted') return existing;

  const merged = reopenActivityWorkReportForWorker(existing, workerUserId);
  const updated = await updateDoc<Activity>(DB_NAMES.activities, existing.id, {
    workReports: merged.workReports,
  });
  if (!updated) return null;

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    updated.clientId,
    workspaceId,
  );
  if (client) {
    const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
    const linkedEvent = events.find((event) => event.activityId === updated.id) ?? null;
    await notifyActivityChanged(workspaceId, actingUser, 'activity.updated', updated, client, {
      previous: existing,
      linkedEvent,
      previousLinkedEvent: linkedEvent,
    });
  }

  return updated;
}
