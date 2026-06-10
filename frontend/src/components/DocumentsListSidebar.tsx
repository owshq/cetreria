import { useMemo, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import { DOCUMENT_TYPE_LABELS } from '@shared/types';
import { getDocumentDisplayName } from '@/lib/documentDisplayName';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { SearchField } from '@/components/forms';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { groupReportsByDateSection } from '@/lib/reportDateSections';
import styles from './DocumentsListSidebar.module.css';

const DOCUMENTS_LIST_BATCH_SIZE = 20;

type DocumentListEntry = Document & { generatedAt: string };

export type DocumentsListSidebarProps = {
  documents: Document[];
  clientsMap: Map<string, Client>;
  activeDocumentId?: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectDocument: (document: Document) => void;
  getDocumentOptionsItems?: (document: Document) => ContextMenuItem[];
  loading?: boolean;
  billingSettings?: Pick<WorkspaceBillingSettings, 'documentFormats'> | null;
};

function documentListLabel(
  doc: Document,
  clientsMap: Map<string, Client>,
  billingSettings?: Pick<WorkspaceBillingSettings, 'documentFormats'> | null,
): string {
  const clientName = clientsMap.get(doc.clientId)?.name ?? 'Sin contacto';
  return getDocumentDisplayName(doc, clientName, billingSettings);
}

export default function DocumentsListSidebar({
  documents,
  clientsMap,
  activeDocumentId,
  searchTerm,
  onSearchChange,
  collapsed,
  onToggleCollapsed,
  onSelectDocument,
  getDocumentOptionsItems,
  loading = false,
  billingSettings = null,
}: DocumentsListSidebarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [documentOptionsMenu, setDocumentOptionsMenu] = useState<{
    x: number;
    y: number;
    document: Document;
  } | null>(null);

  const filteredDocuments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const sorted = [...documents].sort(
      (a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number),
    );

    if (!term) return sorted;

    return sorted.filter((doc) => {
      const client = clientsMap.get(doc.clientId);
      const haystack = [
        doc.number,
        DOCUMENT_TYPE_LABELS[doc.type],
        client?.name,
        client?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [clientsMap, documents, searchTerm]);

  const documentsForGrouping = useMemo<DocumentListEntry[]>(
    () => filteredDocuments.map((doc) => ({ ...doc, generatedAt: doc.date })),
    [filteredDocuments],
  );

  const {
    visibleItems: visibleDocuments,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(
    documentsForGrouping,
    [searchTerm, documents],
    DOCUMENTS_LIST_BATCH_SIZE,
    listRef,
  );

  const groupedDocuments = useMemo(
    () => groupReportsByDateSection(visibleDocuments),
    [visibleDocuments],
  );

  return (
    <aside
      id="documents-list-sidebar"
      className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed)}
      aria-label="Lista de documentos"
      aria-hidden={collapsed ? true : undefined}
    >
      <div className={styles.header}>
        <p className={styles.title}>Documentos</p>
        <SecondaryNavToggle
          expanded
          onToggle={onToggleCollapsed}
          controlsId="documents-list-sidebar"
          className={styles.toggle}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.search}>
          <SearchField
            wrapperClassName={styles.searchField}
            placeholder="Buscar"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div ref={listRef} className={styles.list} {...scrollRegionProps}>
          {loading ? (
            <div className={styles.empty}>
              <p className={styles.emptyText}>Cargando...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>
                {searchTerm.trim() ? 'Sin coincidencias' : 'Sin documentos'}
              </p>
              <p className={styles.emptyText}>
                {searchTerm.trim()
                  ? 'No hay documentos que coincidan con la búsqueda.'
                  : 'Aún no hay documentos en este workspace.'}
              </p>
            </div>
          ) : (
            <>
              <nav className={styles.navList} aria-label="Documentos">
                {groupedDocuments.map((section) => (
                  <div key={section.key} className={styles.group}>
                    <p className={styles.groupLabel}>{section.label}</p>
                    {section.items.map((doc) => {
                      const label = documentListLabel(doc, clientsMap, billingSettings);

                      return (
                        <div key={doc.id} className={styles.itemWrap}>
                          <button
                            type="button"
                            className={cx(
                              styles.item,
                              doc.id === activeDocumentId && styles.itemActive,
                            )}
                            onClick={() => onSelectDocument(doc)}
                            title={label}
                          >
                            {label}
                          </button>
                          {getDocumentOptionsItems && (
                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  setDocumentOptionsMenu({
                                    x: rect.right,
                                    y: rect.bottom + 4,
                                    document: doc,
                                  });
                                }}
                                className={styles.itemOptionsBtn}
                                title="Opciones"
                                aria-label={`Opciones de ${label}`}
                                aria-haspopup="menu"
                                aria-expanded={documentOptionsMenu?.document.id === doc.id}
                              >
                                <MoreVertical size={14} strokeWidth={1.75} aria-hidden />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
            </>
          )}
        </div>
      </div>

      {documentOptionsMenu && getDocumentOptionsItems && (
        <ContextMenu
          x={documentOptionsMenu.x}
          y={documentOptionsMenu.y}
          anchorX="end"
          ariaLabel="Opciones del documento"
          onClose={() => setDocumentOptionsMenu(null)}
          items={getDocumentOptionsItems(documentOptionsMenu.document)}
        />
      )}
    </aside>
  );
}
