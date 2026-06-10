import { useMemo, useRef, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import type { Client } from '@shared/types';
import { SearchField } from '@/components/forms';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import { INFINITE_SCROLL_BATCH_SIZE, useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import SecondarySidebarSectionHeader from '@/components/SecondarySidebarSectionHeader';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import styles from './DocumentsClientNav.module.css';

/** Vacío = todos los contactos. */
export type DocumentsClientFilterIds = string[];

export function documentsClientFilterIsAll(ids: DocumentsClientFilterIds): boolean {
  return ids.length === 0;
}

export function documentsClientFilterLabel(
  ids: DocumentsClientFilterIds,
  clients: Client[],
): string | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) {
    return clients.find((client) => client.id === ids[0])?.name ?? null;
  }
  return `${ids.length} contactos`;
}

type DocumentsClientNavProps = {
  clients: Client[];
  activeClientIds: DocumentsClientFilterIds;
  onToggleClient: (clientId: string) => void;
  onSelectAllClients: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  loading?: boolean;
  /** Sin borde superior; espaciado lo define el contenedor padre (p. ej. sidebar Documentos). */
  stacked?: boolean;
};

export default function DocumentsClientNav({
  clients,
  activeClientIds,
  onToggleClient,
  onSelectAllClients,
  searchTerm,
  onSearchChange,
  loading = false,
  stacked = false,
}: DocumentsClientNavProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const allSelected = documentsClientFilterIsAll(activeClientIds);
  const selectedSet = useMemo(() => new Set(activeClientIds), [activeClientIds]);

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!term) return sorted;
    return sorted.filter((client) => {
      const haystack = [client.name, client.email, client.phone].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [clients, searchTerm]);

  const {
    visibleItems: visibleClients,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(
    filteredClients,
    [searchTerm, clients],
    INFINITE_SCROLL_BATCH_SIZE,
    listRef,
  );

  const canSearch = clients.length > 3;
  const showSearchField = canSearch && (!stacked || searchOpen);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (canSearch) return;
    setSearchOpen(false);
    onSearchChange('');
  }, [canSearch, onSearchChange]);

  const searchToggle = stacked && canSearch ? (
    <button
      type="button"
      className={styles.searchToggleBtn}
      aria-label={searchOpen ? 'Ocultar búsqueda' : 'Buscar contacto'}
      aria-expanded={searchOpen}
      onClick={() => setSearchOpen((open) => !open)}
    >
      <Search size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  return (
    <section
      className={cx(styles.wrap, stacked && styles.wrapStacked)}
      aria-label="Filtrar por contacto"
    >
      {stacked ? (
        <SecondarySidebarSectionHeader title="Contactos" action={searchToggle} />
      ) : (
        <p className={styles.title}>Contactos</p>
      )}
      {showSearchField ? (
        <div className={styles.search}>
          <SearchField
            ref={searchInputRef}
            wrapperClassName={styles.searchField}
            placeholder="Buscar"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={loading}
          />
        </div>
      ) : null}
      <div
        ref={listRef}
        className={styles.list}
        {...scrollRegionProps}
        role="listbox"
        aria-label="Contactos"
        aria-multiselectable="true"
      >
        <button
          type="button"
          role="option"
          aria-selected={allSelected}
          className={cx(styles.item, allSelected && styles.itemActive)}
          onClick={() => onSelectAllClients()}
          disabled={loading}
        >
          Todos
        </button>
        {visibleClients.length > 0 ? (
          visibleClients.map((client) => {
            const isSelected = selectedSet.has(client.id);
            return (
              <button
                key={client.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cx(styles.item, isSelected && styles.itemActive)}
                onClick={() => onToggleClient(client.id)}
                disabled={loading}
                title={client.name}
              >
                {client.name}
              </button>
            );
          })
        ) : (
          <p className={styles.empty}>Sin coincidencias</p>
        )}
        <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
      </div>
    </section>
  );
}
