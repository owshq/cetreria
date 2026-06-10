import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { ChevronLeft, CircleHelp, Moon, Power, Sun } from 'lucide-react';
import { useSidebar } from '@/context/SidebarContext';
import { useTheme } from '@/context/ThemeContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { authService } from '@/api';
import { getUserRoleLabel } from '@shared/types';
import { APP_EVENTS } from '@/lib/appEvents';
import { cx } from '@/lib/cx';
import BrandLogo from '@/components/BrandLogo';
import { SidebarNavIcon, type SidebarNavIconName } from '@/components/icons/SidebarNavIcons';
import UserAvatar from '@/components/UserAvatar';
import ConfirmDialog from '@/components/ConfirmDialog';
import TopBarTrailingActions from '@/components/TopBarTrailingActions';
import { usePopupEscape } from '@/context/PopupStackContext';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggleColorScheme } = useTheme();
  const { isOpen, isCollapsed, close, toggleCollapsed } = useSidebar();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const isIconRail = isCollapsed && isDesktop;
  const [currentUser, setCurrentUser] = useState(() => authService.getCurrentUser());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    close();
    setMobileUserMenuOpen(false);
  }, [location.pathname, close]);

  useEffect(() => {
    if (!isOpen) {
      setMobileUserMenuOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setMobileUserMenuOpen(false);
  }, [isCollapsed]);

  usePopupEscape(mobileUserMenuOpen, () => setMobileUserMenuOpen(false));

  useEffect(() => {
    if (!mobileUserMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!mobileUserMenuRef.current?.contains(event.target as Node)) {
        setMobileUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [mobileUserMenuOpen]);

  useEffect(() => {
    const syncUser = () => setCurrentUser(authService.getCurrentUser());
    window.addEventListener(APP_EVENTS.userUpdated, syncUser);
    window.addEventListener(APP_EVENTS.authSessionChanged, syncUser);
    return () => {
      window.removeEventListener(APP_EVENTS.userUpdated, syncUser);
      window.removeEventListener(APP_EVENTS.authSessionChanged, syncUser);
    };
  }, []);

  const sidebarToggleLabel = isCollapsed ? 'Expandir menú' : 'Colapsar menú';
  const themeLabel = isDark ? 'Modo claro' : 'Modo oscuro';

  const handleLogout = () => {
    authService.logout();
    setShowLogoutConfirm(false);
    close();
    navigate('/login', { replace: true });
  };

  const navItems: Array<{
    to: string;
    label: string;
    icon: SidebarNavIconName;
  }> = [
    { to: '/home', icon: 'home', label: 'Inicio' },
    { to: '/activities', icon: 'schedule', label: 'Actividades' },
    { to: '/clients', icon: 'people', label: 'Contactos' },
    { to: '/docs', icon: 'folder', label: 'Documentos' },
    { to: '/reports', icon: 'chartBar', label: 'Reportes' },
    { to: '/settings', icon: 'settings', label: 'Configuración' },
    // { to: '/inbox', icon: 'inbox', label: 'Bandeja' },
    // { to: '/news', icon: 'news', label: 'Noticias' },
  ];

  return (
    <aside
      data-scroll-ignore-topbar
      data-collapsed={isIconRail ? '' : undefined}
      className={cx(
        styles.sidebar,
        isOpen && styles.sidebarOpen,
        isIconRail && styles.sidebarCollapsed,
      )}
    >
      <div className={cx(styles.header, isIconRail && styles.headerIconRail)}>
        <button
          type="button"
          className={styles.logoBtn}
          onClick={toggleCollapsed}
          aria-label={sidebarToggleLabel}
          title={sidebarToggleLabel}
          aria-expanded={!isCollapsed}
        >
          <BrandLogo
            collapsed={isIconRail}
            tone="onAccent"
            className={styles.brandLogo}
          />
        </button>
        <div className={styles.headerTrailing}>
          {currentUser && !isIconRail && (
            <div className={styles.headerNotifications}>
              <TopBarTrailingActions
                placement="sidebar"
                hideUserMenu
                hideCreate
              />
            </div>
          )}
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleCollapsed}
            aria-label={sidebarToggleLabel}
            title={sidebarToggleLabel}
            aria-expanded={!isCollapsed}
          >
            <ChevronLeft size={18} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/home'}
            title={item.label}
            className={({ isActive }) =>
              cx(styles.navLink, isActive && styles.navLinkActive)
            }
          >
            {({ isActive }) => (
              <>
                <span className={styles.navIconBox} aria-hidden>
                  <SidebarNavIcon
                    name={item.icon}
                    active={isActive}
                    className={styles.navIcon}
                  />
                </span>
                <span className={styles.navLinkLabel}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {currentUser && (
        <footer
          className={cx(
            styles.mobileFooter,
            isCollapsed && styles.mobileFooterCollapsed,
          )}
        >
          <div ref={mobileUserMenuRef} className={styles.mobileFooterInner}>
            {isIconRail && (
              <div className={styles.footerNotifications}>
                <TopBarTrailingActions placement="sidebar" hideUserMenu hideCreate />
              </div>
            )}
            <div className={styles.footerUtilityLinks}>
              <NavLink
                to="/help"
                title="Ayuda"
                className={({ isActive }) =>
                  cx(styles.footerUtilityLink, isActive && styles.footerUtilityLinkActive)
                }
                onClick={() => {
                  setMobileUserMenuOpen(false);
                  close();
                }}
              >
                <span className={styles.footerUtilityIconBox} aria-hidden>
                  <CircleHelp size={20} strokeWidth={2} className={styles.footerUtilityIcon} />
                </span>
                <span className={styles.footerUtilityLinkLabel}>Ayuda</span>
              </NavLink>
            </div>
            {mobileUserMenuOpen && (
              <div
                className={cx(
                  isCollapsed ? styles.userDropdown : styles.mobileMenuSection,
                )}
                role={isCollapsed ? 'menu' : undefined}
                aria-label={isCollapsed ? 'Opciones de usuario' : undefined}
              >
                <button
                  type="button"
                  role={isCollapsed ? 'menuitem' : undefined}
                  className={styles.userDropdownItem}
                  onClick={() => {
                    toggleColorScheme();
                    setMobileUserMenuOpen(false);
                    close();
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

                {isCollapsed && (
                  <>
                    <div className={styles.menuDivider} role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      className={cx(styles.userDropdownItem, styles.userDropdownItemDanger)}
                      onClick={() => {
                        setMobileUserMenuOpen(false);
                        setShowLogoutConfirm(true);
                      }}
                    >
                      <span className={cx(styles.menuItemIcon, styles.menuItemIconDanger)} aria-hidden>
                        <Power size={16} strokeWidth={2} />
                      </span>
                      <span className={styles.menuItemLabel}>Cerrar sesión</span>
                    </button>
                  </>
                )}
              </div>
            )}

            <div
              className={cx(
                styles.mobileUserHeader,
                mobileUserMenuOpen && !isCollapsed && styles.mobileUserHeaderOpen,
              )}
            >
              <button
                type="button"
                className={styles.mobileUserTrigger}
                aria-expanded={mobileUserMenuOpen}
                aria-haspopup="menu"
                aria-label={`Opciones de ${currentUser.name}`}
                title={currentUser.name}
                onClick={() => setMobileUserMenuOpen((open) => !open)}
              >
                <UserAvatar user={currentUser} className={styles.userAvatar} />
                <div className={styles.userMeta}>
                  <p className={styles.userName}>{currentUser.name}</p>
                  <p className={styles.userRole}>{getUserRoleLabel(currentUser)}</p>
                </div>
              </button>
              {!isCollapsed && (
                <button
                  type="button"
                  className={styles.logoutBtn}
                  onClick={() => setShowLogoutConfirm(true)}
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <Power size={16} strokeWidth={2} className={styles.logoutBtnIcon} aria-hidden />
                </button>
              )}
            </div>
          </div>
        </footer>
      )}
      <ConfirmDialog
        open={showLogoutConfirm}
        title="Cerrar sesión"
        message="¿Estás seguro de que deseas cerrar sesión?"
        confirmLabel="Cerrar sesión"
        cancelLabel="Cancelar"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </aside>
  );
}
