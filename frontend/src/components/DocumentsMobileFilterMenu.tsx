import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Client } from '@shared/types';
import { SearchField } from '@/components/forms';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import {
  documentsClientFilterIsAll,
  type DocumentsClientFilterIds,
} from '@/components/DocumentsClientNav';
import type { DocumentTabId, DocumentTabOption } from '@/components/DocumentsTypeNav';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import type { SavedTableView } from '@/lib/viewConfig';
import MobileFilterMenuItem from '@/components/MobileFilterMenuItem';
import { usePopupEscape } from '@/context/PopupStackContext';
import styles from './DocumentsMobileFilterMenu.module.css';

export const MOBILE_FILTER_CLIENT_BATCH_SIZE = 5;

type DocumentsMobileFilterMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  tabs: DocumentTabOption[];
  activeTab: DocumentTabId;
  onSelectTab: (tab: DocumentTabId) => void;
  clients: Client[];
  activeClientIds: DocumentsClientFilterIds;
  onToggleClient: (clientId: string) => void;
  onSelectAllClients: () => void;
  savedViews: SavedTableView[];
  activeSavedViewId: string | null;
  onSelectView?: (view: SavedTableView) => void;
};

function filterClients(clients: Client[], searchTerm: string): Client[] {
  const term = searchTerm.trim().toLowerCase();
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (!term) return sorted;
  return sorted.filter((client) => {
    const haystack = [client.name, client.email, client.phone].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(term);
  });
}

export default function DocumentsMobileFilterMenu({
  x,
  y,
  onClose,
  tabs,
  activeTab,
  onSelectTab,
  clients,
  activeClientIds,
  onToggleClient,
  onSelectAllClients,
  savedViews,
  activeSavedViewId,
  onSelectView,
}: DocumentsMobileFilterMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const clientsListRef = useRef<HTMLDivElement>(null);
  const [clientSearch, setClientSearch] = useState('');

  usePopupEscape(true, onClose);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const padding = 8;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;

    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }
    if (top + height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - height - padding);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, clientSearch, clients.length, savedViews.length, activeClientIds.length]);

  const filteredClients = useMemo(
    () => filterClients(clients, clientSearch),
    [clients, clientSearch],
  );

  const {
    visibleItems: visibleClients,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(
    filteredClients,
    [clientSearch, clients],
    MOBILE_FILTER_CLIENT_BATCH_SIZE,
    clientsListRef,
  );

  const allClientsSelected = documentsClientFilterIsAll(activeClientIds);
  const selectedClientIds = useMemo(() => new Set(activeClientIds), [activeClientIds]);

  const selectAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Filtros de documentos"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={styles.staticSection}>
        <div className={styles.sectionHeader} role="presentation">
          Grupos
        </div>
        {tabs.map((tab) => (
          <MobileFilterMenuItem
            key={tab.id}
            selected={activeTab === tab.id}
            label={tab.label}
            onClick={() => selectAndClose(() => onSelectTab(tab.id))}
          />
        ))}
      </div>

      <div className={styles.separator} role="separator" />

      <div className={styles.sectionHeader} role="presentation">
        Contactos
      </div>
      <div className={styles.searchWrap}>
        <SearchField
          wrapperClassName={styles.searchField}
          placeholder="Buscar"
          value={clientSearch}
          onChange={(event) => setClientSearch(event.target.value)}
        />
      </div>
      <div
        ref={clientsListRef}
        className={styles.clientsList}
        role="listbox"
        aria-label="Contactos"
        aria-multiselectable="true"
      >
        <MobileFilterMenuItem
          selected={allClientsSelected}
          label="Todos"
          onClick={() => selectAndClose(onSelectAllClients)}
        />
        {visibleClients.length > 0 ? (
          visibleClients.map((client) => (
            <MobileFilterMenuItem
              key={client.id}
              selected={selectedClientIds.has(client.id)}
              label={client.name}
              title={client.name}
              onClick={() => onToggleClient(client.id)}
            />
          ))
        ) : (
          <p className={styles.clientsEmpty}>Sin coincidencias</p>
        )}
        <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
      </div>

      {onSelectView && savedViews.length > 0 && (
        <>
          <div className={styles.separator} role="separator" />
          <div className={styles.staticSection}>
            <div className={styles.sectionHeader} role="presentation">
              Vistas
            </div>
            {savedViews.map((view) => (
              <MobileFilterMenuItem
                key={view.id}
                selected={activeSavedViewId === view.id}
                label={view.name}
                title={view.description || view.name}
                leadingIcon={view.icon}
                onClick={() => selectAndClose(() => onSelectView(view))}
              />
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
