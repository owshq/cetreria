import { Check } from 'lucide-react';
import NotificationsPanel from '@/components/NotificationsPanel';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import { SidebarFooter, SidebarFooterAction } from '@/components/SidebarFooter';
import { useNotificationsSidebar } from '@/context/NotificationsSidebarContext';
import { usePopupEscape } from '@/context/PopupStackContext';
import { useNotifications } from '@/hooks/useNotifications';
import styles from './NotificationsSidebar.module.css';

export default function NotificationsSidebar() {
  const { close } = useNotificationsSidebar();
  const { unreadCount, markAllSeen } = useNotifications();

  usePopupEscape(true, close);

  return (
    <aside
      id="notifications-sidebar"
      className={styles.sidebar}
      aria-label="Notificaciones"
      data-popup-layer
    >
      <div className={styles.header}>
        <p className={styles.title}>Notificaciones</p>
        <SecondaryNavToggle
          expanded
          onToggle={close}
          controlsId="notifications-sidebar"
          className={styles.headerToggle}
        />
      </div>
      <div className={styles.body}>
        <NotificationsPanel open onClose={close} showTitle={false} layout="sidebar" />
      </div>
      {unreadCount > 0 && (
        <SidebarFooter variant="secondary">
          <SidebarFooterAction
            fullWidth
            onClick={markAllSeen}
            aria-label="Marcar como visto"
            title="Marcar como visto"
            label="Marcar como visto"
          >
            <Check size={14} strokeWidth={2.25} aria-hidden />
          </SidebarFooterAction>
        </SidebarFooter>
      )}
    </aside>
  );
}
