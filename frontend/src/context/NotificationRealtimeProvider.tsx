import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Portal from '@/components/Portal';
import { NotificationsIcon } from '@/components/icons/NotificationsIcon';
import type { Notification, NotificationWsMessage } from '@shared/types';
import { authService } from '@/api';
import { getWorkspaceId } from '@/api/client';
import { useWorkspace } from '@/context/useWorkspace';
import { APP_EVENTS } from '@/lib/appEvents';
import { getNotificationsWebSocketUrl } from '@/lib/notificationsWs';
import styles from '@/components/NotificationToast.module.css';

const TOAST_DURATION_MS = 3000;
const RECONNECT_DELAY_MS = 3000;

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

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (!authService.isAuthenticated() || !currentWorkspace) {
      return;
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const url = getNotificationsWebSocketUrl();
      if (!url || getWorkspaceId() !== currentWorkspace.id) return;

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onmessage = handleMessage;

      socket.onclose = () => {
        if (cancelled || socketRef.current !== socket) return;
        socketRef.current = null;
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearHideTimer();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [clearHideTimer, currentWorkspace, handleMessage]);

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
