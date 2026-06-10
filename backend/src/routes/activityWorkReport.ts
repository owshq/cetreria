import { Router } from 'express';
import type { Activity, ActivityType, CalendarEvent, Client } from '@shared/types';
import {
  activityTypeUsesWorkReport,
  resolveActivityType,
} from '@shared/types';
import {
  buildActivityWorkReportPayload,
  canEditActivityWorkReport,
  canEditActivityWorkReportExtraItems,
  canSubmitActivityWorkReport,
  getActivityWorkReport,
  normalizeWorkReportNotes,
  parseWorkedMinutesInput,
  parseWorkReportExtraItemsInput,
  upsertActivityWorkReport,
  type ActivityWorkReportStatus,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getByIdInWorkspace, listAllInWorkspace, updateDoc } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { getFreshAuthUser } from '../services/authUser.js';
import { notifyActivityChanged } from '../services/notifications.js';
import {
  ensureActivityDeliveryNoteFromWorkReports,
  syncActivityDeliveryNoteFromWorkReports,
} from '../services/activityDeliveryNote.js';
import { canUserAccessActivity } from '../utils/activityVisibility.js';
import { routeParam } from '../utils/routeParam.js';

const router = Router({ mergeParams: true });

router.use(authRequired);
router.use(workspaceRequired);

type WorkReportBody = {
  workedMinutes?: unknown;
  notes?: unknown;
  status?: ActivityWorkReportStatus;
};

type WorkReportExtraItemsBody = {
  items?: unknown;
};

router.put('/', async (req, res) => {
  const activityId = routeParam((req.params as { id: string | string[] }).id);
  if (!activityId) {
    res.status(400).json({ error: 'Actividad no valida' });
    return;
  }

  const existing = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    activityId,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const activityTypes = await listAllInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    req.workspaceId!,
  );
  const activityType = resolveActivityType(existing.type, activityTypes);
  if (!activityTypeUsesWorkReport(activityType)) {
    res.status(403).json({ error: 'Este tipo de actividad no usa informes de trabajo' });
    return;
  }

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const linkedEvent = events.find((event) => event.activityId === existing.id) ?? null;

  if (!canUserAccessActivity(req.user!, existing, events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  const body = req.body as WorkReportBody;
  const status: ActivityWorkReportStatus = body.status === 'draft' ? 'draft' : 'submitted';
  const workedMinutes = parseWorkedMinutesInput(body.workedMinutes);

  if (!workedMinutes) {
    res.status(400).json({ error: 'Indica horas y minutos reales (mayor que 0)' });
    return;
  }

  if (
    !canEditActivityWorkReport(actingUser, {
      activity: existing,
      event: linkedEvent,
      targetUserId: actingUser.id,
    })
  ) {
    res.status(403).json({ error: 'No puedes modificar este informe de trabajo' });
    return;
  }

  if (
    !canSubmitActivityWorkReport(actingUser, { activity: existing, event: linkedEvent })
  ) {
    res.status(400).json({
      error: 'Solo puedes completar el informe de trabajo cuando la actividad ya haya finalizado',
    });
    return;
  }

  const notes = normalizeWorkReportNotes(body.notes);
  const previousReport = getActivityWorkReport(existing, actingUser.id);
  const report = buildActivityWorkReportPayload({
    user: actingUser,
    workedMinutes,
    notes,
    status,
    existing: previousReport,
  });

  const merged = upsertActivityWorkReport(existing, report);
  const updated = await updateDoc<Activity>(DB_NAMES.activities, existing.id, {
    workReports: merged.workReports,
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
      previous: existing,
      linkedEvent,
      previousLinkedEvent: linkedEvent,
    });
  }

  if (status === 'submitted') {
    await ensureActivityDeliveryNoteFromWorkReports({
      workspaceId: req.workspaceId!,
      activity: updated,
      event: linkedEvent,
      activityTypes,
      actingUser,
    });
  }

  res.json(updated);
});

router.put('/extra-items', async (req, res) => {
  const activityId = routeParam((req.params as { id: string | string[] }).id);
  if (!activityId) {
    res.status(400).json({ error: 'Actividad no valida' });
    return;
  }

  const existing = await getByIdInWorkspace<Activity>(
    DB_NAMES.activities,
    activityId,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Actividad no encontrada' });
    return;
  }

  const activityTypes = await listAllInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    req.workspaceId!,
  );
  const activityType = resolveActivityType(existing.type, activityTypes);
  if (!activityTypeUsesWorkReport(activityType)) {
    res.status(403).json({ error: 'Este tipo de actividad no usa informes de trabajo' });
    return;
  }

  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, req.workspaceId!);
  const linkedEvent = events.find((event) => event.activityId === existing.id) ?? null;

  if (!canUserAccessActivity(req.user!, existing, events)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const actingUser = (await getFreshAuthUser(req.user!.id)) ?? req.user!;
  if (
    !canEditActivityWorkReportExtraItems(actingUser, {
      activity: existing,
      event: linkedEvent,
    })
  ) {
    res.status(403).json({ error: 'No puedes modificar los conceptos del informe de trabajo' });
    return;
  }

  const body = req.body as WorkReportExtraItemsBody;
  const items = parseWorkReportExtraItemsInput(body.items);
  if (!items) {
    res.status(400).json({ error: 'Conceptos no validos' });
    return;
  }

  const updated = await updateDoc<Activity>(DB_NAMES.activities, existing.id, {
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
      previous: existing,
      linkedEvent,
      previousLinkedEvent: linkedEvent,
    });
  }

  await syncActivityDeliveryNoteFromWorkReports({
    workspaceId: req.workspaceId!,
    activity: updated,
    event: linkedEvent,
    activityTypes,
    actingUser,
  });

  res.json(updated);
});

export default router;
