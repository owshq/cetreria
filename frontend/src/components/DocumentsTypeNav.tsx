import { useMemo, useState } from 'react';
import { ArrowDownToLine, ChevronDown, CircleMinus, MoreVertical, Pencil, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Client, Document, DocumentTypeGroup } from '@shared/types';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import DocumentsMobileFilterMenu from '@/components/DocumentsMobileFilterMenu';
import {
  documentsClientFilterIsAll,
  documentsClientFilterLabel,
  type DocumentsClientFilterIds,
} from '@/components/DocumentsClientNav';
import type { SavedTableView } from '@/lib/viewConfig';
import { cx } from '@/lib/cx';
import { SidebarFooter, SidebarFooterAction } from '@/components/SidebarFooter';
import clientNavStyles from '@/pages/Clients.module.css';
import styles from '@/pages/Documents.module.css';

export type DocumentTabId = 'all' | string;

export type DocumentTabOption = {
  id: DocumentTabId;
  label: string;
  shortLabel?: string;
  documentType?: Document['type'];
  group?: DocumentTypeGroup;
};

type DocumentsTypeNavProps = {
  tabs: DocumentTabOption[];
  activeTab: DocumentTabId;
  onSelectTab: (tab: DocumentTabId) => void;
  isAdmin: boolean;
  onCreateGroup?: () => void;
  onEditGroup?: (group: DocumentTypeGroup) => void;
  onDownloadGroup?: (group: DocumentTypeGroup) => void;
  onDeleteGroup?: (group: DocumentTypeGroup) => void;
  loading?: boolean;
  compact?: boolean;
  compactPlacement?: 'footer' | 'toolbar';
  /** Tipos, vistas y contactos como hermanos con gap uniforme en el sidebar de Documentos. */
  stacked?: boolean;
  afterNav?: ReactNode;
  clients?: Client[];
  activeClientIds?: DocumentsClientFilterIds;
  onToggleClient?: (clientId: string) => void;
  onSelectAllClients?: () => void;
  savedViews?: SavedTableView[];
  activeSavedViewId?: string | null;
  onSelectView?: (view: SavedTableView) => void;
};

type GroupOptionsMenuState = {
  x: number;
  y: number;
  group: DocumentTypeGroup;
};

type MobileFilterMenuState = {
  x: number;
  y: number;
};

export default function DocumentsTypeNav({
  tabs,
  activeTab,
  onSelectTab,
  isAdmin,
  onCreateGroup,
  onEditGroup,
  onDownloadGroup,
  onDeleteGroup,
  loading = false,
  compact = false,
  compactPlacement = 'footer',
  stacked = false,
  afterNav,
  clients = [],
  activeClientIds = [],
  onToggleClient,
  onSelectAllClients,
  savedViews = [],
  activeSavedViewId = null,
  onSelectView,
}: DocumentsTypeNavProps) {
  const [groupOptionsMenu, setGroupOptionsMenu] = useState<GroupOptionsMenuState | null>(null);
  const [mobileFilterMenu, setMobileFilterMenu] = useState<MobileFilterMenuState | null>(null);

  const openGroupOptionsMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    group: DocumentTypeGroup,
  ) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setGroupOptionsMenu({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
      group,
    });
  };

  const openMobileFilterMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMobileFilterMenu({
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const groupOptionsItems: ContextMenuItem[] = groupOptionsMenu
    ? [
        ...(onEditGroup
          ? [
              {
                id: 'edit',
                label: 'Editar',
                icon: <Pencil size={16} />,
                onSelect: () => onEditGroup(groupOptionsMenu.group),
              } satisfies ContextMenuItem,
            ]
          : []),
        ...(onDownloadGroup
          ? [
              {
                id: 'download',
                label: 'Descargar',
                icon: <ArrowDownToLine size={16} />,
                onSelect: () => onDownloadGroup(groupOptionsMenu.group),
              } satisfies ContextMenuItem,
            ]
          : []),
        ...(onDeleteGroup
          ? [
              {
                id: 'delete',
                label: 'Eliminar',
                icon: <CircleMinus size={16} />,
                danger: true,
                onSelect: () => onDeleteGroup(groupOptionsMenu.group),
              } satisfies ContextMenuItem,
            ]
          : []),
      ]
    : [];

  const createGroupButton =
    isAdmin && onCreateGroup ? (
      <SidebarFooterAction
        fullWidth={!compact}
        compact={compact}
        onClick={onCreateGroup}
        aria-label="Crear grupo"
        title="Crear grupo"
        label={compact ? undefined : 'Crear grupo'}
      >
        <Plus size={14} strokeWidth={2.25} aria-hidden />
      </SidebarFooterAction>
    ) : null;

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [clients],
  );

  const activeTabOption = tabs.find((tab) => tab.id === activeTab);
  const activeView = savedViews.find((view) => view.id === activeSavedViewId);
  const clientFilterLabel = documentsClientFilterLabel(activeClientIds, sortedClients);

  const compactTriggerLabel = useMemo(() => {
    if (activeTab !== 'all') {
      return (
        activeTabOption?.shortLabel ??
        activeTabOption?.label ??
        'Todos'
      );
    }
    if (clientFilterLabel) {
      return clientFilterLabel;
    }
    if (activeSavedViewId && activeView) {
      return activeView.name;
    }
    return 'Todos';
  }, [activeTab, activeTabOption, clientFilterLabel, activeSavedViewId, activeView]);

  const navItemClass = compact
    ? clientNavStyles.clientsNavItemCompact
    : styles.documentsNavItem;
  const navItemActiveClass = compact
    ? styles.documentsNavItemActiveCompact
    : styles.documentsNavItemActive;

  const isFilterActive =
    activeTab !== 'all' ||
    !documentsClientFilterIsAll(activeClientIds) ||
    Boolean(activeSavedViewId);

  const mobileFilterMenuPortal =
    mobileFilterMenu && onToggleClient && onSelectAllClients ? (
      <DocumentsMobileFilterMenu
        x={mobileFilterMenu.x}
        y={mobileFilterMenu.y}
        onClose={() => setMobileFilterMenu(null)}
        tabs={tabs}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        clients={clients}
        activeClientIds={activeClientIds}
        onToggleClient={onToggleClient}
        onSelectAllClients={onSelectAllClients}
        savedViews={savedViews}
        activeSavedViewId={activeSavedViewId}
        onSelectView={onSelectView}
        isAdmin={isAdmin}
        onEditGroup={onEditGroup}
        onDownloadGroup={onDownloadGroup}
        onDeleteGroup={onDeleteGroup}
      />
    ) : null;

  if (compact && compactPlacement === 'toolbar') {
    return (
      <>
        <button
          type="button"
          className={cx(
            styles.documentsToolbarFilterBtn,
            isFilterActive && styles.documentsToolbarFilterBtnActive,
          )}
          aria-haspopup="menu"
          aria-expanded={mobileFilterMenu !== null}
          aria-label={`Filtros: ${compactTriggerLabel}`}
          disabled={loading}
          onClick={openMobileFilterMenu}
        >
          <span className={styles.documentsNavCompactTriggerLabel}>{compactTriggerLabel}</span>
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
        <div className={clientNavStyles.clientsNavContent}>
          <div
            className={cx(
              clientNavStyles.clientsNavBody,
              clientNavStyles.clientsNavBodyCompact,
            )}
          >
            <button
              type="button"
              className={cx(
                styles.documentsNavCompactTrigger,
                isFilterActive && styles.documentsNavItemActiveCompact,
              )}
              aria-haspopup="menu"
              aria-expanded={mobileFilterMenu !== null}
              aria-label={`Filtros: ${compactTriggerLabel}`}
              disabled={loading}
              onClick={openMobileFilterMenu}
            >
              <span className={styles.documentsNavCompactTriggerLabel}>{compactTriggerLabel}</span>
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

  const typesNav = (
    <nav
      className={styles.documentsNavList}
      role="tablist"
      aria-label="Tipos de documento"
      aria-busy={loading || undefined}
    >
      {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const displayLabel = tab.label;

              if (tab.id === 'all' || !tab.group || !isAdmin) {
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={cx(navItemClass, isActive && navItemActiveClass)}
                    onClick={() => onSelectTab(tab.id)}
                    disabled={loading}
                  >
                    {displayLabel}
                  </button>
                );
              }

              const wrapClassName = cx(
                clientNavStyles.clientsNavItemWrap,
                clientNavStyles.clientsNavItemWrapManaged,
              );
              const itemClassName = cx(
                navItemClass,
                isActive && navItemActiveClass,
              );

              return (
                <div key={tab.id} className={wrapClassName}>
                  <div
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={loading ? -1 : 0}
                    aria-disabled={loading || undefined}
                    className={itemClassName}
                    onClick={(event) => {
                      if (loading) return;
                      if (
                        (event.target as HTMLElement).closest(
                          `.${clientNavStyles.clientsNavItemAction}`,
                        )
                      ) {
                        return;
                      }
                      onSelectTab(tab.id);
                    }}
                    onKeyDown={(event) => {
                      if (loading || event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectTab(tab.id);
                      }
                    }}
                  >
                    <span className={clientNavStyles.clientsNavItemLabel}>{displayLabel}</span>
                    <div className={clientNavStyles.clientsNavItemActions}>
                      <button
                        type="button"
                        className={clientNavStyles.clientsNavItemAction}
                        aria-label="Opciones"
                        title="Opciones"
                        aria-haspopup="menu"
                        aria-expanded={groupOptionsMenu?.group.id === tab.group.id}
                        disabled={loading}
                        onClick={(event) => openGroupOptionsMenu(event, tab.group!)}
                      >
                        <MoreVertical size={14} strokeWidth={1.75} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
    </nav>
  );

  return (
    <>
      {stacked ? (
        <>
          {typesNav}
          {createGroupButton && <SidebarFooter>{createGroupButton}</SidebarFooter>}
        </>
      ) : (
        <div className={clientNavStyles.clientsNavContent}>
          <div className={clientNavStyles.clientsNavBody}>{typesNav}</div>
          {afterNav}
          {createGroupButton && (
            <SidebarFooter>{createGroupButton}</SidebarFooter>
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
