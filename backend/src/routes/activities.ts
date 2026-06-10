import { Router } from 'express';
import type { Activity, CalendarEvent, Client } from '@shared/types';
import {
  aggregateEventTimeRange,
  getAssigneeIdsFromSlots,
} from '@shared/types';
import {
  applyWorkerSignatureFromUser,
  canEditActivity,
  canUpdateActivityAssigneeSlotHours,
  isActivitySignedByWorker,
  isAssigneeSlotScheduleOnlyUpdate,
  isAssigneeSlotEnded,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { clearActivityReferences } from '../db/activityReferences.js';
import {
  deleteDoc,
  findByFieldInWorkspace,
  getById,
  getByIdInWorkspace,
  insertDoc,
  listAllInWorkspace,
  updateDoc,
  withDbTransaction,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { getFreshAuthUser } from '../services/authUser.js';
import { getWorkspaceFeatureSettings } from '../services/workspaceFeatureSettings.js';
import { notifyActivityChanged } from '../services/notifications.js';
import { filterByDateRange } from '../utils/dateFilter.js';
import {
  canUserAccessActivity,
  filterActivitiesForUser,
} from '../utils/activityVisibility.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', async (req, res) => {
  const { clientId, from, to } = req.query;
  const fromStr = typeof from === 'string' ? from : undefined;
  const toStr = typeof to === 'string' ? to : undefined;

  let activities: Activity[];
  if (typeof clientId === 'string') {
    const client = await getByIdInWorkspace(DB_NAMES.clients, clientId, req.workspaceId!);
    if (!client) {
      res.status(404).json({ error: 'Contacto no encontrado' });
      return;
    }
    activities = await findByFieldInWorkspace<Activity>(
      DB_NAMES.activities,
      'clientId',
      clientId,
      req.workspaceId!,
    );
  } else {
    activities = await listAllInWorkspace<Activity>(DB_NAMES.activities, req.workspaceId!);
  }

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const visible = filterActivitiesForUser(activities, events, req.user!);
  res.json(filterByDateRange(visible, fromStr, toStr));
});

router.get('/:id', async (req, res) => {
  const activity = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    req.params.id,
    req.workspaceId!,
  );
  if (!activity) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  if (!canUserAccessActivity(req.user!, activity, events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  res.json(activity);
});

router.post('/', async (req, res) => {
  const body = req.body as Omit<Activity, 'id' | 'createdAt' | 'workspaceId'>;
  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, body.clientId, req.workspaceId!);
  if (!client) {
    res.status(400).json({ error: 'Contacto no encontrado en este workspace' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  const features = await getWorkspaceFeatureSettings(req.workspaceId!);
  let activity: Activity = {
    ...body,
    workspaceId: req.workspaceId!,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  if (features.workerSignaturesEnabled) {
    activity = applyWorkerSignatureFromUser(activity, actingUser, null);
  }
  await insertDoc(DB_NAMES.activities, activity);
  await notifyActivityChanged(req.workspaceId!, req.user!, 'activity.created', activity, client);
  res.status(201).json(activity);
});

router.put('/:id', async (req, res) => {
  const existing = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    req.params.id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const updates = req.body as Partial<Activity>;
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const linkedEvent = events.find((event) => event.activityId === existing.id) ?? null;

  const {
    workspaceId: _workspaceId,
    workerSignature: _clientSignature,
    workReports: _workReports,
    workReportExtraItems: _workReportExtraItems,
    ...safeUpdates
  } = updates;

  const canEdit = canEditActivity(req.user, { activity: existing, event: linkedEvent });
  const canEditSlotHoursOnly =
    !canEdit &&
    isAssigneeSlotScheduleOnlyUpdate(safeUpdates) &&
    Array.isArray(safeUpdates.assigneeSlots) &&
    canUpdateActivityAssigneeSlotHours(req.user, {
      activity: existing,
      event: linkedEvent,
      nextAssigneeSlots: safeUpdates.assigneeSlots,
    });

  if (!canEdit && !canEditSlotHoursOnly) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  if (updates.clientId && updates.clientId !== existing.clientId) {
    const client = await getByIdInWorkspace(DB_NAMES.clients, updates.clientId, req.workspaceId!);
    if (!client) {
      res.status(400).json({ error: 'Contacto no encontrado en este workspace' });
      return;
    }
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  const features = await getWorkspaceFeatureSettings(req.workspaceId!);
  const mergedForCheck = { ...existing, ...safeUpdates };
  const addingOwnSignature =
    features.workerSignaturesEnabled &&
    Boolean(
      safeUpdates.assigneeSlots?.some(
        (slot) =>
          slot.userId === actingUser.id &&
          Boolean(slot.workerSignature?.imageDataUrl?.trim()) &&
          !isActivitySignedByWorker(existing, linkedEvent, actingUser.id),
      ),
    );
  if (
    addingOwnSignature &&
    !isAssigneeSlotEnded(mergedForCheck, linkedEvent, actingUser.id)
  ) {
    res.status(400).json({
      error:
        'Solo puedes firmar cuando haya finalizado la fecha y hora de tu tramo asignado.',
    });
    return;
  }

  const payload: Partial<Activity> = { ...safeUpdates };
  if (features.workerSignaturesEnabled && 'workerSignature' in updates) {
    payload.workerSignature = updates.workerSignature;
  }

  const eventsBeforeUpdate = await listAllInWorkspace<CalendarEvent>(
    DB_NAMES.events,
    req.workspaceId!,
  );
  const linkedEventBefore = eventsBeforeUpdate.find((event) => event.activityId === existing.id) ?? null;

  const updated = await withDbTransaction(async () => {
    const saved = await updateDoc<Activity>(DB_NAMES.activities, req.params.id, payload);
    if (!saved) return null;

    if (updates.assigneeSlots != null) {
      const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
      const linked = events.filter((event) => event.activityId === saved.id);
      const assigneeIds = getAssigneeIdsFromSlots(saved.assigneeSlots ?? []);
      const { startTime, endTime } = aggregateEventTimeRange(saved.assigneeSlots ?? []);

      for (const event of linked) {
        await updateDoc<CalendarEvent>(DB_NAMES.events, event.id, {
          assignedTo: assigneeIds,
          startTime,
          endTime,
          date: saved.date,
          activityId: saved.id,
        });
      }
    }

    return saved;
  });

  if (!updated) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, updated.clientId, req.workspaceId!);
  const eventsAfterUpdate = await listAllInWorkspace<CalendarEvent>(
    DB_NAMES.events,
    req.workspaceId!,
  );
  const linkedEventAfter =
    eventsAfterUpdate.find((event) => event.activityId === updated.id) ?? linkedEventBefore;

  await notifyActivityChanged(req.workspaceId!, req.user!, 'activity.updated', updated, client, {
    previous: existing,
    linkedEvent: linkedEventAfter,
    previousLinkedEvent: linkedEventBefore,
  });

  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const existing = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    req.params.id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }
  if (!canEditActivity(req.user, { activity: existing })) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, existing.clientId, req.workspaceId!);
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const linkedEvent = events.find((event) => event.activityId === existing.id) ?? null;

  await notifyActivityChanged(req.workspaceId!, req.user!, 'activity.deleted', existing, client, {
    linkedEvent,
  });

  const ok = await withDbTransaction(async () => {
    await clearActivityReferences(req.params.id, req.workspaceId!);
    return deleteDoc(DB_NAMES.activities, req.params.id);
  });
  if (!ok) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }
  res.status(204).send();
});

export default router;
