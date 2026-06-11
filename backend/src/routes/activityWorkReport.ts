import crypto from 'crypto';
import express, { Router } from 'express';
import type {
  Activity,
  ActivityType,
  ActivityWorkReport,
  ActivityWorkReportZone,
  ActivityWorkReportZoneImage,
  CalendarEvent,
  Client,
  Document,
} from '@shared/types';
import {
  activityTypeCreatesDeliveryNote,
  activityTypeUsesWorkReport,
  isAllowedDocumentSourceMimeType,
  mimeTypeToExtension,
  resolveActivityType,
} from '@shared/types';
import {
  MAX_WORK_REPORT_ZONE_IMAGES,
  buildActivityWorkReportPayload,
  canEditActivityWorkReport,
  canEditActivityWorkReportExtraItems,
  canSubmitActivityWorkReport,
  getActivityWorkReport,
  getActivityWorkReportZones,
  normalizeWorkReportNotes,
  parseWorkReportExtraItemsInput,
  parseWorkReportZonesInput,
  upsertActivityWorkReport,
  validateWorkReportSubmitClientEmail,
  workReportHasZoneContent,
  type ActivityWorkReportStatus,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getByIdInWorkspace, listAllInWorkspace, updateDoc } from '../db/repository.js';
import { authRequired, type AuthUser } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { getFreshAuthUser } from '../services/authUser.js';
import {
  buildWorkReportZoneImageStorageKey,
  deleteWorkReportZoneImageFile,
  downloadWorkReportZoneImageFile,
  uploadWorkReportZoneImageFile,
} from '../services/activityWorkReportFiles.js';
import {
  ensureWorkerDeliveryNoteFromWorkReport,
  syncWorkerDeliveryNotesAfterExtraItemsChange,
} from '../services/activityDeliveryNote.js';
import { notifyActivityChanged } from '../services/notifications.js';
import { canUserAccessActivity } from '../utils/activityVisibility.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router({ mergeParams: true });

router.use(authRequired);
router.use(workspaceRequired);

type WorkReportBody = {
  workedMinutes?: unknown;
  notes?: unknown;
  zones?: unknown;
  status?: ActivityWorkReportStatus;
};

type WorkReportExtraItemsBody = {
  items?: unknown;
};

type ActivityWorkReportContext = {
  existing: Activity;
  linkedEvent: CalendarEvent | null;
  activityTypes: ActivityType[];
  events: CalendarEvent[];
};

async function loadActivityWorkReportContext(
  activityId: string,
  workspaceId: string,
): Promise<ActivityWorkReportContext | null> {
  const existing = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    activityId,
    workspaceId,
  );
  if (!existing) return null;

  const activityTypes = await listAllInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    workspaceId,
  );
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
  const linkedEvent = events.find((event) => event.activityId === existing.id) ?? null;
  return { existing, linkedEvent, activityTypes, events };
}

function parseWorkReportWorkedMinutes(
  value: unknown,
  status: ActivityWorkReportStatus,
): number | null {
  const minutes = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(minutes)) {
    return status === 'draft' ? 0 : null;
  }
  const floored = Math.max(0, Math.floor(minutes));
  if (status === 'submitted' && floored <= 0) return null;
  return floored;
}

function findWorkReportZoneImage(
  report: ActivityWorkReport,
  imageId: string,
): { zone: ActivityWorkReportZone; image: ActivityWorkReportZoneImage } | null {
  for (const zone of getActivityWorkReportZones(report)) {
    const image = zone.images.find((entry) => entry.id === imageId);
    if (image) return { zone, image };
  }
  return null;
}

async function canEditOwnWorkReportInWorkspace(
  actingUser: AuthUser,
  ctx: ActivityWorkReportContext,
  workspaceId: string,
): Promise<boolean> {
  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId);
  return canEditActivityWorkReport(actingUser, {
    activity: ctx.existing,
    event: ctx.linkedEvent,
    targetUserId: actingUser.id,
    documents,
  });
}

async function persistActivityWorkReport(
  ctx: ActivityWorkReportContext,
  report: ActivityWorkReport,
  workspaceId: string,
  actingUser: AuthUser,
): Promise<Activity | null> {
  const merged = upsertActivityWorkReport(ctx.existing, report);
  const updated = await updateDoc<Activity>(DB_NAMES.activities, ctx.existing.id, {
    workReports: merged.workReports,
  });
  if (!updated) return null;

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    updated.clientId,
    workspaceId,
  );
  if (client) {
    await notifyActivityChanged(workspaceId, actingUser, 'activity.updated', updated, client, {
      previous: ctx.existing,
      linkedEvent: ctx.linkedEvent,
      previousLinkedEvent: ctx.linkedEvent,
    });
  }

  await ensureWorkerDeliveryNoteFromWorkReport({
    workspaceId,
    activity: updated,
    event: ctx.linkedEvent,
    activityTypes: ctx.activityTypes,
    actingUser,
    workerUserId: actingUser.id,
  });

  return updated;
}

router.put('/', async (req, res) => {
  const activityId = routeParam((req.params as { id: string | string[] }).id);
  if (!activityId) {
    res.status(400).json({ error: 'Actividad no valida' });
    return;
  }

  const ctx = await loadActivityWorkReportContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const activityType = resolveActivityType(ctx.existing.type, ctx.activityTypes);
  if (!activityTypeUsesWorkReport(activityType)) {
    res.status(403).json({ error: 'Este tipo de actividad no usa informes de trabajo' });
    return;
  }

  if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  const body = req.body as WorkReportBody;
  const status: ActivityWorkReportStatus = body.status === 'draft' ? 'draft' : 'submitted';
  const workedMinutes = parseWorkReportWorkedMinutes(body.workedMinutes, status);

  if (workedMinutes === null) {
    res.status(400).json({ error: 'Indica horas y minutos reales (mayor que 0)' });
    return;
  }

  if (!(await canEditOwnWorkReportInWorkspace(actingUser, ctx, req.workspaceId!))) {
    res.status(403).json({
      error: 'No puedes modificar este informe de trabajo. Elimina el albaran para rehacerlo.',
    });
    return;
  }

  if (
    status === 'submitted' &&
    !canSubmitActivityWorkReport(actingUser, { activity: ctx.existing, event: ctx.linkedEvent })
  ) {
    res.status(400).json({
      error: 'Solo puedes completar el informe de trabajo cuando la actividad ya haya finalizado',
    });
    return;
  }

  if (status === 'submitted') {
    const resolvedType = resolveActivityType(ctx.existing.type, ctx.activityTypes);
    const createsDeliveryNote = activityTypeCreatesDeliveryNote(resolvedType);
    if (createsDeliveryNote) {
      const client = await getByIdInWorkspace<Client>(
        DB_NAMES.clients,
        ctx.existing.clientId,
        req.workspaceId!,
      );
      const emailError = validateWorkReportSubmitClientEmail(client?.email, createsDeliveryNote);
      if (emailError) {
        res.status(400).json({ error: emailError });
        return;
      }
    }
  }

  const previousReport = getActivityWorkReport(ctx.existing, actingUser.id);
  const zones = parseWorkReportZonesInput(body.zones, previousReport);
  if (zones === null) {
    res.status(400).json({ error: 'Zonas del informe no validas' });
    return;
  }

  const notes = normalizeWorkReportNotes(body.notes);
  const hasContent =
    workedMinutes > 0 ||
    workReportHasZoneContent(zones) ||
    Boolean(notes) ||
    Boolean(previousReport && getActivityWorkReportZones(previousReport).some((z) => z.images.length > 0));

  if (!hasContent) {
    res.status(400).json({ error: 'Anade horas, notas o zonas al informe.' });
    return;
  }

  const report = buildActivityWorkReportPayload({
    user: actingUser,
    workedMinutes,
    notes,
    zones,
    status,
    existing: previousReport,
  });

  const updated = await persistActivityWorkReport(ctx, report, req.workspaceId!, actingUser);
  if (!updated) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  res.json(updated);
});

router.post(
  '/zones/:zoneId/images',
  express.raw({
    type: (req) => {
      const contentType = req.headers['content-type'];
      return typeof contentType === 'string' && isAllowedDocumentSourceMimeType(contentType);
    },
    limit: '8mb',
  }),
  async (req, res) => {
    const params = req.params as Record<string, string | string[]>;
    const activityId = routeParam(params.id);
    const zoneId = routeParam(params.zoneId);
    if (!activityId || !zoneId) {
      res.status(400).json({ error: 'Actividad o zona no valida' });
      return;
    }

    const ctx = await loadActivityWorkReportContext(activityId, req.workspaceId!);
    if (!ctx) {
      res.status(404).json({ error: 'Actividad no encontrada' });
      return;
    }

    const activityType = resolveActivityType(ctx.existing.type, ctx.activityTypes);
    if (!activityTypeUsesWorkReport(activityType)) {
      res.status(403).json({ error: 'Este tipo de actividad no usa informes de trabajo' });
      return;
    }

    if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
      res.status(403).json({ error: 'Permiso denegado' });
      return;
    }

    const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
    if (!(await canEditOwnWorkReportInWorkspace(actingUser, ctx, req.workspaceId!))) {
      res.status(403).json({
        error: 'No puedes modificar este informe de trabajo. Elimina el albaran para rehacerlo.',
      });
      return;
    }

    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !isAllowedDocumentSourceMimeType(contentType)) {
      res.status(400).json({ error: 'Formato no valido. Usa JPEG, PNG o WebP.' });
      return;
    }

    const fileBytes = req.body;
    if (!Buffer.isBuffer(fileBytes) || fileBytes.length === 0) {
      res.status(400).json({ error: 'El archivo esta vacio.' });
      return;
    }

    const previousReport = getActivityWorkReport(ctx.existing, actingUser.id);
    const zones = getActivityWorkReportZones(previousReport);
    const zoneIndex = zones.findIndex((zone) => zone.id === zoneId);
    const targetZone =
      zoneIndex >= 0
        ? zones[zoneIndex]
        : { id: zoneId, title: '', notes: '', images: [] as ActivityWorkReportZoneImage[] };

    if (targetZone.images.length >= MAX_WORK_REPORT_ZONE_IMAGES) {
      res.status(400).json({ error: `Maximo ${MAX_WORK_REPORT_ZONE_IMAGES} imagenes por zona.` });
      return;
    }

    const imageId = crypto.randomUUID();
    const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
    const storageKey = buildWorkReportZoneImageStorageKey(
      req.workspaceId!,
      activityId,
      actingUser.id,
      zoneId,
      imageId,
      mimeType,
    );
    const rawFilename = req.headers['x-filename'];
    const filename =
      typeof rawFilename === 'string' && rawFilename.trim()
        ? rawFilename.trim().slice(0, 180)
        : `informe-${imageId}.${mimeTypeToExtension(mimeType) ?? 'jpg'}`;

    try {
      await uploadWorkReportZoneImageFile(storageKey, fileBytes, mimeType);
    } catch (err) {
      console.error('Error al subir imagen del informe', err);
      res.status(500).json({ error: 'No se pudo guardar la imagen.' });
      return;
    }

    const image: ActivityWorkReportZoneImage = {
      id: imageId,
      storageKey,
      mimeType,
      filename,
      uploadedAt: new Date().toISOString(),
    };

    const nextZones =
      zoneIndex >= 0
        ? zones.map((zone, index) =>
            index === zoneIndex ? { ...zone, images: [...zone.images, image] } : zone,
          )
        : [...zones, { ...targetZone, images: [image] }];

    const report = buildActivityWorkReportPayload({
      user: actingUser,
      workedMinutes: previousReport?.workedMinutes ?? 0,
      zones: nextZones,
      status: 'draft',
      existing: previousReport,
    });

    const updated = await persistActivityWorkReport(ctx, report, req.workspaceId!, actingUser);
    if (!updated) {
      res.status(404).json({ error: 'Actividad no encontrada' });
      return;
    }

    res.status(201).json(updated);
  },
);

router.get('/images/:imageId/file', async (req, res) => {
  const params = req.params as Record<string, string | string[]>;
  const activityId = routeParam(params.id);
  const imageId = routeParam(params.imageId);
  if (!activityId || !imageId) {
    res.status(400).json({ error: 'Imagen no valida' });
    return;
  }

  const ctx = await loadActivityWorkReportContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const actingUser = req.user!;
  let match: { image: ActivityWorkReportZoneImage } | null = null;

  for (const report of ctx.existing.workReports ?? []) {
    const found = findWorkReportZoneImage(report, imageId);
    if (found) {
      if (actingUser.role !== 'admin' && report.userId !== actingUser.id) {
        res.status(403).json({ error: 'Permiso denegado' });
        return;
      }
      match = found;
      break;
    }
  }

  if (!match) {
    res.status(404).json({ error: 'Imagen no encontrada' });
    return;
  }

  const bytes = await downloadWorkReportZoneImageFile(match.image.storageKey);
  if (!bytes) {
    res.status(404).json({ error: 'Archivo no encontrado' });
    return;
  }

  const ext = mimeTypeToExtension(match.image.mimeType) ?? 'jpg';
  const filename = match.image.filename ?? `informe-${imageId}.${ext}`;
  res.setHeader('Content-Type', match.image.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(bytes));
});

router.delete('/images/:imageId', async (req, res) => {
  const params = req.params as Record<string, string | string[]>;
  const activityId = routeParam(params.id);
  const imageId = routeParam(params.imageId);
  if (!activityId || !imageId) {
    res.status(400).json({ error: 'Imagen no valida' });
    return;
  }

  const ctx = await loadActivityWorkReportContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  if (!(await canEditOwnWorkReportInWorkspace(actingUser, ctx, req.workspaceId!))) {
    res.status(403).json({
      error: 'No puedes modificar este informe de trabajo. Elimina el albaran para rehacerlo.',
    });
    return;
  }

  const previousReport = getActivityWorkReport(ctx.existing, actingUser.id);
  if (!previousReport) {
    res.status(404).json({ error: 'Informe no encontrado' });
    return;
  }

  const found = findWorkReportZoneImage(previousReport, imageId);
  if (!found) {
    res.status(404).json({ error: 'Imagen no encontrada' });
    return;
  }

  try {
    await deleteWorkReportZoneImageFile(found.image.storageKey);
  } catch (err) {
    console.error('Error al eliminar imagen del informe', err);
  }

  const nextZones = getActivityWorkReportZones(previousReport)
    .map((zone) =>
      zone.id === found.zone.id
        ? { ...zone, images: zone.images.filter((image) => image.id !== imageId) }
        : zone,
    )
    .filter((zone) => zone.title || zone.notes || zone.images.length > 0);

  const report = buildActivityWorkReportPayload({
    user: actingUser,
    workedMinutes: previousReport.workedMinutes,
    zones: nextZones,
    status: previousReport.status === 'submitted' ? 'submitted' : 'draft',
    existing: previousReport,
  });

  const updated = await persistActivityWorkReport(ctx, report, req.workspaceId!, actingUser);
  if (!updated) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  res.json(updated);
});

router.put('/extra-items', async (req, res) => {
  const activityId = routeParam((req.params as { id: string | string[] }).id);
  if (!activityId) {
    res.status(400).json({ error: 'Actividad no valida' });
    return;
  }

  const ctx = await loadActivityWorkReportContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const activityType = resolveActivityType(ctx.existing.type, ctx.activityTypes);
  if (!activityTypeUsesWorkReport(activityType)) {
    res.status(403).json({ error: 'Este tipo de actividad no usa informes de trabajo' });
    return;
  }

  if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  const documents = await listAllInWorkspace<Document>(DB_NAMES.documents, req.workspaceId!);
  if (
    !canEditActivityWorkReportExtraItems(actingUser, {
      activity: ctx.existing,
      event: ctx.linkedEvent,
      documents,
    })
  ) {
    res.status(403).json({
      error:
        'No puedes modificar los conceptos del informe. Elimina los albaranes para rehacerlos.',
    });
    return;
  }

  const body = req.body as WorkReportExtraItemsBody;
  const items = parseWorkReportExtraItemsInput(body.items);
  if (!items) {
    res.status(400).json({ error: 'Conceptos no validos' });
    return;
  }

  const updated = await updateDoc<Activity>(DB_NAMES.activities, ctx.existing.id, {
    workReportExtraItems: items.length > 0 ? items : undefined,
  });
  if (!updated) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    updated.clientId,
    req.workspaceId!,
  );
  if (client) {
    await notifyActivityChanged(req.workspaceId!, req.user!, 'activity.updated', updated, client, {
      previous: ctx.existing,
      linkedEvent: ctx.linkedEvent,
      previousLinkedEvent: ctx.linkedEvent,
    });
  }

  await syncWorkerDeliveryNotesAfterExtraItemsChange({
    workspaceId: req.workspaceId!,
    activity: updated,
    activityTypes: ctx.activityTypes,
    actingUser,
  });

  res.json(updated);
});

export default router;
