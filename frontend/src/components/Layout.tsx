import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { authService } from '@/api';
import { ActivityModalProvider } from '@/context/ActivityModalProvider';
import { InvoiceConceptSettingsProvider } from '@/context/InvoiceConceptSettingsContext';
import { NotificationsProvider } from '@/context/NotificationsProvider';
import { WorkspaceScheduleSettingsProvider } from '@/context/WorkspaceScheduleSettingsContext';
import { WorkspaceFeatureSettingsProvider } from '@/context/WorkspaceFeatureSettingsContext';
import { PopupStackProvider } from '@/context/PopupStackContext';
import { NotificationsSidebarProvider } from '@/context/NotificationsSidebarContext';
import { SecondarySidebarLayoutProvider } from '@/context/SecondarySidebarLayoutContext';
import { SidebarProvider, useSidebar } from '@/context/SidebarContext';
import { useWorkspace } from '@/context/useWorkspace';
import {
  readTopBarHiddenPreference,
  useHideTopBarOnScroll,
} from '@/hooks/useHideTopBarOnScroll';
import { useMainScrollWheelDelegation } from '@/hooks/useMainScrollWheelDelegation';
import { resetScrollTree } from '@/lib/nestedScroll';
import { TopBarVisibilityProvider } from '@/context/TopBarVisibilityContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { readSecondaryNavCollapsedForPath } from '@/hooks/useSecondaryNavCollapsed';
import { useNotificationsSidebarOptional } from '@/context/NotificationsSidebarContext';
import { hasExpandedSecondarySidebar } from '@/lib/secondarySidebarRoutes';
import {
  isSecondarySidebarExpanded,
  resolveExpandedSecondarySidebarWidth,
} from '@/lib/secondarySidebarWidth';
import { cx } from '@/lib/cx';
import ContentLoading from './ContentLoading';
import ScrollArea from './ScrollArea';
import Sidebar from './Sidebar';
import NotificationsSidebar from './NotificationsSidebar';
import SecondarySidebarSlot from './SecondarySidebarSlot';
import TopBar from './TopBar';
import styles from './Layout.module.css';

function isActivitiesPath(pathname: string): boolean {
  return pathname === '/activities' || pathname.startsWith('/activities/');
}

function isFillViewportPath(pathname: string): boolean {
  return pathname === '/settings' || pathname === '/help' || isActivitiesPath(pathname);
}

function resolvePageSecondarySidebarWidth(
  pathname: string,
  hasPageSidebar: boolean,
  isDesktop: boolean,
): string {
  if (!hasPageSidebar) return '0';
  // Actividades controla ancho y colapso desde la página (modo calendario vs tabla).
  if (isActivitiesPath(pathname)) return resolveExpandedSecondarySidebarWidth();
  if ((pathname === '/settings' || pathname === '/help') && isDesktop) {
    return resolveExpandedSecondarySidebarWidth();
  }
  return readSecondaryNavCollapsedForPath(pathname) ? '0' : resolveExpandedSecondarySidebarWidth();
}

function LayoutContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const layoutRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const handleScrollRootRef = useCallback((node: HTMLElement | null) => {
    setScrollRoot(node);
  }, []);
  const { isOpen, close, isCollapsed } = useSidebar();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const hasPageSecondarySidebar = hasExpandedSecondarySidebar(location.pathname);
  const notificationsSidebar = useNotificationsSidebarOptional();
  const notificationsOpen = isDesktop && (notificationsSidebar?.isOpen ?? false);
  const hasSecondarySidebarColumn = hasPageSecondarySidebar || notificationsOpen;
  const [secondarySidebarWidth, setSecondarySidebarWidth] = useState(() =>
    resolvePageSecondarySidebarWidth(
      location.pathname,
      hasExpandedSecondarySidebar(location.pathname),
      typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
    ),
  );
  const [secondarySidebarResizing, setSecondarySidebarResizing] = useState(false);
  const {
    loading: workspaceLoading,
    currentWorkspace,
    error: workspaceError,
    refreshWorkspaces,
  } = useWorkspace();
  const [topBarHidden, setTopBarHidden] = useState(readTopBarHiddenPreference);
  const isTopBarHidden = isDesktop || topBarHidden;

  useLayoutEffect(() => {
    if (!hasSecondarySidebarColumn) {
      setSecondarySidebarWidth('0');
      return;
    }
    if (!isActivitiesPath(location.pathname)) {
      setSecondarySidebarWidth(
        resolvePageSecondarySidebarWidth(location.pathname, hasPageSecondarySidebar, isDesktop),
      );
    }
  }, [hasSecondarySidebarColumn, hasPageSecondarySidebar, isDesktop, location.pathname]);
  useHideTopBarOnScroll(
    scrollRoot,
    layoutRef,
    `${location.pathname}:${currentWorkspace?.id ?? 'loading'}`,
    setTopBarHidden,
    !isDesktop,
  );
  useMainScrollWheelDelegation(scrollRoot, {
    enabled: !isFillViewportPath(location.pathname),
    deferTopBarReveal: !isDesktop,
    topBarHidden: isTopBarHidden,
  });

  useLayoutEffect(() => {
    if (!scrollRoot) return;
    resetScrollTree(scrollRoot);
  }, [location.key, scrollRoot]);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      navigate('/login');
      return;
    }
    void authService.refreshCurrentUser().catch(() => {
      // Mantener datos en caché si el servidor no responde.
    });
  }, [navigate]);

  if (!authService.isAuthenticated()) {
    return null;
  }

  if (workspaceLoading) {
    return (
      <div
        ref={layoutRef}
        className={styles.layout}
        data-topbar-hidden={isTopBarHidden ? '' : undefined}
      >
        <div className={styles.topBarShell} data-topbar-shell>
          <TopBar hasSidebar={false} />
        </div>
        <div className={styles.shell}>
          <main className={styles.main}>
            <ScrollArea ref={handleScrollRootRef} axis="edge-y" className={styles.mainViewport}>
              <ContentLoading label="Cargando workspace" />
            </ScrollArea>
          </main>
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div
        ref={layoutRef}
        className={styles.layout}
        data-topbar-hidden={isTopBarHidden ? '' : undefined}
      >
        <div className={styles.topBarShell} data-topbar-shell>
          <TopBar hasSidebar={false} />
        </div>
        <div className={styles.shell}>
          <main className={styles.main}>
            <ScrollArea ref={handleScrollRootRef} axis="edge-y" className={styles.mainViewport}>
              <p>
                {workspaceError ??
                  'No hay workspace disponible. Comprueba que el servidor esté en marcha o vuelve a iniciar sesión.'}
              </p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    void refreshWorkspaces();
                  }}
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    authService.logout();
                    navigate('/login');
                  }}
                >
                  Volver a iniciar sesión
                </button>
              </div>
            </ScrollArea>
          </main>
        </div>
      </div>
    );
  }

  const activeSidebarWidth =
    isDesktop && isCollapsed
      ? 'var(--layout-sidebar-collapsed-width)'
      : 'var(--layout-sidebar-width)';

  const layoutStyle = {
    '--layout-active-sidebar-width': activeSidebarWidth,
  } as CSSProperties;

  const notificationsSidebarWidth = notificationsOpen
    ? resolveExpandedSecondarySidebarWidth()
    : '0';

  const contentStyle = hasSecondarySidebarColumn
    ? ({
        ...layoutStyle,
        '--layout-notifications-sidebar-width': notificationsSidebarWidth,
        '--layout-secondary-sidebar-width': secondarySidebarWidth,
      } as CSSProperties)
    : layoutStyle;

  return (
    <TopBarVisibilityProvider isHidden={isTopBarHidden}>
      <div
        ref={layoutRef}
        className={styles.layout}
        style={layoutStyle}
        data-topbar-hidden={isTopBarHidden ? '' : undefined}
        data-sidebar-open={!isDesktop && isOpen ? '' : undefined}
      >
        <div className={styles.topBarShell} data-topbar-shell>
          <TopBar hasSidebar />
        </div>
        <SecondarySidebarLayoutProvider
          active={hasSecondarySidebarColumn}
          resizable={
            isDesktop &&
            hasSecondarySidebarColumn &&
            isSecondarySidebarExpanded(secondarySidebarWidth)
          }
          resizing={secondarySidebarResizing}
          sidebarWidth={secondarySidebarWidth}
          onSidebarWidthChange={setSecondarySidebarWidth}
          onResizingChange={setSecondarySidebarResizing}
        >
          <div className={styles.shell}>
            <Sidebar />
            <div
              className={styles.content}
              data-secondary-sidebar={hasPageSecondarySidebar ? '' : undefined}
              data-notifications-sidebar={notificationsOpen ? '' : undefined}
              data-secondary-sidebar-resizing={secondarySidebarResizing ? '' : undefined}
              style={contentStyle}
            >
              {notificationsOpen && (
                <div className={styles.notificationsSidebarSlot}>
                  <NotificationsSidebar />
                </div>
              )}
              {hasPageSecondarySidebar && <SecondarySidebarSlot />}
              <div className={styles.body}>
                <main className={styles.main}>
                  <ScrollArea
                    ref={handleScrollRootRef}
                    axis="edge-y"
                    className={cx(
                      styles.mainViewport,
                      isFillViewportPath(location.pathname) && styles.mainViewportFill,
                    )}
                  >
                    <Outlet key={location.pathname} />
                  </ScrollArea>
                </main>
              </div>
              {isOpen && (
                <button
                  type="button"
                  className={styles.overlay}
                  onClick={close}
                  aria-label="Cerrar menú"
                />
              )}
            </div>
          </div>
        </SecondarySidebarLayoutProvider>
      </div>
    </TopBarVisibilityProvider>
  );
}

export default function Layout() {
  return (
    <SidebarProvider>
      <PopupStackProvider>
        <InvoiceConceptSettingsProvider>
          <WorkspaceScheduleSettingsProvider>
            <WorkspaceFeatureSettingsProvider>
            <ActivityModalProvider>
              <NotificationsProvider>
                <NotificationsSidebarProvider>
                  <LayoutContent />
                </NotificationsSidebarProvider>
              </NotificationsProvider>
            </ActivityModalProvider>
            </WorkspaceFeatureSettingsProvider>
          </WorkspaceScheduleSettingsProvider>
        </InvoiceConceptSettingsProvider>
      </PopupStackProvider>
    </SidebarProvider>
  );
}
