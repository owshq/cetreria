import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Portal from '@/components/Portal';
import { NotificationsIcon } from '@/components/icons/NotificationsIcon';
import type { Notification, NotificationWsMessage } from '@shared/types';
import { authService, notificationsService } from '@/api';
import { ApiError, getWorkspaceId } from '@/api/client';
import { useWorkspace } from '@/context/useWorkspace';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  computePollingDelayMs,
  NOTIFICATIONS_WS_RECONNECT_DELAY_MS,
  resolveNotificationsRealtimeTransport,
  shouldStopPollingAfterError,
  shouldStopWebSocketReconnect,
} from '@/lib/notificationsRealtime';
import { getNotificationsWebSocketUrl } from '@/lib/notificationsWs';
import styles from '@/components/NotificationToast.module.css';

const TOAST_DURATION_MS = 3000;

type ToastState = {
  notifications: Notification[];
};

function dispatchNotificationsReceived(notifications: Notification[]): void {
  window.dispatchEvent(
    new CustomEvent<{ notifications: Notification[] }>(APP_EVENTS.notificationsReceived, {
      detail: { notifications },
    }),
  );
}

function NotificationToastView({ notifications }: { notifications: Notification[] }) {
  const latest = notifications[notifications.length - 1];
  const extraCount = notifications.length - 1;

  return (
    <div className={styles.toastRoot} role="status" aria-live="polite">
      <div className={styles.toast}>
        <NotificationsIcon className={styles.toastIcon} />
        <div className={styles.toastBody}>
          <p className={styles.toastTitle}>{latest.title}</p>
          <p className={styles.toastMessage}>{latest.message}</p>
          {extraCount > 0 && (
            <p className={styles.toastExtra}>+{extraCount} notificaciones</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationRealtimeProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  const [toast, setToast] = useState<ToastState | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const initialPollDoneRef = useRef(false);
  const pollErrorsRef = useRef(0);
  const wsReconnectAttemptsRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (notifications: Notification[]) => {
      if (notifications.length === 0) return;
      clearHideTimer();
      setToast({ notifications });
      hideTimerRef.current = window.setTimeout(() => {
        setToast(null);
        hideTimerRef.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearHideTimer],
  );

  const handleMessage = useCallback(
    (event: MessageEvent<string>) => {
      let payload: NotificationWsMessage;
      try {
        payload = JSON.parse(event.data) as NotificationWsMessage;
      } catch {
        return;
      }

      if (payload.type !== 'notifications.created' || payload.notifications.length === 0) {
        return;
      }

      dispatchNotificationsReceived(payload.notifications);
      showToast(payload.notifications);
    },
    [showToast],
  );

  useEffect(() => {
    clearHideTimer();
    setToast(null);
    knownNotificationIdsRef.current = new Set();
    initialPollDoneRef.current = false;
    pollErrorsRef.current = 0;
    wsReconnectAttemptsRef.current = 0;

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (!authService.isAuthenticated() || !currentWorkspace) {
      return;
    }

    let cancelled = false;
    const transport = resolveNotificationsRealtimeTransport(import.meta.env.DEV);

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      pollTimerRef.current = window.setTimeout(() => {
        void pollNotifications();
      }, delayMs);
    };

    const pollNotifications = async () => {
      if (cancelled) return;
      if (!authService.isAuthenticated() || getWorkspaceId() !== currentWorkspace.id) {
        return;
      }

      try {
        const result = await notificationsService.getAll();
        pollErrorsRef.current = 0;

        const incoming = result.notifications;
        const fresh = initialPollDoneRef.current
          ? incoming.filter((item) => !knownNotificationIdsRef.current.has(item.id))
          : [];

        for (const item of incoming) {
          knownNotificationIdsRef.current.add(item.id);
        }
        initialPollDoneRef.current = true;

        if (fresh.length > 0) {
          dispatchNotificationsReceived(fresh);
          showToast(fresh);
        }
      } catch (error) {
        pollErrorsRef.current += 1;
        if (error instanceof ApiError && shouldStopPollingAfterError(error.status)) {
          return;
        }
      }

      if (!cancelled) {
        schedulePoll(computePollingDelayMs(pollErrorsRef.current));
      }
    };

    const connectWebSocket = () => {
      if (cancelled) return;

      const url = getNotificationsWebSocketUrl();
      if (!url || getWorkspaceId() !== currentWorkspace.id) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        wsReconnectAttemptsRef.current = 0;
      };

      socket.onmessage = handleMessage;

      socket.onclose = () => {
        if (cancelled || socketRef.current !== socket) return;
        socketRef.current = null;

        wsReconnectAttemptsRef.current += 1;
        if (shouldStopWebSocketReconnect(wsReconnectAttemptsRef.current)) {
          return;
        }

        reconnectTimerRef.current = window.setTimeout(
          connectWebSocket,
          NOTIFICATIONS_WS_RECONNECT_DELAY_MS,
        );
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    if (transport === 'polling') {
      void pollNotifications();
    } else {
      connectWebSocket();
    }

    return () => {
      cancelled = true;
      clearHideTimer();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [clearHideTimer, currentWorkspace, handleMessage, showToast]);

  return (
    <>
      {children}
      {toast && (
        <Portal>
          <NotificationToastView notifications={toast.notifications} />
        </Portal>
      )}
    </>
  );
}
