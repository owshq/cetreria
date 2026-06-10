import type { Notification, NotificationCategory } from '@shared/types';
import { NOTIFICATION_CATEGORY_LABELS } from '@shared/types';

export type NotificationGroup = {
  category: NotificationCategory;
  label: string;
  items: Notification[];
};

export function groupNotificationsByCategory(
  notifications: Notification[],
): NotificationGroup[] {
  const groups = new Map<NotificationCategory, Notification[]>();

  for (const notification of notifications) {
    const list = groups.get(notification.category) ?? [];
    list.push(notification);
    groups.set(notification.category, list);
  }

  const order: NotificationCategory[] = [
    'calendar',
    'activity',
    'document',
    'client',
    'report',
    'team',
  ];

  return order
    .filter((category) => groups.has(category))
    .map((category) => ({
      category,
      label: NOTIFICATION_CATEGORY_LABELS[category],
      items: groups.get(category)!,
    }));
}

export function isNotificationUnread(notification: Notification): boolean {
  return !notification.readAt;
}
