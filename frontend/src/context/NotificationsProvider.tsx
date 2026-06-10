import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { notificationsService } from '@/api/notifications';
import { authService } from '@/api';
import type { Notification } from '@shared/types';
import { notificationDedupeIdentity } from '@shared/types';
import { groupNotificationsByCategory } from '@/lib/notifications';
import { APP_EVENTS } from '@/lib/appEvents';
import { useActivityModal } from '@/context/ActivityModalContext';

function dedupeNotificationsByIdentity(items: Notification[]): Notification[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const seen = new Set<string>();
  const result: Notification[] = [];

  for (const item of sorted) {
    const identity = notificationDedupeIdentity(item);
    if (!identity) {
      result.push(item);
      continue;
    }
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }

  return result;
}

function mergeNotifications(
  current: Notification[],
  incoming: Notification[],
): Notification[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return dedupeNotificationsByIdentity([...byId.values()]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function applyNotificationsResponse(notifications: Notification[]) {
  const deduped = dedupeNotificationsByIdentity(notifications);
  return {
    notifications: deduped,
    unreadCount: deduped.filter((item) => !item.readAt).length,
  };
}

type NotificationsContextValue = {
  notifications: Notification[];
  groups: ReturnType<typeof groupNotificationsByCategory>;
  unreadCount: number;
  loading: boolean;
  error: boolean;
  markSeen: (id: string) => Promise<void>;
  markAllSeen: () => Promise<void>;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const userId = authService.getCurrentUser()?.id ?? null;
  const { onActivitySaved } = useActivityModal();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setError(false);
      setLoading(false);
      return;
    }

    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const result = await notificationsService.getAll();
      const next = applyNotificationsResponse(result.notifications);
      setNotifications(next.notifications);
      setUnreadCount(next.unreadCount);
      setError(false);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => onActivitySaved(load), [onActivitySaved, load]);

  useEffect(() => {
    const handleReceived = (event: Event) => {
      const detail = (event as CustomEvent<{ notifications: Notification[] }>).detail;
      if (!detail?.notifications?.length) return;

      setNotifications((current) => {
        const merged = mergeNotifications(current, detail.notifications);
        setUnreadCount(merged.filter((item) => !item.readAt).length);
        return merged;
      });
      setError(false);
    };

    window.addEventListener(APP_EVENTS.notificationsReceived, handleReceived);
    return () => window.removeEventListener(APP_EVENTS.notificationsReceived, handleReceived);
  }, []);

  const markSeen = useCallback(async (id: string) => {
    try {
      const result = await notificationsService.markRead([id]);
      const next = applyNotificationsResponse(result.notifications);
      setNotifications(next.notifications);
      setUnreadCount(next.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  const markAllSeen = useCallback(async () => {
    try {
      const result = await notificationsService.markRead();
      const next = applyNotificationsResponse(result.notifications);
      setNotifications(next.notifications);
      setUnreadCount(next.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  const groups = useMemo(() => groupNotificationsByCategory(notifications), [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      groups,
      unreadCount,
      loading,
      error,
      markSeen,
      markAllSeen,
      refresh: load,
    }),
    [notifications, groups, unreadCount, loading, error, markSeen, markAllSeen, load],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
