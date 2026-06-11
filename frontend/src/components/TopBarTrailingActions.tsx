import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleHelp, Moon, Sun } from 'lucide-react';
import Portal from '@/components/Portal';
import NotificationsPanel from '@/components/NotificationsPanel';
import { NotificationsIcon } from '@/components/icons/NotificationsIcon';
import { SidebarNavIcon } from '@/components/icons/SidebarNavIcons';
import { useNotificationsSidebar } from '@/context/NotificationsSidebarContext';
import { usePopupEscape } from '@/context/PopupStackContext';
import { useTheme } from '@/context/ThemeContext';
import type { User } from '@shared/types';
import { APP_EVENTS } from '@/lib/appEvents';
import { authService } from '@/api';
import { getUserRoleLabel } from '@shared/types';
import { cx } from '@/lib/cx';
import QuickCreateModal from '@/components/QuickCreateModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import UserAvatar from '@/components/UserAvatar';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useNotifications } from '@/hooks/useNotifications';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSidebar } from '@/context/SidebarContext';
import styles from './TopBar.module.css';

type TopBarTrailingActionsProps = {
  placement?: 'topbar' | 'sidebar';
  hideUserMenu?: boolean;
  hideCreate?: boolean;
  hideNotifications?: boolean;
};

export default function TopBarTrailingActions({
  placement = 'topbar',
  hideUserMenu = false,
  hideCreate = false,
  hideNotifications = false,
}: TopBarTrailingActionsProps) {
  const navigate = useNavigate();
  const { isDark, toggleColorScheme } = useTheme();
  const { openNew } = useActivityModal();
  const { toggle: toggleSidebar, isOpen: sidebarOpen, isCollapsed } = useSidebar();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [currentUser, setCurrentUser] = useState<Omit<User, 'password'> | null>(
    authService.getCurrentUser(),
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    isOpen: notificationsOpen,
    toggle: toggleNotifications,
    close: closeNotifications,
  } = useNotificationsSidebar();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationsMenuRef = useRef<HTMLDivElement>(null);
  const notificationsDropdownRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const [userMenuPosition, setUserMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const { unreadCount, refresh: refreshNotifications } = useNotifications();
  const useDesktopNotificationsSidebar = !isMobile;

  const isSidebarPlacement = placement === 'sidebar';
  const isSidebarHeaderActions =
    isSidebarPlacement &&
    hideUserMenu &&
    hideCreate &&
    !hideNotifications &&
    !isCollapsed;
  const isSidebarFooterNotifications =
    isSidebarPlacement &&
    hideUserMenu &&
    hideCreate &&
    !hideNotifications &&
    isCollapsed &&
    !isMobile;
  const isSidebarFooterActions =
    isSidebarPlacement && hideUserMenu && hideNotifications && !hideCreate;

  useEffect(() => {
    const syncUser = () => setCurrentUser(authService.getCurrentUser());
    window.addEventListener(APP_EVENTS.userUpdated, syncUser);
    window.addEventListener(APP_EVENTS.authSessionChanged, syncUser);
    return () => {
      window.removeEventListener(APP_EVENTS.userUpdated, syncUser);
      window.removeEventListener(APP_EVENTS.authSessionChanged, syncUser);
    };
  }, []);

  usePopupEscape(userMenuOpen, () => setUserMenuOpen(false));
  usePopupEscape(notificationsOpen && isMobile, closeNotifications);

  useEffect(() => {
    if (!userMenuOpen || isMobile) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current?.contains(target) || userDropdownRef.current?.contains(target)) {
        return;
      }
      setUserMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [userMenuOpen, isMobile]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notificationsMenuRef.current?.contains(target)) {
        return;
      }
      if (useDesktopNotificationsSidebar) {
        if (document.getElementById('notifications-sidebar')?.contains(target)) {
          return;
        }
        closeNotifications();
        return;
      }
      if (notificationsDropdownRef.current?.contains(target)) {
        return;
      }
      closeNotifications();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [notificationsOpen, useDesktopNotificationsSidebar, closeNotifications]);

  useLayoutEffect(() => {
    if (isMobile || !userMenuOpen || !userMenuRef.current) {
      setUserMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = userMenuRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = 264;
      const gap = 6;
      const openAbove = isSidebarPlacement;
      const height = userDropdownRef.current?.offsetHeight ?? 240;
      let top = openAbove ? rect.top - gap - height : rect.bottom + gap;
      let left = openAbove ? rect.right + gap : rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
      setUserMenuPosition({ top, left, width });
    };

    updatePosition();
    requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isMobile, userMenuOpen, isSidebarPlacement]);

  const handleLogout = () => {
    authService.logout();
    setShowLogoutConfirm(false);
    navigate('/login', { replace: true });
  };

  if (!currentUser) {
    return null;
  }

  const roleLabel = getUserRoleLabel(currentUser);
  const isAdmin = currentUser.role === 'admin';
  const themeLabel = isDark ? 'Modo claro' : 'Modo oscuro';

  return (
    <>
      <div
        className={cx(
          styles.trailing,
          isSidebarPlacement && styles.trailingSidebar,
          isSidebarPlacement && !isCollapsed && !hideUserMenu && styles.trailingSidebarExpanded,
          isSidebarHeaderActions && styles.trailingSidebarHeader,
          isSidebarFooterNotifications && styles.trailingSidebarFooterNotifications,
          isSidebarFooterActions && styles.trailingSidebarFooterOnly,
        )}
        data-placement={placement}
      >
        {!hideCreate && (
          <div className={styles.createSlot}>
            <QuickCreateModal
              onNewActivity={openNew}
              isAdmin={isAdmin}
              compactTrigger={isSidebarPlacement && isCollapsed}
            />
          </div>
        )}

        {!hideNotifications && (
          <div ref={notificationsMenuRef} className={styles.notificationsMenuRoot}>
          <button
            type="button"
            className={styles.notificationsBtn}
            aria-expanded={notificationsOpen}
            aria-haspopup={useDesktopNotificationsSidebar ? undefined : 'menu'}
            aria-controls={
              useDesktopNotificationsSidebar ? 'notifications-sidebar' : undefined
            }
            aria-label={
              unreadCount > 0
                ? `Notificaciones, ${unreadCount} sin leer`
                : 'Notificaciones'
            }
            onClick={() => {
              setUserMenuOpen(false);
              if (!notificationsOpen) {
                void refreshNotifications({ silent: true });
              }
              toggleNotifications();
            }}
          >
            <NotificationsIcon
              active={notificationsOpen}
              className={styles.notificationsIcon}
            />
            {unreadCount > 0 && (
              <span className={styles.notificationsBadge} aria-hidden>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {!useDesktopNotificationsSidebar && notificationsOpen && (
            <Portal>
              <button
                type="button"
                className={styles.notificationsMobileBackdrop}
                aria-label="Cerrar notificaciones"
                onClick={closeNotifications}
              />
              <div
                ref={notificationsDropdownRef}
                className={styles.notificationsMobileSheet}
                role="menu"
                aria-label="Notificaciones"
                data-popup-layer
              >
                <NotificationsPanel
                  open={notificationsOpen}
                  onClose={closeNotifications}
                />
              </div>
            </Portal>
          )}
        </div>
        )}

        {!hideUserMenu && (
          <div ref={userMenuRef} className={styles.userMenuRoot}>
            <button
              type="button"
              className={styles.userBtn}
              aria-expanded={isMobile ? sidebarOpen : userMenuOpen}
              aria-haspopup={isMobile ? undefined : 'menu'}
              aria-label={isMobile ? 'Abrir menú' : `Menú de ${currentUser.name}`}
              onClick={() => {
                closeNotifications();
                if (isMobile) {
                  toggleSidebar();
                  return;
                }
                setUserMenuOpen((open) => !open);
              }}
            >
              <UserAvatar user={currentUser} className={styles.userAvatar} />
            </button>

            {!isMobile && userMenuOpen && userMenuPosition && (
              <Portal>
              <div
                ref={userDropdownRef}
                className={cx(
                  styles.userDropdown,
                  styles.dropdownPortal,
                  isSidebarPlacement && styles.dropdownAbove,
                )}
                style={{
                  top: userMenuPosition.top,
                  left: userMenuPosition.left,
                  width: userMenuPosition.width,
                }}
                role="menu"
                aria-label="Opciones de usuario"
              >
                <div className={styles.userDropdownHeader}>
                  <UserAvatar user={currentUser} className={styles.dropdownAvatar} />
                  <div className={styles.userDropdownIdentity}>
                    <p className={styles.userName}>{currentUser.name}</p>
                    <p className={styles.userRole}>{roleLabel}</p>
                  </div>
                </div>

                <div className={styles.menuSection}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.userDropdownItem}
                    onClick={() => {
                      toggleColorScheme();
                      setUserMenuOpen(false);
                    }}
                  >
                    <span className={styles.menuItemIcon} aria-hidden>
                      {isDark ? (
                        <Sun size={16} strokeWidth={2} />
                      ) : (
                        <Moon size={16} strokeWidth={2} />
                      )}
                    </span>
                    <span className={styles.menuItemLabel}>{themeLabel}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={styles.userDropdownItem}
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/help');
                    }}
                  >
                    <span className={styles.menuItemIcon} aria-hidden>
                      <CircleHelp size={16} strokeWidth={2} />
                    </span>
                    <span className={styles.menuItemLabel}>Ayuda</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className={styles.userDropdownItem}
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/settings');
                    }}
                  >
                    <span className={styles.menuItemIcon} aria-hidden>
                      <SidebarNavIcon name="settings" className={styles.menuItemSvg} />
                    </span>
                    <span className={styles.menuItemLabel}>Configuración</span>
                  </button>
                </div>

                <div className={styles.menuDivider} role="separator" />

                <div className={styles.menuSection}>
                  <button
                    type="button"
                    role="menuitem"
                    className={cx(styles.userDropdownItem, styles.userDropdownItemDanger)}
                    onClick={() => {
                      setUserMenuOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    <span className={cx(styles.menuItemIcon, styles.menuItemIconDanger)} aria-hidden>
                      <SidebarNavIcon name="entrance" className={styles.menuItemSvg} />
                    </span>
                    <span className={styles.menuItemLabel}>Cerrar sesión</span>
                  </button>
                </div>
              </div>
              </Portal>
            )}
          </div>
        )}
      </div>

      {!hideUserMenu && (
        <ConfirmDialog
          open={showLogoutConfirm}
          title="Cerrar sesión"
          message="¿Estás seguro de que deseas cerrar sesión?"
          confirmLabel="Cerrar sesión"
          cancelLabel="Cancelar"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  );
}
