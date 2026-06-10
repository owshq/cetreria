import { useMemo, useState } from 'react';
import { ArrowDownToLine, ChevronDown, CircleMinus, MoreVertical, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ClientGroup } from '@shared/types';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import ClientsMobileFilterMenu from '@/components/ClientsMobileFilterMenu';
import type { SavedTableView } from '@/lib/viewConfig';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { SidebarFooter, SidebarFooterAction } from '@/components/SidebarFooter';
import SecondarySidebarResizableSections from '@/components/SecondarySidebarResizableSections';
import styles from '@/pages/Clients.module.css';

type ClientsGroupNavProps = {
  groups: ClientGroup[];
  activeGroupId: string;
  onSelectGroup: (groupId: string) => void;
  isAdmin: boolean;
  onCreateGroup: () => void;
  onDownloadGroup: (group: ClientGroup) => void;
  onDeleteGroup: (group: ClientGroup) => void;
  loading?: boolean;
  compact?: boolean;
  compactPlacement?: 'footer' | 'toolbar';
  /** Grupos y vistas como hermanos con gap uniforme en el sidebar de Contactos. */
  stacked?: boolean;
  afterNav?: ReactNode;
  savedViews?: SavedTableView[];
  activeSavedViewId?: string | null;
  onSelectView?: (view: SavedTableView) => void;
};

type GroupOptionsMenuState = {
  x: number;
  y: number;
  group: ClientGroup;
};

type MobileFilterMenuState = {
  x: number;
  y: number;
};

export default function ClientsGroupNav({
  groups,
  activeGroupId,
  onSelectGroup,
  isAdmin,
  onCreateGroup,
  onDownloadGroup,
  onDeleteGroup,
  loading = false,
  compact = false,
  compactPlacement = 'footer',
  stacked = false,
  afterNav,
  savedViews = [],
  activeSavedViewId = null,
  onSelectView,
}: ClientsGroupNavProps) {
  const [groupOptionsMenu, setGroupOptionsMenu] = useState<GroupOptionsMenuState | null>(null);
  const [mobileFilterMenu, setMobileFilterMenu] = useState<MobileFilterMenuState | null>(null);

  const openMobileFilterMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMobileFilterMenu({
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const openGroupOptionsMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    group: ClientGroup,
  ) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setGroupOptionsMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
      group,
    });
  };

  const groupOptionsItems: ContextMenuItem[] = groupOptionsMenu
    ? [
        {
          id: 'download',
          label: 'Descargar',
          icon: <ArrowDownToLine size={16} />,
          onSelect: () => onDownloadGroup(groupOptionsMenu.group),
        },
        {
          id: 'delete',
          label: 'Eliminar',
          icon: <CircleMinus size={16} />,
          danger: true,
          onSelect: () => onDeleteGroup(groupOptionsMenu.group),
        },
      ]
    : [];

  const createGroupButton = isAdmin ? (
    <SidebarFooterAction
      fullWidth={!compact}
      compact={compact}
      onClick={onCreateGroup}
      aria-label="Crear grupo"
      title="Crear grupo"
      label={compact ? undefined : 'Crear grupo'}
    >
      <Plus size={compact ? 14 : 14} strokeWidth={2.25} aria-hidden />
    </SidebarFooterAction>
  ) : null;

  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const activeView = savedViews.find((view) => view.id === activeSavedViewId);

  const compactTriggerLabel = useMemo(() => {
    if (activeGroupId !== 'all' && activeGroup) {
      return activeGroup.name;
    }
    if (activeSavedViewId && activeView) {
      return activeView.name;
    }
    return 'Todos';
  }, [activeGroupId, activeGroup, activeSavedViewId, activeView]);

  const isFilterActive = activeGroupId !== 'all' || Boolean(activeSavedViewId);

  const mobileFilterMenuPortal = mobileFilterMenu ? (
    <ClientsMobileFilterMenu
      x={mobileFilterMenu.x}
      y={mobileFilterMenu.y}
      onClose={() => setMobileFilterMenu(null)}
      groups={groups}
      activeGroupId={activeGroupId}
      onSelectGroup={onSelectGroup}
      savedViews={savedViews}
      activeSavedViewId={activeSavedViewId}
      onSelectView={onSelectView}
    />
  ) : null;

  if (compact && compactPlacement === 'toolbar') {
    return (
      <>
        <button
          type="button"
          className={cx(
            styles.clientsToolbarFilterBtn,
            isFilterActive && styles.clientsToolbarFilterBtnActive,
          )}
          aria-haspopup="menu"
          aria-expanded={mobileFilterMenu !== null}
          aria-label={`Grupos: ${compactTriggerLabel}`}
          disabled={loading}
          onClick={openMobileFilterMenu}
        >
          <span className={styles.clientsNavCompactTriggerLabel}>{compactTriggerLabel}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        {mobileFilterMenuPortal}
        {isAdmin && groupOptionsMenu && (
          <ContextMenu
            x={groupOptionsMenu.x}
            y={groupOptionsMenu.y}
            anchorX="center"
            ariaLabel={`Opciones de ${groupOptionsMenu.group.name}`}
            onClose={() => setGroupOptionsMenu(null)}
            items={groupOptionsItems}
          />
        )}
      </>
    );
  }

  if (compact) {
    return (
      <>
        <div className={styles.clientsNavContent}>
          <div className={cx(styles.clientsNavBody, styles.clientsNavBodyCompact)}>
            <button
              type="button"
              className={cx(
                styles.clientsNavCompactTrigger,
                isFilterActive && styles.clientsNavItemActiveCompact,
              )}
              aria-haspopup="menu"
              aria-expanded={mobileFilterMenu !== null}
              aria-label={`Grupos: ${compactTriggerLabel}`}
              disabled={loading}
              onClick={openMobileFilterMenu}
            >
              <span className={styles.clientsNavCompactTriggerLabel}>{compactTriggerLabel}</span>
              <ChevronDown size={14} strokeWidth={2} aria-hidden />
            </button>
          </div>
          {afterNav}
        </div>

        {mobileFilterMenuPortal}

        {isAdmin && groupOptionsMenu && (
          <ContextMenu
            x={groupOptionsMenu.x}
            y={groupOptionsMenu.y}
            anchorX="center"
            ariaLabel={`Opciones de ${groupOptionsMenu.group.name}`}
            onClose={() => setGroupOptionsMenu(null)}
            items={groupOptionsItems}
          />
        )}
      </>
    );
  }

  const groupsNav = (
    <nav
      className={cx(
        styles.clientsNavList,
        stacked && styles.clientsNavListStacked,
        compact && styles.clientsNavListCompact,
      )}
      {...(stacked ? scrollRegionProps : {})}
      role="tablist"
      aria-busy={loading || undefined}
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeGroupId === 'all'}
        className={cx(
          styles.clientsNavItem,
          compact && styles.clientsNavItemCompact,
          activeGroupId === 'all' && styles.clientsNavItemActive,
        )}
        onClick={() => onSelectGroup('all')}
        disabled={loading}
      >
        Todos
      </button>
      {groups.map((group) => {
        const isActive = activeGroupId === group.id;
        const itemClassName = cx(
          styles.clientsNavItem,
          compact && styles.clientsNavItemCompact,
          isActive && styles.clientsNavItemActive,
        );
        const wrapClassName = cx(
          styles.clientsNavItemWrap,
          compact && styles.clientsNavItemWrapCompact,
          isAdmin && styles.clientsNavItemWrapManaged,
        );

        if (isAdmin) {
          return (
            <div key={group.id} className={wrapClassName}>
              <div
                role="tab"
                aria-selected={isActive}
                tabIndex={loading ? -1 : 0}
                aria-disabled={loading || undefined}
                className={itemClassName}
                onClick={(event) => {
                  if (loading) return;
                  if ((event.target as HTMLElement).closest(`.${styles.clientsNavItemAction}`)) {
                    return;
                  }
                  onSelectGroup(group.id);
                }}
                onKeyDown={(event) => {
                  if (loading || event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectGroup(group.id);
                  }
                }}
              >
                <span className={styles.clientsNavItemLabel}>{group.name}</span>
                <div className={styles.clientsNavItemActions}>
                  <button
                    type="button"
                    className={styles.clientsNavItemAction}
                    aria-label="Opciones"
                    title="Opciones"
                    aria-haspopup="menu"
                    aria-expanded={groupOptionsMenu?.group.id === group.id}
                    disabled={loading}
                    onClick={(event) => openGroupOptionsMenu(event, group)}
                  >
                    <MoreVertical size={compact ? 12 : 14} strokeWidth={1.75} aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={group.id} className={wrapClassName}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className={itemClassName}
              onClick={() => onSelectGroup(group.id)}
              disabled={loading}
            >
              <span className={styles.clientsNavItemLabel}>{group.name}</span>
            </button>
          </div>
        );
      })}
      {compact && createGroupButton}
    </nav>
  );

  return (
    <>
      {stacked ? (
        <>
          <div className={styles.clientsNavScrollBody} {...scrollRegionProps}>
            <SecondarySidebarResizableSections
              storageKey="clients"
              className={styles.clientsNavSections}
              sections={[
                {
                  id: 'groups',
                  children: (
                    <div className={styles.clientsNavSectionStack}>
                      {groupsNav}
                    </div>
                  ),
                },
                ...(savedViews.length > 0 && afterNav
                  ? [
                      {
                        id: 'views',
                        children: afterNav,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {!compact && createGroupButton && (
            <SidebarFooter variant="secondary">{createGroupButton}</SidebarFooter>
          )}
        </>
      ) : (
        <div className={styles.clientsNavContent}>
          <div className={cx(styles.clientsNavBody, compact && styles.clientsNavBodyCompact)}>
            {groupsNav}
          </div>
          {afterNav}
          {!compact && createGroupButton && (
            <SidebarFooter variant="secondary">{createGroupButton}</SidebarFooter>
          )}
        </div>
      )}

      {isAdmin && groupOptionsMenu && (
        <ContextMenu
          x={groupOptionsMenu.x}
          y={groupOptionsMenu.y}
          anchorX="center"
          ariaLabel={`Opciones de ${groupOptionsMenu.group.name}`}
          onClose={() => setGroupOptionsMenu(null)}
          items={groupOptionsItems}
        />
      )}
    </>
  );
}
