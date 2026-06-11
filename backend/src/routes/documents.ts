import { Router, type Request, type Response } from 'express';
import express from 'express';
import type { Activity, ActivityType, CalendarEvent, Client, Document } from '@shared/types';
import {
  buildDocumentXml,
  canOperatorCreateDocumentType,
  documentXmlFilename,
  getDocumentFormatsForType,
  isAllowedDocumentSourceMimeType,
  isFinancialDocumentType,
  mimeTypeToExtension,
  nextDocumentNumber,
  validateActivityInvoiceRequiresDeliveryNote,
  validateActivityInvoiceRequiresWorkerDeliveryNotes,
  validateRemovingDeliveryNoteFromActivity,
  validateSingleActivityInvoice,
  activityTypeUsesWorkReport,
  resolveActivityType,
  isVerifactuLocked,
} from '@shared/types';
import { getWorkspaceBillingSettings } from '../services/workspaceBillingSettings.js';
import { buildDisplayNameForDocumentRecord } from '../services/documentDisplayNames.js';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  findByFieldInWorkspace,
  getByIdInWorkspace,
  insertDoc,
  listAllInWorkspace,
  updateDoc,
} from '../db/repository.js';
import { authRequired, type AuthUser } from '../middleware/auth.js';
import { workspaceRequired, workspaceAdminRequired } from '../middleware/workspace.js';
import {
  deleteDocumentPdf,
  ensureDocumentPdfSynced,
  getDocumentPdfBuffer,
  getDocumentPdfViewUrl,
  shouldRegenerateDocumentPdf,
  syncDocumentPdf,
  syncUploadedDocumentFile,
} from '../services/documentFiles.js';
import { normalizeDocumentPayload } from '../services/documentRecords.js';
import { getDocumentStorageDriver } from '../storage/index.js';
import { getFreshAuthUser } from '../services/authUser.js';
import { notifyDocumentChanged } from '../services/notifications.js';
import { reopenWorkReportAfterDeliveryNoteRemoval } from '../services/activityDeliveryNote.js';
import { readDocumentsBootstrapFromStore } from '../services/documentsBootstrap.js';
import { jsonFileStore } from '../db/jsonFileStore.js';
import { approveElectronicInvoicing } from '../services/electronicInvoicing/electronicInvoicingGate.js';
import { submitDocumentToVerifactu } from '../services/verifactu.js';
import { listDocumentTypeGroupsForWorkspace } from '../db/documentTypeGroups.js';
import {
  canUserAccessActivity,
  canUserAccessDocumentRecord,
  filterDocumentsForUserInWorkspace,
} from '../utils/activityVisibility.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function loadDocumentAccessContext(workspaceId: string) {
  const [activities, events, documentTypeGroups] = await Promise.all([
    listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
    listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
    listDocumentTypeGroupsForWorkspace(workspaceId),
  ]);
  return { activities, events, documentTypeGroups };
}

async function filterVisibleDocuments(
  documents: Document[],
  user: AuthUser,
  workspaceId: string,
): Promise<Document[]> {
  const { activities, events, documentTypeGroups } = await loadDocumentAccessContext(workspaceId);
  return filterDocumentsForUserInWorkspace(
    documents,
    activities,
    events,
    user,
    documentTypeGroups,
  );
}

async function isVisibleDocument(
  document: Document,
  user: AuthUser,
  workspaceId: string,
): Promise<boolean> {
  const { activities, events, documentTypeGroups } = await loadDocumentAccessContext(workspaceId);
  return canUserAccessDocumentRecord(user, document, activities, events, documentTypeGroups);
}

async function getVisibleDocumentOrRespond(
  req: Request,
  res: Response,
): Promise<Document | null> {
  const workspaceId = req.workspaceId!;
  const document = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    String(req.params.id),
    workspaceId,
  );
  if (!document) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return null;
  }
  if (!(await isVisibleDocument(document, req.user!, workspaceId))) {
    res.status(403).json({ error: 'Permiso denegado' });
    return null;
  }
  return document;
}

function normalizeActivityId(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string') return value;
  return undefined;
}

async function validateActivityForClient(
  activityId: string | undefined,
  clientId: string,
  workspaceId: string,
  user: AuthUser,
): Promise<string | null> {
  if (!activityId) return null;

  const activity = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    activityId,
    workspaceId,
  );
  if (!activity) return 'Actividad no encontrada';
  if (activity.clientId !== clientId) return 'La actividad no pertenece al mismo contacto';

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
  if (!canUserAccessActivity(user, activity, events)) {
    return 'Actividad no encontrada';
  }
  return null;
}

async function validateInvoiceDeliveryNotePairOnActivity(
  workspaceId: string,
  activityId: string | undefined,
  documentType: Document['type'],
  excludeDocumentId?: string,
): Promise<string | null> {
  if (!activityId || documentType !== 'invoice') return null;

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  const deliveryError = validateActivityInvoiceRequiresDeliveryNote(documents, activityId, undefined, {
    excludeDocumentId,
    includesInvoice: true,
  });
  if (deliveryError) return deliveryError;

  const singleInvoiceError = validateSingleActivityInvoice(documents, activityId, undefined, {
    excludeDocumentId,
    addingInvoice: true,
  });
  if (singleInvoiceError) return singleInvoiceError;

  const activity = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    activityId,
    workspaceId,
  );
  if (!activity) return 'Actividad no encontrada';

  const activityTypes = await listAllInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    workspaceId,
  );
  const resolvedType = resolveActivityType(activity.type, activityTypes);
  if (!activityTypeUsesWorkReport(resolvedType)) return null;

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
  const linkedEvent = events.find((event) => event.activityId === activityId) ?? null;
  return validateActivityInvoiceRequiresWorkerDeliveryNotes(activity, linkedEvent, documents);
}

async function validateDeliveryNoteRemovalFromActivity(
  workspaceId: string,
  activityId: string,
  removingDocumentId: string,
): Promise<string | null> {
  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  return validateRemovingDeliveryNoteFromActivity(documents, activityId, removingDocumentId);
}

router.get('/bootstrap', async (req, res) => {
  const payload = await readDocumentsBootstrapFromStore(
    req.workspaceId!,
    req.user!,
    jsonFileStore,
  );
  res.json(payload);
});

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const { clientId, activityId } = req.query;

  if (typeof activityId === 'string') {
    const docs = await findByFieldInWorkspace<Document>(
      DB_NAMES.documents,
      'activityId',
      activityId,
      workspaceId,
    );
    res.json(await filterVisibleDocuments(docs, req.user!, workspaceId));
    return;
  }

  if (typeof clientId === 'string') {
    const docs = await findByFieldInWorkspace<Document>(
      DB_NAMES.documents,
      'clientId',
      clientId,
      workspaceId,
    );
    res.json(await filterVisibleDocuments(docs, req.user!, workspaceId));
    return;
  }

  const docs = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  res.json(await filterVisibleDocuments(docs, req.user!, workspaceId));
});

router.get('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const document = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    req.params.id,
    workspaceId,
  );
  if (!document) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return;
  }
  if (!(await isVisibleDocument(document, req.user!, workspaceId))) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }
  res.json(document);
});

router.get('/:id/pdf-view', async (req, res) => {
  const document = await getVisibleDocumentOrRespond(req, res);
  if (!document) return;

  try {
    const current = await ensureDocumentPdfSynced(document);
    const url = await getDocumentPdfViewUrl(current);
    res.json({
      driver: getDocumentStorageDriver(),
      url,
    });
  } catch (err) {
    console.error('Error al obtener URL del PDF', err);
    res.status(500).json({ error: 'No se pudo obtener el PDF del documento' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  const document = await getVisibleDocumentOrRespond(req, res);
  if (!document) return;

  try {
    const pdf = await getDocumentPdfBuffer(document);
    const contentType = document.pdfContentType ?? 'application/pdf';
    const ext = mimeTypeToExtension(contentType) ?? 'pdf';
    res.setHeader('Content-Type', contentType);
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${document.number}.${ext}"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    console.error('Error al servir PDF', err);
    res.status(500).json({ error: 'No se pudo generar el PDF del documento' });
  }
});

router.get('/:id/xml', async (req, res) => {
  const document = await getVisibleDocumentOrRespond(req, res);
  if (!document) return;

  if (!isFinancialDocumentType(document.type)) {
    res.status(400).json({ error: 'Solo las facturas pueden exportarse en XML' });
    return;
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    document.clientId,
    req.workspaceId!,
  );
  if (!client) {
    res.status(400).json({ error: 'Contacto no encontrado' });
    return;
  }

  try {
    const billingSettings = await getWorkspaceBillingSettings(req.workspaceId!);
    const xml = buildDocumentXml(document, client, billingSettings);
    const filename = documentXmlFilename(document.number);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    console.error('Error al generar XML del documento', err);
    res.status(500).json({ error: 'No se pudo generar el XML del documento' });
  }
});

router.post('/', async (req, res) => {
  const body = req.body as Omit<Document, 'id' | 'createdAt' | 'number' | 'workspaceId'>;
  if (body.type !== 'invoice' && body.type !== 'delivery-note') {
    res.status(400).json({ error: 'Tipo de documento no válido' });
    return;
  }
  if (!canOperatorCreateDocumentType(body.type) && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const activityId = normalizeActivityId(body.activityId);
  const activityError = await validateActivityForClient(
    activityId,
    body.clientId,
    req.workspaceId!,
    req.user!,
  );
  if (activityError) {
    res.status(400).json({ error: activityError });
    return;
  }

  const invoiceDeliveryError = await validateInvoiceDeliveryNotePairOnActivity(
    req.workspaceId!,
    activityId,
    body.type,
  );
  if (invoiceDeliveryError) {
    res.status(400).json({ error: invoiceDeliveryError });
    return;
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, body.clientId, req.workspaceId!);
  if (!client) {
    res.status(400).json({ error: 'Contacto no encontrado' });
    return;
  }

  const billingSettings = await getWorkspaceBillingSettings(req.workspaceId!);
  const normalized = normalizeDocumentPayload(body, {
    client,
    defaultTaxRate: billingSettings.defaultTaxRate,
  });

  if (!normalized.billingAddress.email) {
    res.status(400).json({ error: 'El email del cliente es obligatorio' });
    return;
  }

  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, req.workspaceId!);
  const typeFormats = getDocumentFormatsForType(billingSettings.documentFormats, body.type);
  const documentNumber = nextDocumentNumber(documents, body.type, typeFormats.number, body.date);
  const displayName = buildDisplayNameForDocumentRecord(
    billingSettings.documentFormats,
    { type: body.type, number: documentNumber, date: body.date },
    client.name,
  );
  const document: Document = {
    ...body,
    ...normalized,
    workspaceId: req.workspaceId!,
    activityId,
    id: crypto.randomUUID(),
    number: documentNumber,
    displayName: displayName || undefined,
    createdAt: new Date().toISOString(),
    pdfSource: body.pdfSource === 'uploaded' ? 'uploaded' : 'generated',
    invoiceKind: body.type === 'invoice' ? body.invoiceKind ?? 'ordinaria' : undefined,
    verifactuStatus:
      body.type === 'invoice' && billingSettings.verifactuEnabled ? 'pendiente' : undefined,
  };
  await insertDoc(DB_NAMES.documents, document);
  await notifyDocumentChanged(req.workspaceId!, req.user!, 'document.created', document, client);

  if (document.pdfSource === 'uploaded') {
    res.status(201).json(document);
    return;
  }

  try {
    const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user;
    const stored = await syncDocumentPdf(document, actingUser);
    res.status(201).json(stored);
  } catch (err) {
    console.error('Error al guardar PDF en almacenamiento', err);
    res.status(201).json(document);
  }
});

router.put('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const existing = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    req.params.id,
    workspaceId,
  );
  if (!existing) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return;
  }
  if (!(await isVisibleDocument(existing, req.user!, workspaceId))) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  if (isVerifactuLocked(existing)) {
    res.status(400).json({
      error: 'Esta factura ya fue aceptada o anulada en Veri*Factu y no puede modificarse.',
    });
    return;
  }

  const updates = req.body as Partial<Document>;
  if (updates.type && updates.type !== 'invoice' && updates.type !== 'delivery-note') {
    res.status(400).json({ error: 'Tipo de documento no válido' });
    return;
  }
  const nextType = updates.type ?? existing.type;
  if (!canOperatorCreateDocumentType(nextType) && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const clientId = updates.clientId ?? existing.clientId;
  const activityId =
    'activityId' in updates ? normalizeActivityId(updates.activityId) : existing.activityId;
  const activityError = await validateActivityForClient(
    activityId,
    clientId,
    req.workspaceId!,
    req.user!,
  );
  if (activityError) {
    res.status(400).json({ error: activityError });
    return;
  }

  const invoiceDeliveryError = await validateInvoiceDeliveryNotePairOnActivity(
    workspaceId,
    activityId,
    nextType,
    existing.id,
  );
  if (invoiceDeliveryError) {
    res.status(400).json({ error: invoiceDeliveryError });
    return;
  }

  if (
    existing.type === 'delivery-note' &&
    existing.activityId &&
    existing.activityId !== activityId
  ) {
    const deliveryNoteRemovalError = await validateDeliveryNoteRemovalFromActivity(
      workspaceId,
      existing.activityId,
      existing.id,
    );
    if (deliveryNoteRemovalError) {
      res.status(400).json({ error: deliveryNoteRemovalError });
      return;
    }
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, clientId, req.workspaceId!);
  if (!client) {
    res.status(400).json({ error: 'Contacto no encontrado' });
    return;
  }

  const billingSettings = await getWorkspaceBillingSettings(req.workspaceId!);
  const mergedForNormalize = { ...existing, ...updates, clientId };
  const normalized = normalizeDocumentPayload(mergedForNormalize, {
    client,
    defaultTaxRate: billingSettings.defaultTaxRate,
  });

  if (!normalized.billingAddress.email) {
    res.status(400).json({ error: 'El email del cliente es obligatorio' });
    return;
  }

  const { workspaceId: _workspaceId, ...safeUpdates } = updates;
  const updated = await updateDoc<Document>(DB_NAMES.documents, req.params.id, {
    ...safeUpdates,
    ...normalized,
    activityId,
  });
  if (!updated) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return;
  }

  if (updates.status && updates.status !== existing.status) {
    await notifyDocumentChanged(
      req.workspaceId!,
      req.user!,
      'document.status_changed',
      updated,
      client,
      { previousStatus: existing.status },
    );
  } else {
    await notifyDocumentChanged(req.workspaceId!, req.user!, 'document.updated', updated, client);
  }

  if (shouldRegenerateDocumentPdf(existing, updates)) {
    try {
      const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user;
      const stored = await syncDocumentPdf(updated, actingUser);
      res.json(stored);
      return;
    } catch (err) {
      console.error('Error al actualizar PDF en almacenamiento', err);
    }
  }

  res.json(updated);
});

router.post('/:id/electronic-invoicing/approve', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const document = await getVisibleDocumentOrRespond(req, res);
  if (!document) return;

  try {
    const result = await approveElectronicInvoicing(
      workspaceId,
      document.id,
      req.user!.id,
    );
    if (
      result.outcome === 'accepted' ||
      result.outcome === 'rejected' ||
      result.outcome === 'blocked'
    ) {
      const client = await getByIdInWorkspace<Client>(
        DB_NAMES.clients,
        result.document.clientId,
        workspaceId,
      );
      if (client) {
        await notifyDocumentChanged(
          workspaceId,
          req.user!,
          'document.updated',
          result.document,
          client,
        );
      }
    }
    res.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'No se pudo completar la aprobacion fiscal';
    res.status(400).json({ error: message });
  }
});

router.post('/:id/verifactu/submit', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const document = await getVisibleDocumentOrRespond(req, res);
  if (!document) return;

  try {
    const result = await submitDocumentToVerifactu(workspaceId, document.id);
    const client = await getByIdInWorkspace<Client>(
      DB_NAMES.clients,
      result.document.clientId,
      workspaceId,
    );
    if (client) {
      await notifyDocumentChanged(
        workspaceId,
        req.user!,
        'document.updated',
        result.document,
        client,
      );
    }
    res.json(result.document);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo enviar a Veri*Factu';
    res.status(400).json({ error: message });
  }
});

router.post(
  '/:id/source-file',
  express.raw({
    type: (req) => {
      const contentType = req.headers['content-type'];
      return typeof contentType === 'string' && isAllowedDocumentSourceMimeType(contentType);
    },
    limit: '15mb',
  }),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const document = await getByIdInWorkspace<Document>(
      DB_NAMES.documents,
      req.params.id,
      workspaceId,
    );
    if (!document) {
      res.status(404).json({ error: 'Documento no encontrado' });
      return;
    }
    if (!(await isVisibleDocument(document, req.user!, workspaceId))) {
      res.status(403).json({ error: 'Permiso denegado' });
      return;
    }

    if (document.pdfSource !== 'uploaded') {
      res.status(400).json({ error: 'Este documento no admite archivos subidos' });
      return;
    }

    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !isAllowedDocumentSourceMimeType(contentType)) {
      res.status(400).json({
        error: 'Formato no válido. Usa PDF o imagen (JPEG, PNG, WebP).',
      });
      return;
    }

    const fileBytes = req.body;
    if (!Buffer.isBuffer(fileBytes) || fileBytes.length === 0) {
      res.status(400).json({ error: 'El archivo está vacío' });
      return;
    }

    try {
      const stored = await syncUploadedDocumentFile(document, fileBytes, contentType);
      res.json(stored);
    } catch (err) {
      console.error('Error al guardar archivo del documento', err);
      res.status(500).json({ error: 'No se pudo guardar el archivo del documento' });
    }
  },
);

router.delete('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const existing = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    req.params.id,
    workspaceId,
  );
  if (!existing) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return;
  }
  if (!(await isVisibleDocument(existing, req.user!, workspaceId))) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  if (existing.type === 'delivery-note' && existing.activityId) {
    const deliveryNoteRemovalError = await validateDeliveryNoteRemovalFromActivity(
      workspaceId,
      existing.activityId,
      existing.id,
    );
    if (deliveryNoteRemovalError) {
      res.status(400).json({ error: deliveryNoteRemovalError });
      return;
    }
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, existing.clientId, workspaceId);
  await notifyDocumentChanged(req.workspaceId!, req.user!, 'document.deleted', existing, client);

  try {
    await deleteDocumentPdf(existing);
  } catch (err) {
    console.error('Error al eliminar PDF del almacenamiento', err);
  }

  const ok = await deleteDoc(DB_NAMES.documents, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Documento no encontrado' });
    return;
  }

  if (
    existing.type === 'delivery-note' &&
    existing.activityId &&
    existing.workerUserId
  ) {
    await reopenWorkReportAfterDeliveryNoteRemoval({
      workspaceId,
      activityId: existing.activityId,
      workerUserId: existing.workerUserId,
      actingUser: req.user!,
    });
  }

  res.status(204).send();
});

export default router;
