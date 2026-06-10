export const NOTIFICATION_CATEGORIES = [
  'calendar',
  'activity',
  'document',
  'client',
  'report',
  'team',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_ACTIONS = [
  'calendar.assigned',
  'calendar.updated',
  'calendar.cancelled',
  'calendar.reminder_upcoming',
  'calendar.reminder_overdue',
  'activity.created',
  'activity.updated',
  'activity.deleted',
  'document.created',
  'document.updated',
  'document.status_changed',
  'document.deleted',
  'client.created',
  'client.updated',
  'client.observation_added',
  'report.generated',
  'team.member_added',
] as const;

export type NotificationAction = (typeof NOTIFICATION_ACTIONS)[number];

export function getNotificationCategory(action: NotificationAction): NotificationCategory {
  return action.split('.')[0] as NotificationCategory;
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  calendar: 'Calendario',
  activity: 'Actividades',
  document: 'Documentos',
  client: 'Contactos',
  report: 'Informes',
  team: 'Equipo',
};

export const NOTIFICATION_ACTION_LABELS: Record<NotificationAction, string> = {
  'calendar.assigned': 'Asignación en calendario',
  'calendar.updated': 'Cambio en calendario',
  'calendar.cancelled': 'Evento cancelado',
  'calendar.reminder_upcoming': 'Próxima actividad',
  'calendar.reminder_overdue': 'Actividad vencida',
  'activity.created': 'Actividad creada',
  'activity.updated': 'Actividad actualizada',
  'activity.deleted': 'Actividad eliminada',
  'document.created': 'Documento creado',
  'document.updated': 'Documento actualizado',
  'document.status_changed': 'Estado de documento',
  'document.deleted': 'Documento eliminado',
  'client.created': 'Contacto creado',
  'client.updated': 'Contacto actualizado',
  'client.observation_added': 'Nueva observación',
  'report.generated': 'Informe generado',
  'team.member_added': 'Nuevo miembro',
};

export interface Notification {
  id: string;
  workspaceId: string;
  userId: string;
  category: NotificationCategory;
  action: NotificationAction;
  title: string;
  message: string;
  href: string;
  entityType: string;
  entityId: string;
  actorUserId?: string;
  actorUserName?: string;
  readAt?: string;
  createdAt: string;
  /** Evita duplicados (p. ej. recordatorios de calendario). */
  dedupeKey?: string;
}

export type NotificationWsMessage = {
  type: 'notifications.created';
  notifications: Notification[];
};

/** Identidad estable para upsert y deduplicacion en UI/DB. */
export function notificationDedupeIdentity(
  notification: Pick<Notification, 'dedupeKey' | 'action' | 'entityType' | 'entityId' | 'href'>,
): string | null {
  if (notification.dedupeKey) return notification.dedupeKey;
  if (notification.action && notification.entityType && notification.entityId) {
    return `${notification.action}:${notification.entityType}:${notification.entityId}`;
  }
  if (notification.action && notification.href) return `${notification.action}:${notification.href}`;
  return null;
}
