import { addDays, format, isWithinInterval, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Activity,
  CalendarEvent,
  Client,
  Document,
  Notification,
  NotificationAction,
  User,
  WorkspaceMember,
} from '@shared/types';
import {
  resolveDocumentDisplayName,
  DOCUMENT_TYPE_LABELS,
  getActivityAssigneeIds,
  getNotificationCategory,
  isActivityPast,
  isWorkspaceAdmin,
  normalizeActivityAssigneeSlots,
  NOTIFICATION_ACTION_LABELS,
  notificationDedupeIdentity,
} from '@shared/types';
import { getWorkspaceBillingSettings } from './workspaceBillingSettings.js';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  findByFieldInWorkspace,
  insertDoc,
  listAll,
  listAllInWorkspace,
  updateDoc,
  withDbTransaction,
} from '../db/repository.js';
import { broadcastNotifications } from '../realtime/notificationsHub.js';

const UPCOMING_DAYS = 14;
const OVERDUE_LOOKBACK_DAYS = 7;
const MAX_NOTIFICATIONS_PER_USER = 200;

type Actor = Pick<User, 'id' | 'name'>;

type EmitInput = {
  workspaceId: string;
  action: NotificationAction;
  actor: Actor;
  recipientUserIds: string[];
  title: string;
  message: string;
  href: string;
  entityType: string;
  entityId: string;
  dedupeKey?: string;
  linkedActivityId?: string;
  broadcast?: boolean;
};

function uniqueRecipients(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function recipientsExceptActor(assigneeIds: string[], actorId: string): string[] {
  return uniqueRecipients(assigneeIds.filter((id) => id !== actorId));
}

function isActivityCreatedByActor(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  actorId: string,
): boolean {
  if (activity.userId === actorId) return true;
  if (event?.createdBy === actorId) return true;
  return false;
}

async function adminRecipientsForOperatorOwnActivityDelete(
  workspaceId: string,
  actor: Actor,
  activity: Activity,
  event: CalendarEvent | null | undefined,
): Promise<string[]> {
  if (!isActivityCreatedByActor(activity, event, actor.id)) return [];

  const admins = await getWorkspaceAdminUserIds(workspaceId);
  if (admins.includes(actor.id)) return [];

  return recipientsExceptActor(admins, actor.id);
}

function actionDedupeKey(action: NotificationAction, entityId: string): string {
  return `${action}:${entityId}`;
}

function calendarEventDedupeKey(action: NotificationAction, event: CalendarEvent): string {
  if (event.activityId) {
    return `${action}:activity:${event.activityId}`;
  }
  return `${action}:event:${event.id}`;
}

function notificationMatchesDedupe(
  item: Notification,
  dedupeKey: string,
  action: NotificationAction,
  entityType: string,
  entityId: string,
  linkedActivityId?: string,
): boolean {
  if (item.dedupeKey === dedupeKey) return true;
  if (item.action !== action) return false;

  if (item.entityType === entityType && item.entityId === entityId) return true;

  if (linkedActivityId) {
    const activityHref = `/activities/${linkedActivityId}`;
    if (item.href === activityHref || item.href.startsWith(`${activityHref}/`)) {
      return true;
    }

    if (item.dedupeKey === `${action}:activity:${linkedActivityId}`) return true;
    if (item.dedupeKey === actionDedupeKey(action, entityId)) return true;
  }

  return false;
}

function slotsSignature(
  activity: Activity,
  event: CalendarEvent | null | undefined,
): string {
  return JSON.stringify(normalizeActivityAssigneeSlots(activity, event ?? null));
}

function isActivityScheduleChanged(
  previous: Activity,
  current: Activity,
  linkedEvent: CalendarEvent | null | undefined,
  previousLinkedEvent: CalendarEvent | null | undefined,
): boolean {
  if (previous.date !== current.date) return true;
  if (slotsSignature(previous, previousLinkedEvent) !== slotsSignature(current, linkedEvent)) {
    return true;
  }

  if (linkedEvent && previousLinkedEvent) {
    if (linkedEvent.date !== previousLinkedEvent.date) return true;
    if (linkedEvent.startTime !== previousLinkedEvent.startTime) return true;
    if (linkedEvent.endTime !== previousLinkedEvent.endTime) return true;
  }

  return false;
}

export async function getWorkspaceAdminUserIds(workspaceId: string): Promise<string[]> {
  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  return members
    .filter((member) => member.workspaceId === workspaceId && isWorkspaceAdmin(member.role))
    .map((member) => member.userId);
}

async function findNotificationsForUpsert(
  workspaceId: string,
  userId: string,
  input: EmitInput,
  linkedActivityId?: string,
): Promise<Notification[]> {
  const items = await findByFieldInWorkspace<Notification>(
    DB_NAMES.notifications,
    'userId',
    userId,
    workspaceId,
  );

  if (!input.dedupeKey) return [];

  return items
    .filter((item) =>
      notificationMatchesDedupe(
        item,
        input.dedupeKey!,
        input.action,
        input.entityType,
        input.entityId,
        linkedActivityId,
      ),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function emitNotifications(input: EmitInput): Promise<Notification[]> {
  const recipients = uniqueRecipients(input.recipientUserIds);
  if (recipients.length === 0) return [];

  const dedupeKey = input.dedupeKey ?? actionDedupeKey(input.action, input.entityId);
  const emitInput: EmitInput = { ...input, dedupeKey };

  const emitted = await withDbTransaction(async () => {
    const category = getNotificationCategory(emitInput.action);
    const createdAt = new Date().toISOString();
    const results: Notification[] = [];

    for (const userId of recipients) {
      const matches = await findNotificationsForUpsert(
        emitInput.workspaceId,
        userId,
        emitInput,
        emitInput.linkedActivityId,
      );

      if (matches.length > 0) {
        const [primary, ...duplicates] = matches;

        for (const duplicate of duplicates) {
          await deleteDoc(DB_NAMES.notifications, duplicate.id);
        }

        const updated = await updateDoc<Notification>(DB_NAMES.notifications, primary.id, {
          title: emitInput.title,
          message: emitInput.message,
          href: emitInput.href,
          action: emitInput.action,
          category,
          entityType: emitInput.entityType,
          entityId: emitInput.entityId,
          actorUserId: emitInput.actor.id,
          actorUserName: emitInput.actor.name,
          createdAt,
          dedupeKey,
          readAt: undefined,
        });

        if (updated) {
          results.push(updated);
        }
        continue;
      }

      const created: Notification = {
        id: crypto.randomUUID(),
        workspaceId: emitInput.workspaceId,
        userId,
        category,
        action: emitInput.action,
        title: emitInput.title,
        message: emitInput.message,
        href: emitInput.href,
        entityType: emitInput.entityType,
        entityId: emitInput.entityId,
        actorUserId: emitInput.actor.id,
        actorUserName: emitInput.actor.name,
        createdAt,
        dedupeKey,
      };
      await insertDoc(DB_NAMES.notifications, created);
      results.push(created);
    }

    await trimUserNotifications(emitInput.workspaceId, recipients);
    return results;
  });

  if (input.broadcast !== false) {
    broadcastNotifications(emitted);
  }

  return emitted;
}

async function trimUserNotifications(workspaceId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const items = await listNotificationsForUser(workspaceId, userId);
    if (items.length <= MAX_NOTIFICATIONS_PER_USER) continue;

    const toRemove = items
      .slice(MAX_NOTIFICATIONS_PER_USER)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const item of toRemove) {
      await deleteDoc(DB_NAMES.notifications, item.id);
    }
  }
}

async function dedupeStoredNotifications(
  workspaceId: string,
  userId: string,
): Promise<Notification[]> {
  const items = await findByFieldInWorkspace<Notification>(
    DB_NAMES.notifications,
    'userId',
    userId,
    workspaceId,
  );
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const seen = new Set<string>();
  const kept: Notification[] = [];
  const toDelete: string[] = [];

  for (const item of sorted) {
    const identity = notificationDedupeIdentity(item);
    if (!identity) {
      kept.push(item);
      continue;
    }
    if (seen.has(identity)) {
      toDelete.push(item.id);
      continue;
    }
    seen.add(identity);
    kept.push(item);
  }

  if (toDelete.length === 0) {
    return kept;
  }

  return withDbTransaction(async () => {
    for (const id of toDelete) {
      await deleteDoc(DB_NAMES.notifications, id);
    }
    return kept;
  });
}

export async function listNotificationsForUser(
  workspaceId: string,
  userId: string,
): Promise<Notification[]> {
  return dedupeStoredNotifications(workspaceId, userId);
}

export async function markNotificationsRead(
  workspaceId: string,
  userId: string,
  ids?: string[],
): Promise<Notification[]> {
  const items = await listNotificationsForUser(workspaceId, userId);
  const readAt = new Date().toISOString();
  const targetIds = ids?.length ? new Set(ids) : null;

  for (const item of items) {
    if (item.readAt) continue;
    if (targetIds && !targetIds.has(item.id)) continue;
    await updateDoc<Notification>(DB_NAMES.notifications, item.id, { readAt });
  }

  return listNotificationsForUser(workspaceId, userId);
}

function eventHref(event: CalendarEvent): string {
  return event.activityId
    ? `/activities/${event.activityId}`
    : `/calendar?date=${event.date}`;
}

function formatEventDetail(event: CalendarEvent, clientName?: string): string {
  const eventDay = parseISO(event.date);
  const dateLabel = Number.isNaN(eventDay.getTime())
    ? event.date
    : format(eventDay, "d MMM yyyy", { locale: es });
  const timeLabel =
    event.startTime && event.endTime
      ? `${event.startTime.slice(0, 5)}–${event.endTime.slice(0, 5)}`
      : event.startTime
        ? event.startTime.slice(0, 5)
        : null;
  return [event.title || 'Sin título', clientName, dateLabel, timeLabel].filter(Boolean).join(' · ');
}

export async function syncCalendarReminders(
  workspaceId: string,
  userId: string,
  clientsById: Map<string, Client>,
  now: Date = new Date(),
): Promise<void> {
  const events = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId);
  const today = startOfDay(now);
  const horizon = addDays(today, UPCOMING_DAYS);
  const overdueCutoff = addDays(today, -OVERDUE_LOOKBACK_DAYS);
  const activeDedupeKeys = new Set<string>();

  const actor: Actor = { id: 'system', name: 'Sistema' };

  for (const event of events) {
    if (!event.assignedTo.includes(userId)) continue;

    const past = isActivityPast({ event }, now);
    const eventDay = parseISO(event.date);
    if (Number.isNaN(eventDay.getTime())) continue;

    const clientName = event.clientId ? clientsById.get(event.clientId)?.name : undefined;
    const message = formatEventDetail(event, clientName);
    const href = eventHref(event);

    if (!past && isWithinInterval(eventDay, { start: today, end: horizon })) {
      const dedupeKey = `reminder:upcoming:${event.id}`;
      activeDedupeKeys.add(dedupeKey);
      await emitNotifications({
        workspaceId,
        action: 'calendar.reminder_upcoming',
        actor,
        recipientUserIds: [userId],
        title: NOTIFICATION_ACTION_LABELS['calendar.reminder_upcoming'],
        message,
        href,
        entityType: 'event',
        entityId: event.id,
        dedupeKey,
        broadcast: false,
      });
      continue;
    }

    if (past && eventDay >= overdueCutoff) {
      const dedupeKey = `reminder:overdue:${event.id}`;
      activeDedupeKeys.add(dedupeKey);
      await emitNotifications({
        workspaceId,
        action: 'calendar.reminder_overdue',
        actor,
        recipientUserIds: [userId],
        title: NOTIFICATION_ACTION_LABELS['calendar.reminder_overdue'],
        message,
        href,
        entityType: 'event',
        entityId: event.id,
        dedupeKey,
        broadcast: false,
      });
    }
  }

  const userNotifications = await listNotificationsForUser(workspaceId, userId);
  for (const notification of userNotifications) {
    if (
      !notification.dedupeKey?.startsWith('reminder:') ||
      activeDedupeKeys.has(notification.dedupeKey)
    ) {
      continue;
    }
    await deleteDoc(DB_NAMES.notifications, notification.id);
  }
}


// --- Emit helpers per domain ---

export async function notifyEventAssigned(
  workspaceId: string,
  actor: Actor,
  event: CalendarEvent,
  client?: Client | null,
  recipientIds: string[] = event.assignedTo,
): Promise<void> {
  const recipients = recipientsExceptActor(recipientIds, actor.id);
  if (recipients.length === 0) return;

  await emitNotifications({
    workspaceId,
    action: 'calendar.assigned',
    actor,
    recipientUserIds: recipients,
    title: 'Te han asignado una actividad',
    message: formatEventDetail(event, client?.name),
    href: eventHref(event),
    entityType: 'event',
    entityId: event.id,
    linkedActivityId: event.activityId,
    dedupeKey: calendarEventDedupeKey('calendar.assigned', event),
  });
}

export async function notifyEventUpdated(
  workspaceId: string,
  actor: Actor,
  event: CalendarEvent,
  client?: Client | null,
): Promise<void> {
  const recipients = recipientsExceptActor(event.assignedTo, actor.id);
  if (recipients.length === 0) return;

  await emitNotifications({
    workspaceId,
    action: 'calendar.updated',
    actor,
    recipientUserIds: recipients,
    title: 'Actividad reprogramada',
    message: formatEventDetail(event, client?.name),
    href: eventHref(event),
    entityType: 'event',
    entityId: event.id,
    linkedActivityId: event.activityId,
    dedupeKey: calendarEventDedupeKey('calendar.updated', event),
  });
}

export async function notifyEventCancelled(
  workspaceId: string,
  actor: Actor,
  event: CalendarEvent,
  client?: Client | null,
): Promise<void> {
  const recipients = recipientsExceptActor(event.assignedTo, actor.id);
  if (recipients.length === 0) return;

  await emitNotifications({
    workspaceId,
    action: 'calendar.cancelled',
    actor,
    recipientUserIds: recipients,
    title: 'Actividad cancelada',
    message: formatEventDetail(event, client?.name),
    href: '/calendar',
    entityType: 'event',
    entityId: event.id,
    linkedActivityId: event.activityId,
    dedupeKey: calendarEventDedupeKey('calendar.cancelled', event),
  });
}

export async function notifyActivityChanged(
  workspaceId: string,
  actor: Actor,
  action: 'activity.created' | 'activity.updated' | 'activity.deleted',
  activity: Activity,
  client?: Client | null,
  context?: {
    previous?: Activity;
    linkedEvent?: CalendarEvent | null;
    previousLinkedEvent?: CalendarEvent | null;
  },
): Promise<void> {
  const linkedEvent = context?.linkedEvent ?? null;
  const message = [client?.name, activity.description].filter(Boolean).join(' · ') || 'Actividad';
  const href = `/activities/${activity.id}`;

  if (action === 'activity.deleted') {
    const assigneeRecipients = recipientsExceptActor(
      getActivityAssigneeIds(activity, linkedEvent),
      actor.id,
    );
    const adminRecipients = await adminRecipientsForOperatorOwnActivityDelete(
      workspaceId,
      actor,
      activity,
      linkedEvent,
    );
    const recipients = uniqueRecipients([...assigneeRecipients, ...adminRecipients]);
    if (recipients.length === 0) return;

    if (linkedEvent) {
      await emitNotifications({
        workspaceId,
        action: 'calendar.cancelled',
        actor,
        recipientUserIds: recipients,
        title: 'Actividad cancelada',
        message: formatEventDetail(linkedEvent, client?.name),
        href: '/calendar',
        entityType: 'event',
        entityId: linkedEvent.id,
        linkedActivityId: linkedEvent.activityId ?? activity.id,
        dedupeKey: calendarEventDedupeKey('calendar.cancelled', linkedEvent),
      });
      return;
    }

    await emitNotifications({
      workspaceId,
      action: 'activity.deleted',
      actor,
      recipientUserIds: recipients,
      title: 'Actividad eliminada',
      message,
      href: '/activities',
      entityType: 'activity',
      entityId: activity.id,
      dedupeKey: actionDedupeKey('activity.deleted', activity.id),
    });
    return;
  }

  const assigneeIds = getActivityAssigneeIds(activity, linkedEvent);

  if (action === 'activity.created') {
    const recipients = recipientsExceptActor(assigneeIds, actor.id);
    if (recipients.length === 0) return;

    if (linkedEvent) {
      await emitNotifications({
        workspaceId,
        action: 'calendar.assigned',
        actor,
        recipientUserIds: recipients,
        title: 'Te han asignado una actividad',
        message: formatEventDetail(linkedEvent, client?.name),
        href: eventHref(linkedEvent),
        entityType: 'event',
        entityId: linkedEvent.id,
        linkedActivityId: linkedEvent.activityId ?? activity.id,
        dedupeKey: calendarEventDedupeKey('calendar.assigned', linkedEvent),
      });
      return;
    }

    await emitNotifications({
      workspaceId,
      action: 'activity.created',
      actor,
      recipientUserIds: recipients,
      title: 'Nueva actividad registrada',
      message,
      href,
      entityType: 'activity',
      entityId: activity.id,
      dedupeKey: actionDedupeKey('activity.created', activity.id),
    });
    return;
  }

  const previous = context?.previous;
  if (!previous) {
    const recipients = recipientsExceptActor(assigneeIds, actor.id);
    if (recipients.length === 0) return;

    await emitNotifications({
      workspaceId,
      action: 'activity.updated',
      actor,
      recipientUserIds: recipients,
      title: 'Actividad actualizada',
      message,
      href,
      entityType: 'activity',
      entityId: activity.id,
      dedupeKey: actionDedupeKey('activity.updated', activity.id),
    });
    return;
  }

  const previousLinkedEvent = context?.previousLinkedEvent ?? linkedEvent;
  const previousAssignees = getActivityAssigneeIds(previous, previousLinkedEvent);
  const newAssignees = recipientsExceptActor(
    assigneeIds.filter((id) => !previousAssignees.includes(id)),
    actor.id,
  );
  const existingAssignees = recipientsExceptActor(
    assigneeIds.filter((id) => previousAssignees.includes(id)),
    actor.id,
  );

  if (newAssignees.length > 0 && linkedEvent) {
    await emitNotifications({
      workspaceId,
      action: 'calendar.assigned',
      actor,
      recipientUserIds: newAssignees,
      title: 'Te han asignado una actividad',
      message: formatEventDetail(linkedEvent, client?.name),
      href: eventHref(linkedEvent),
      entityType: 'event',
      entityId: linkedEvent.id,
      linkedActivityId: linkedEvent.activityId ?? activity.id,
      dedupeKey: calendarEventDedupeKey('calendar.assigned', linkedEvent),
    });
  }

  const notifyExisting = existingAssignees.filter((id) => !newAssignees.includes(id));
  if (notifyExisting.length === 0) return;

  const scheduleChanged = isActivityScheduleChanged(
    previous,
    activity,
    linkedEvent,
    previousLinkedEvent,
  );

  if (scheduleChanged && linkedEvent) {
    await emitNotifications({
      workspaceId,
      action: 'calendar.updated',
      actor,
      recipientUserIds: notifyExisting,
      title: 'Actividad reprogramada',
      message: formatEventDetail(linkedEvent, client?.name),
      href: eventHref(linkedEvent),
      entityType: 'event',
      entityId: linkedEvent.id,
      linkedActivityId: linkedEvent.activityId ?? activity.id,
      dedupeKey: calendarEventDedupeKey('calendar.updated', linkedEvent),
    });
    return;
  }

  await emitNotifications({
    workspaceId,
    action: 'activity.updated',
    actor,
    recipientUserIds: notifyExisting,
    title: 'Actividad actualizada',
    message,
    href,
    entityType: 'activity',
    entityId: activity.id,
    dedupeKey: actionDedupeKey('activity.updated', activity.id),
  });
}

export async function notifyDocumentChanged(
  workspaceId: string,
  actor: Actor,
  action: 'document.created' | 'document.updated' | 'document.deleted' | 'document.status_changed',
  document: Document,
  client?: Client | null,
  extra?: { previousStatus?: Document['status'] },
): Promise<void> {
  const typeLabel = DOCUMENT_TYPE_LABELS[document.type];
  const titles = {
    'document.created': `${typeLabel} creado`,
    'document.updated': `${typeLabel} actualizado`,
    'document.deleted': `${typeLabel} eliminado`,
    'document.status_changed': `Estado de ${typeLabel.toLowerCase()}`,
  } as const;

  const recipients = new Set<string>();
  if (document.activityId) {
    const activity = await listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId).then(
      (items) => items.find((item) => item.id === document.activityId),
    );
    if (activity) {
      const linkedEvent = await listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId).then(
        (items) => items.find((item) => item.activityId === activity.id) ?? null,
      );
      for (const userId of getActivityAssigneeIds(activity, linkedEvent)) {
        if (userId !== actor.id) recipients.add(userId);
      }
    }
  } else {
    for (const userId of await getWorkspaceAdminUserIds(workspaceId)) {
      if (userId !== actor.id) recipients.add(userId);
    }
  }

  if (recipients.size === 0) return;

  const billingSettings = await getWorkspaceBillingSettings(workspaceId);
  let message = resolveDocumentDisplayName(
    document,
    client?.name ?? '',
    billingSettings.documentFormats,
  );
  if (!message.trim()) {
    message = [document.number, client?.name].filter(Boolean).join(' · ');
  }
  if (action === 'document.status_changed' && extra?.previousStatus) {
    message = `${message} · ${extra.previousStatus} → ${document.status}`;
  }

  await emitNotifications({
    workspaceId,
    action,
    actor,
    recipientUserIds: [...recipients],
    title: titles[action],
    message,
    href: '/documents',
    entityType: 'document',
    entityId: document.id,
    dedupeKey: actionDedupeKey(action, document.id),
  });
}

export async function notifyClientChanged(
  workspaceId: string,
  actor: Actor,
  action: 'client.created' | 'client.updated',
  client: Client,
): Promise<void> {
  await emitNotifications({
    workspaceId,
    action,
    actor,
    recipientUserIds: await getWorkspaceAdminUserIds(workspaceId),
    title: action === 'client.created' ? 'Nuevo contacto' : 'Contacto actualizado',
    message: client.name,
    href: `/clients/${client.id}`,
    entityType: 'client',
    entityId: client.id,
    dedupeKey: actionDedupeKey(action, client.id),
  });
}

export async function notifyClientObservation(
  workspaceId: string,
  actor: Actor,
  client: Client,
): Promise<void> {
  await emitNotifications({
    workspaceId,
    action: 'client.observation_added',
    actor,
    recipientUserIds: await getWorkspaceAdminUserIds(workspaceId),
    title: 'Nueva observación',
    message: `${client.name} · ${actor.name}`,
    href: `/clients/${client.id}`,
    entityType: 'client',
    entityId: client.id,
    dedupeKey: actionDedupeKey('client.observation_added', client.id),
  });
}

export async function notifyReportGenerated(
  workspaceId: string,
  actor: Actor,
  reportId: string,
  clientName: string,
  periodLabel: string,
): Promise<void> {
  const admins = await getWorkspaceAdminUserIds(workspaceId);
  await emitNotifications({
    workspaceId,
    action: 'report.generated',
    actor,
    recipientUserIds: admins,
    title: 'Informe generado',
    message: `${clientName} · ${periodLabel}`,
    href: `/reports/${reportId}`,
    entityType: 'report',
    entityId: reportId,
    dedupeKey: actionDedupeKey('report.generated', reportId),
  });
}

export async function notifyTeamMemberAdded(
  workspaceId: string,
  actor: Actor,
  newUser: Pick<User, 'id' | 'name'>,
): Promise<void> {
  await emitNotifications({
    workspaceId,
    action: 'team.member_added',
    actor,
    recipientUserIds: [newUser.id],
    title: 'Acceso al workspace',
    message: `${actor.name} te ha añadido al equipo`,
    href: '/settings',
    entityType: 'user',
    entityId: newUser.id,
    dedupeKey: actionDedupeKey('team.member_added', newUser.id),
  });
}
