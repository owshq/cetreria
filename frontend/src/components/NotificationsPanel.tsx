import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { useNotifications } from '@/hooks/useNotifications';
import { cx } from '@/lib/cx';
import { groupNotificationsByCategory, isNotificationUnread } from '@/lib/notifications';
import styles from './TopBar.module.css';

const NOTIFICATIONS_BATCH_SIZE = 10;

type NotificationsPanelProps = {
  open: boolean;
  onClose: () => void;
  showTitle?: boolean;
  className?: string;
  layout?: 'dropdown' | 'sidebar';
  /** Si false, no se llama a onClose al abrir un enlace (p. ej. panel embebido en Actividades). */
  closeOnNavigate?: boolean;
};

export default function NotificationsPanel({
  open,
  onClose,
  showTitle = true,
  className,
  layout = 'dropdown',
  closeOnNavigate = true,
}: NotificationsPanelProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    error: notificationsError,
    markSeen,
    markAllSeen,
  } = useNotifications();

  const notificationsListRef = useRef<HTMLDivElement>(null);
  const {
    visibleItems: visibleNotifications,
    sentinelRef: notificationsSentinelRef,
    hasMore: hasMoreNotifications,
    totalItems: totalNotifications,
  } = useInfiniteScrollList(
    notifications,
    [notifications, open],
    NOTIFICATIONS_BATCH_SIZE,
    notificationsListRef,
  );

  const visibleNotificationGroups = useMemo(
    () => groupNotificationsByCategory(visibleNotifications),
    [visibleNotifications],
  );

  const isSidebarLayout = layout === 'sidebar';

  return (
    <div
      className={cx(
        className,
        isSidebarLayout && styles.notificationsPanelSidebar,
      )}
    >
      <div
        className={cx(
          styles.notificationsDropdownHeader,
          isSidebarLayout && styles.notificationsHeaderSidebar,
        )}
      >
        <div className={styles.notificationsHeading}>
          {showTitle && <p className={styles.notificationsTitle}>Notificaciones</p>}
          {totalNotifications > 0 && (
            <p className={styles.notificationsCount}>
              {totalNotifications}{' '}
              {totalNotifications === 1 ? 'notificaciones' : 'notificaciones'}
            </p>
          )}
        </div>
        {!isSidebarLayout && unreadCount > 0 && (
          <button type="button" className={styles.markSeenBtn} onClick={markAllSeen}>
            <Check size={14} strokeWidth={2.25} aria-hidden />
            <span>Marcar como visto</span>
          </button>
        )}
      </div>

      <div
        ref={notificationsListRef}
        className={cx(
          styles.notificationsList,
          isSidebarLayout && styles.notificationsListSidebar,
        )}
      >
        {notificationsLoading && notifications.length === 0 ? (
          <EmptyState
            emoji="?"
            title="Cargando..."
            description="Obteniendo tus notificaciones."
            compact
          />
        ) : notificationsError ? (
          <EmptyState
            emoji="??"
            title="Error al cargar"
            description="No se pudieron cargar las notificaciones. Inténtalo de nuevo."
            compact
          />
        ) : notifications.length === 0 ? (
          <EmptyState
            emoji="??"
            title="Sin notificaciones"
            description="Cuando haya novedades las verás aquí."
            compact
          />
        ) : (
          <>
            {visibleNotificationGroups.map((group) => (
              <section key={group.category} className={styles.notificationCategory}>
                <h3 className={styles.notificationCategoryTitle}>{group.label}</h3>
                {group.items.map((notification) => {
                  const isUnread = isNotificationUnread(notification);
                  const isOverdue = notification.action === 'calendar.reminder_overdue';
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      className={cx(
                        styles.notificationItem,
                        isUnread && styles.notificationItemUnread,
                        isOverdue && styles.notificationItemOverdue,
                      )}
                      onClick={() => {
                        void markSeen(notification.id);
                        if (closeOnNavigate) onClose();
                        navigate(notification.href);
                      }}
                    >
                      <span
                        className={cx(
                          styles.notificationDot,
                          isOverdue && styles.notificationDotOverdue,
                        )}
                        aria-hidden
                      />
                      <span className={styles.notificationBody}>
                        <span className={styles.notificationItemTitle}>{notification.title}</span>
                        <span className={styles.notificationItemMessage}>
                          {notification.message}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
            <InfiniteScrollSentinel
              sentinelRef={notificationsSentinelRef}
              hasMore={hasMoreNotifications}
              className={styles.notificationsSentinel}
            />
          </>
        )}
      </div>
    </div>
  );
}
