import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { authService, workspaceBillingSettingsService } from '@/api';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { useWorkspace } from '@/context/useWorkspace';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import { cx } from '@/lib/cx';
import HelpArticle from './help/HelpArticle';
import HelpCompanyPanel from './help/HelpCompanyPanel';
import {
  HELP_TOPICS,
  resolveHelpTopic,
  visibleHelpNavGroups,
  type HelpTopicId,
} from './help/helpTopics';
import styles from './Help.module.css';

function readSavedHelpTopic(): string | null {
  try {
    return readWorkspaceScopedStorage(storageKeys.helpTopic);
  } catch {
    return null;
  }
}

function writeHelpTopic(topic: HelpTopicId): void {
  try {
    writeWorkspaceScopedStorage(topic, storageKeys.helpTopic);
  } catch {
    // Ignore quota / private mode errors.
  }
}

export default function Help() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const isAdmin = authService.getCurrentUser()?.role === 'admin';
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(true);

  const navGroups = useMemo(() => visibleHelpNavGroups(isAdmin), [isAdmin]);

  const [activeTopicId, setActiveTopicId] = useState<HelpTopicId>(() =>
    resolveHelpTopic({
      preferred: searchParams.get('topic'),
      saved: readSavedHelpTopic(),
      isAdmin,
    }),
  );

  const activeTopicSafe = useMemo(() => {
    const topic = HELP_TOPICS[activeTopicId];
    return topic.adminOnly && !isAdmin ? HELP_TOPICS['getting-started'] : topic;
  }, [activeTopicId, isAdmin]);

  useEffect(() => {
    const urlTopic = searchParams.get('topic');
    if (!urlTopic) return;

    const resolved = resolveHelpTopic({
      preferred: urlTopic,
      saved: null,
      isAdmin,
    });

    setActiveTopicId(resolved);
    writeHelpTopic(resolved);

    const next = new URLSearchParams(searchParams);
    next.delete('topic');
    setSearchParams(next, { replace: true });
  }, [isAdmin, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompany() {
      try {
        const settings = await workspaceBillingSettingsService.get();
        if (cancelled) return;
        const name = settings.companyName.trim() || currentWorkspace?.name || 'Empresa';
        setCompanyName(name);
      } catch {
        if (!cancelled) {
          setCompanyName(currentWorkspace?.name ?? 'Empresa');
        }
      } finally {
        if (!cancelled) setLoadingCompany(false);
      }
    }

    void loadCompany();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.name]);

  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav } =
    useSecondaryNavCollapsed('help');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const showSecondaryNav = isMobile ? !secondaryNavCollapsed : true;
  useLayoutSecondarySidebarWidth(!isMobile);

  const selectTopic = (topicId: HelpTopicId) => {
    setActiveTopicId(topicId);
    writeHelpTopic(topicId);
  };

  return (
    <div className={styles.helpPage}>
      <SecondarySidebarPortal renderOnMobile>
        <aside
          id="help-secondary-nav"
          className={cx(styles.helpNav, !showSecondaryNav && styles.helpNavCollapsed)}
          aria-label="Temas de ayuda"
          aria-hidden={!showSecondaryNav ? true : undefined}
        >
          <div className={styles.helpNavHeader}>
            <p className={styles.helpNavTitle}>Ayuda</p>
            {isMobile ? (
              <SecondaryNavToggle
                expanded
                onToggle={toggleSecondaryNav}
                controlsId="help-secondary-nav"
                className={styles.helpNavToggle}
              />
            ) : null}
          </div>

          <nav className={styles.helpNavBody} aria-label="Indice de ayuda">
            {navGroups.map((group) => (
              <div key={group.id} className={styles.helpNavGroup}>
                <p className={styles.helpNavGroupLabel}>{group.label}</p>
                <div className={styles.helpNavList} role="tablist">
                  {group.topicIds.map((topicId) => {
                    const topic = HELP_TOPICS[topicId];
                    return (
                      <button
                        key={topicId}
                        type="button"
                        role="tab"
                        aria-selected={activeTopicSafe.id === topicId}
                        className={cx(
                          styles.helpNavItem,
                          activeTopicSafe.id === topicId && styles.helpNavItemActive,
                        )}
                        onClick={() => selectTopic(topicId)}
                      >
                        {topic.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      </SecondarySidebarPortal>

      <div className={styles.helpContent}>
        {!showSecondaryNav ? (
          <div className={styles.helpContentNavExpand}>
            <SecondaryNavToggle
              expanded={false}
              onToggle={toggleSecondaryNav}
              controlsId="help-secondary-nav"
            />
            <nav className={styles.helpContentBreadcrumb} aria-label="Ubicacion en ayuda">
              <span className={styles.helpContentBreadcrumbRoot}>Ayuda</span>
              <span className={styles.helpContentBreadcrumbSep} aria-hidden="true">
                &gt;
              </span>
              <span className={styles.helpContentBreadcrumbCurrent}>{activeTopicSafe.title}</span>
            </nav>
          </div>
        ) : null}

        <div role="tabpanel" className={styles.helpPanel}>
          {activeTopicSafe.id === 'company' ? (
            <HelpCompanyPanel
              companyName={companyName}
              loading={loadingCompany}
              isAdmin={isAdmin}
              onNavigate={navigate}
            />
          ) : (
            <HelpArticle topic={activeTopicSafe} onNavigate={navigate} />
          )}
        </div>
      </div>
    </div>
  );
}
