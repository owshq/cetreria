import { Router } from 'express';
import type { Activity, CalendarEvent, Client } from '@shared/types';
import { canEditActivity } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  getByIdInWorkspace,
  insertDoc,
  listAllInWorkspace,
  updateDoc,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import {
  notifyActivityChanged,
  notifyEventAssigned,
  notifyEventCancelled,
  notifyEventUpdated,
} from '../services/notifications.js';
import { filterEventsForUser } from '../utils/activityVisibility.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function getLinkedActivity(
  event: CalendarEvent,
  workspaceId: string,
): Promise<Activity | null> {
  if (!event.activityId) return null;
  return getByIdInWorkspace<Activity>(DB_NAMES.activities, event.activityId, workspaceId);
}

async function getEventClient(
  event: CalendarEvent,
  workspaceId: string,
): Promise<Client | null> {
  if (!event.clientId) return null;
  return getByIdInWorkspace<Client>(DB_NAMES.clients, event.clientId, workspaceId);
}

router.get('/', async (req, res) => {
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const activities = await listAllInWorkspace<Activity>(DB_NAMES.activities, req.workspaceId!);
  res.json(filterEventsForUser(events, req.user!, activities));
});

router.get('/:id', async (req, res) => {
  const event = await getByIdInWorkspace<CalendarEvent>(
    DB_NAMES.events,
    req.params.id,
    req.workspaceId!,
  );
  if (!event) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }
  const activities = await listAllInWorkspace<Activity>(DB_NAMES.activities, req.workspaceId!);
  const visibleEvents = filterEventsForUser([event], req.user!, activities);
  if (visibleEvents.length === 0) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }
  res.json(event);
});

router.post('/', async (req, res) => {
  const body = req.body as Omit<CalendarEvent, 'id' | 'history' | 'workspaceId'>;
  if (body.clientId) {
    const client = await getByIdInWorkspace(DB_NAMES.clients, body.clientId, req.workspaceId!);
    if (!client) {
      res.status(400).json({ error: 'Contacto no encontrado en este workspace' });
      return;
    }
  }
  if (body.activityId) {
    const activity = await getByIdInWorkspace(
      DB_NAMES.activities,
      body.activityId,
      req.workspaceId!,
    );
    if (!activity) {
      res.status(400).json({ error: 'Actividad no encontrada en este workspace' });
      return;
    }
  }

  const event: CalendarEvent = {
    ...body,
    workspaceId: req.workspaceId!,
    id: crypto.randomUUID(),
    history: [
      {
        action: 'Creado',
        user: req.user?.name ?? 'Sistema',
        timestamp: new Date().toISOString(),
      },
    ],
  };
  await insertDoc(DB_NAMES.events, event);
  res.status(201).json(event);
});

router.put('/:id', async (req, res) => {
  const existing = await getByIdInWorkspace<CalendarEvent>(
    DB_NAMES.events,
    req.params.id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  const linkedActivity = await getLinkedActivity(existing, req.workspaceId!);
  if (!canEditActivity(req.user, { activity: linkedActivity, event: existing })) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const updates = req.body as Partial<CalendarEvent>;
  const updatedEvent: CalendarEvent = {
    ...existing,
    ...updates,
    workspaceId: req.workspaceId!,
    history: [
      ...existing.history,
      {
        action: 'Modificado',
        user: req.user?.name ?? 'Sistema',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const updated = await updateDoc<CalendarEvent>(DB_NAMES.events, req.params.id, updatedEvent);
  const client = await getEventClient(updated!, req.workspaceId!);
  const actor = req.user!;

  // Las actividades vinculadas ya notifican a sus asignados desde activities.ts.
  if (!updated!.activityId) {
    const newAssignees = updated!.assignedTo.filter((id) => !existing.assignedTo.includes(id));
    if (newAssignees.length > 0) {
      await notifyEventAssigned(req.workspaceId!, actor, updated!, client, newAssignees);
    }

    const scheduleChanged =
      existing.date !== updated!.date ||
      existing.startTime !== updated!.startTime ||
      existing.endTime !== updated!.endTime;

    if (scheduleChanged) {
      await notifyEventUpdated(req.workspaceId!, actor, updated!, client);
    }
  }

  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  const existing = await getByIdInWorkspace<CalendarEvent>(
    DB_NAMES.events,
    req.params.id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }

  const linkedActivity = await getLinkedActivity(existing, req.workspaceId!);
  if (!canEditActivity(req.user, { activity: linkedActivity, event: existing })) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const client = await getEventClient(existing, req.workspaceId!);

  if (linkedActivity) {
    await notifyActivityChanged(
      req.workspaceId!,
      req.user!,
      'activity.deleted',
      linkedActivity,
      client,
      { linkedEvent: existing },
    );
  } else {
    await notifyEventCancelled(req.workspaceId!, req.user!, existing, client);
  }

  const ok = await deleteDoc(DB_NAMES.events, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Evento no encontrado' });
    return;
  }
  res.status(204).send();
});

export default router;
