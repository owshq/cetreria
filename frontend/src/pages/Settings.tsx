import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { authService } from '@/api';
import { cx } from '@/lib/cx';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import ActivityTypesSettings from './ActivityTypesSettings';
import CompanyBillingSettings from './CompanyBillingSettings';
import FinancialDocumentsSettings from './FinancialDocumentsSettings';
import AppearanceSettings from './AppearanceSettings';
import ProfileSettings from './ProfileSettings';
import SignatureSettings from './SignatureSettings';
import UserScheduleSettings from './UserScheduleSettings';
import UsersManagement from './Users';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import { storageKeys } from '@/lib/storageKeys';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import {
  isSettingsTab,
  resolveDefaultSettingsTab,
  resolveSettingsTab,
  type SettingsTab,
} from '@/lib/resolveSettingsTab';
import styles from './Settings.module.css';

const SETTINGS_TAB_KEY = storageKeys.settingsTab;

function readSavedSettingsTab(): string | null {
  try {
    return readWorkspaceScopedStorage(SETTINGS_TAB_KEY);
  } catch {
    return null;
  }
}

function writeSettingsTab(tab: SettingsTab): void {
  try {
    writeWorkspaceScopedStorage(tab, SETTINGS_TAB_KEY);
  } catch {
    // Ignore quota / private mode errors.
  }
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const hasSignature = Boolean(currentUser?.signatureDataUrl);
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();

  const tabs: Array<{ id: SettingsTab; label: string }> = [{ id: 'profile', label: 'Cuenta' }];

  if (workerSignaturesEnabled) {
    tabs.push({ id: 'signature', label: 'Firma' });
  }
  if (shiftSchedulingEnabled) {
    tabs.push({ id: 'schedule', label: 'Turnos' });
  }

  if (isAdmin) {
    tabs.push(
      { id: 'appearance', label: 'Apariencia' },
      { id: 'company', label: 'Empresa' },
      { id: 'users', label: 'Usuarios' },
      { id: 'financial-documents', label: 'Documentos financieros' },
      { id: 'activity-types', label: 'Tipos de actividad' },
    );
  }

  const availableTabIds = tabs.map(({ id }) => id);
  const tabResolutionInput = {
    availableTabs: availableTabIds,
    isAdmin: !!isAdmin,
    workerSignaturesEnabled,
    hasSignature,
  };
  const [activeTab, setActiveTabState] = useState<SettingsTab>(() =>
    resolveSettingsTab({
      ...tabResolutionInput,
      savedTab: readSavedSettingsTab(),
      preferredTab: searchParams.get('tab'),
    }),
  );
  const activeTabSafe = availableTabIds.includes(activeTab)
    ? activeTab
    : resolveDefaultSettingsTab(tabResolutionInput);

  useEffect(() => {
    const urlTab = searchParams.get('tab');
    if (!urlTab || !isSettingsTab(urlTab) || !availableTabIds.includes(urlTab)) return;

    setActiveTabState(urlTab);
    writeSettingsTab(urlTab);

    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    setSearchParams(next, { replace: true });
  }, [availableTabIds, searchParams, setSearchParams]);
  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav } =
    useSecondaryNavCollapsed('settings');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const showSecondaryNav = isMobile ? true : !secondaryNavCollapsed;
  useLayoutSecondarySidebarWidth(!isMobile);

  const selectTab = (tab: SettingsTab) => {
    setActiveTabState(tab);
    writeSettingsTab(tab);
  };

  const activeTabLabel =
    tabs.find((tab) => tab.id === activeTabSafe)?.label ?? 'Configuración';

  return (
    <div className={cx(styles.settingsPage, isMobile && styles.settingsPageMobile)}>
      <SecondarySidebarPortal renderOnMobile>
      <aside
        id="settings-secondary-nav"
        className={cx(
          styles.settingsNav,
          isMobile && styles.settingsNavMobile,
          !showSecondaryNav && styles.settingsNavCollapsed,
        )}
        aria-label="Secciones de configuración"
        aria-hidden={!showSecondaryNav ? true : undefined}
      >
        <div className={styles.settingsNavHeader}>
          <p className={styles.settingsNavTitle}>Configuración</p>
          {isMobile ? (
            <SecondaryNavToggle
              expanded
              onToggle={toggleSecondaryNav}
              controlsId="settings-secondary-nav"
              className={styles.settingsNavToggle}
            />
          ) : null}
        </div>
        <nav className={styles.settingsNavList} role="tablist">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTabSafe === id}
              className={cx(styles.settingsNavItem, activeTabSafe === id && styles.settingsNavItemActive)}
              onClick={() => selectTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      </SecondarySidebarPortal>

      {activeTabSafe === 'users' && isAdmin ? (
        <UsersManagement
          secondaryNavCollapsed={!isMobile && secondaryNavCollapsed}
          onToggleSecondaryNav={toggleSecondaryNav}
        />
      ) : (
        <div className={styles.settingsContent}>
          {!isMobile && !showSecondaryNav && (
            <div className={styles.settingsContentNavExpand}>
              <SecondaryNavToggle
                expanded={false}
                onToggle={toggleSecondaryNav}
                controlsId="settings-secondary-nav"
              />
              <nav className={styles.settingsContentBreadcrumb} aria-label="Ubicación en configuración">
                <span className={styles.settingsContentBreadcrumbRoot}>Configuración</span>
                <span className={styles.settingsContentBreadcrumbSep} aria-hidden="true">
                  &gt;
                </span>
                <span className={styles.settingsContentBreadcrumbCurrent}>{activeTabLabel}</span>
              </nav>
            </div>
          )}
          <div role="tabpanel" className={styles.settingsTabPanel}>
            {activeTabSafe === 'profile' && <ProfileSettings />}
            {workerSignaturesEnabled && activeTabSafe === 'signature' && <SignatureSettings />}
            {shiftSchedulingEnabled && activeTabSafe === 'schedule' && <UserScheduleSettings />}
            {isAdmin && activeTabSafe === 'appearance' && <AppearanceSettings />}
            {isAdmin && activeTabSafe === 'company' && <CompanyBillingSettings />}
            {isAdmin && activeTabSafe === 'activity-types' && <ActivityTypesSettings />}
            {isAdmin && activeTabSafe === 'financial-documents' && <FinancialDocumentsSettings />}
          </div>
        </div>
      )}
    </div>
  );
}
