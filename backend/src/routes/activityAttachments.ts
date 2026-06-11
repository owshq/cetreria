import crypto from 'crypto';
import express, { Router } from 'express';
import type { Activity, ActivityAttachment, CalendarEvent } from '@shared/types';
import {
  MAX_ACTIVITY_ATTACHMENTS,
  canEditActivity,
  canManageFinishedActivityDocuments,
  findActivityAttachment,
  isAllowedDocumentSourceMimeType,
  mimeTypeToExtension,
  normalizeActivityAttachments,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getByIdInWorkspace, listAllInWorkspace, updateDoc } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { getFreshAuthUser } from '../services/authUser.js';
import {
  buildActivityAttachmentStorageKey,
  deleteActivityAttachmentFile,
  downloadActivityAttachmentFile,
  uploadActivityAttachmentFile,
} from '../services/activityAttachmentFiles.js';
import { canUserAccessActivity } from '../utils/activityVisibility.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router({ mergeParams: true });

router.use(authRequired);
router.use(workspaceRequired);

async function loadActivityContext(activityId: string, workspaceId: string) {
  const existing = await getByIdInWorkspace<Activity>(DB_NAMES.activities, activityId, workspaceId);
  if (!existing) return null;
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
  const linkedEvent = events.find((event) => event.activityId === activityId) ?? null;
  return { existing, events, linkedEvent };
}

function canManageActivityAttachments(
  user: { id: string; role: 'admin' | 'user' },
  activity: Activity,
  event: CalendarEvent | null,
): boolean {
  if (canEditActivity(user, { activity, event })) return true;
  return canManageFinishedActivityDocuments(user, { activity, event });
}

router.post(
  '/',
  express.raw({
    type: (req) => {
      const contentType = req.headers['content-type'];
      return typeof contentType === 'string' && isAllowedDocumentSourceMimeType(contentType);
    },
    limit: '15mb',
  }),
  async (req, res) => {
    const params = req.params as Record<string, string | string[]>;
    const activityId = routeParam(params.id);
    if (!activityId) {
      res.status(400).json({ error: 'Actividad no valida' });
      return;
    }

    const ctx = await loadActivityContext(activityId, req.workspaceId!);
    if (!ctx) {
      res.status(404).json({ error: 'Actividad no encontrada' });
      return;
    }

    if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
      res.status(403).json({ error: 'Permiso denegado' });
      return;
    }

    const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
    if (!canManageActivityAttachments(actingUser, ctx.existing, ctx.linkedEvent)) {
      res.status(403).json({ error: 'No puedes adjuntar documentos a esta actividad' });
      return;
    }

    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !isAllowedDocumentSourceMimeType(contentType)) {
      res.status(400).json({
        error: 'Formato no valido. Usa PDF o imagen (JPEG, PNG, WebP).',
      });
      return;
    }

    const fileBytes = req.body;
    if (!Buffer.isBuffer(fileBytes) || fileBytes.length === 0) {
      res.status(400).json({ error: 'El archivo esta vacio.' });
      return;
    }

    const attachments = normalizeActivityAttachments(ctx.existing.attachments);
    if (attachments.length >= MAX_ACTIVITY_ATTACHMENTS) {
      res.status(400).json({
        error: `Maximo ${MAX_ACTIVITY_ATTACHMENTS} archivos por actividad.`,
      });
      return;
    }

    const attachmentId = crypto.randomUUID();
    const mimeType = contentType.split(';')[0]?.trim().toLowerCase();
    const storageKey = buildActivityAttachmentStorageKey(
      req.workspaceId!,
      activityId,
      attachmentId,
      mimeType,
    );
    const rawFilename = req.headers['x-filename'];
    const filename =
      typeof rawFilename === 'string' && rawFilename.trim()
        ? rawFilename.trim().slice(0, 180)
        : `adjunto-${attachmentId}.${mimeTypeToExtension(mimeType) ?? 'bin'}`;

    try {
      await uploadActivityAttachmentFile(storageKey, fileBytes, mimeType);
    } catch (err) {
      console.error('Error al subir adjunto de actividad', err);
      res.status(500).json({ error: 'No se pudo guardar el archivo.' });
      return;
    }

    const attachment: ActivityAttachment = {
      id: attachmentId,
      storageKey,
      mimeType,
      filename,
      uploadedAt: new Date().toISOString(),
      uploadedByUserId: actingUser.id,
    };

    const updated = await updateDoc<Activity>(DB_NAMES.activities, activityId, {
      attachments: [...attachments, attachment],
    });

    if (!updated) {
      res.status(500).json({ error: 'No se pudo actualizar la actividad.' });
      return;
    }

    res.status(201).json(updated);
  },
);

router.get('/:attachmentId/file', async (req, res) => {
  const params = req.params as Record<string, string | string[]>;
  const activityId = routeParam(params.id);
  const attachmentId = routeParam(params.attachmentId);
  if (!activityId || !attachmentId) {
    res.status(400).json({ error: 'Adjunto no valido' });
    return;
  }

  const ctx = await loadActivityContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  if (!canUserAccessActivity(req.user!, ctx.existing, ctx.events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const attachment = findActivityAttachment(
    normalizeActivityAttachments(ctx.existing.attachments),
    attachmentId,
  );
  if (!attachment) {
    res.status(404).json({ error: 'Adjunto no encontrado' });
    return;
  }

  const bytes = await downloadActivityAttachmentFile(attachment.storageKey);
  if (!bytes) {
    res.status(404).json({ error: 'Archivo no encontrado' });
    return;
  }

  const ext = mimeTypeToExtension(attachment.mimeType) ?? 'bin';
  const filename = attachment.filename || `adjunto-${attachmentId}.${ext}`;
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(Buffer.from(bytes));
});

router.delete('/:attachmentId', async (req, res) => {
  const params = req.params as Record<string, string | string[]>;
  const activityId = routeParam(params.id);
  const attachmentId = routeParam(params.attachmentId);
  if (!activityId || !attachmentId) {
    res.status(400).json({ error: 'Adjunto no valido' });
    return;
  }

  const ctx = await loadActivityContext(activityId, req.workspaceId!);
  if (!ctx) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  if (!canManageActivityAttachments(actingUser, ctx.existing, ctx.linkedEvent)) {
    res.status(403).json({ error: 'No puedes eliminar adjuntos de esta actividad' });
    return;
  }

  const attachments = normalizeActivityAttachments(ctx.existing.attachments);
  const attachment = findActivityAttachment(attachments, attachmentId);
  if (!attachment) {
    res.status(404).json({ error: 'Adjunto no encontrado' });
    return;
  }

  try {
    await deleteActivityAttachmentFile(attachment.storageKey);
  } catch (err) {
    console.error('Error al eliminar adjunto de actividad', err);
    res.status(500).json({ error: 'No se pudo eliminar el archivo.' });
    return;
  }

  const updated = await updateDoc<Activity>(DB_NAMES.activities, activityId, {
    attachments: attachments.filter((item) => item.id !== attachmentId),
  });

  if (!updated) {
    res.status(500).json({ error: 'No se pudo actualizar la actividad.' });
    return;
  }

  res.json(updated);
});

export default router;
