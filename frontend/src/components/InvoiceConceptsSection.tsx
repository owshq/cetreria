import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, ClientScope, Document, DocumentConceptSummary } from '@shared/types';
import {
  aggregateConceptByClient,
  aggregateInvoiceConcepts,
  DOCUMENT_TYPE_LABELS,
  formatDocumentAmount,
  getConceptDocumentsForPeriod,
  isWorkspaceAdmin,
} from '@shared/types';
import { authService } from '@/api';
import ConceptByClientDonutChart from '@/components/ConceptByClientDonutChart';
import ChartSectionToggle from '@/components/ChartSectionToggle';
import ConceptEmojiEditor from '@/components/ConceptEmojiEditor';
import { SearchField } from '@/components/forms';
import { useWorkspace } from '@/context/useWorkspace';
import { cx } from '@/lib/cx';
import { scrollSecondaryRegionProps } from '@/lib/scrollRegion';
import { navigationStateForReturn } from '@/lib/navigation';
import ui from '@/styles/shared.module.css';
import EmptyState from '@/components/EmptyState';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import InvoiceConceptsDonutChart, {
  buildConceptColorMap,
} from '@/components/InvoiceConceptsDonutChart';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { getEffectiveChartAccent } from '@/lib/chartColorPalette';
import styles from './InvoiceConceptsSection.module.css';

type Props = {
  documents: Document[];
  clients?: Client[];
  from: string;
  to: string;
  clientId?: ClientScope;
  invalidCustomRange?: boolean;
  hideTitle?: boolean;
  pageSectionHeader?: boolean;
  plainSectionHeader?: boolean;
  variant?: 'card' | 'embedded';
  layout?: 'default' | 'panel' | 'summary';
  cardClassName?: string;
  cardBodyClassName?: string;
  titleClassName?: string;
  emptyStateClassName?: string;
  collapsibleDonutChart?: boolean;
  donutChartExpanded?: boolean;
  onDonutChartToggle?: () => void;
};

export default function InvoiceConceptsSection({
  documents,
  clients = [],
  from,
  to,
  clientId = 'all',
  invalidCustomRange = false,
  hideTitle = false,
  pageSectionHeader = false,
  plainSectionHeader = false,
  variant = 'embedded',
  layout = 'default',
  cardClassName,
  cardBodyClassName,
  titleClassName,
  emptyStateClassName,
  collapsibleDonutChart = false,
  donutChartExpanded = false,
  onDonutChartToggle,
}: Props) {
  const location = useLocation();
  const [conceptSearchTerm, setConceptSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<DocumentConceptSummary | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const currentUser = authService.getCurrentUser();
  const { currentWorkspace } = useWorkspace();
  const canEditConceptEmoji =
    isWorkspaceAdmin(currentWorkspace?.role) || currentUser?.role === 'admin';

  const clientsMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const returnPath = `${location.pathname}${location.search}`;

  const invoiceConcepts = useMemo(
    () => aggregateInvoiceConcepts(documents, from, to, clientId),
    [documents, from, to, clientId],
  );

  const filteredInvoiceConcepts = useMemo(() => {
    const term = conceptSearchTerm.toLowerCase().trim();
    if (!term) return invoiceConcepts;

    const tokens = term.split(/\s+/).filter(Boolean);
    return invoiceConcepts.filter((concept) => {
      const haystack = concept.description.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [invoiceConcepts, conceptSearchTerm]);

  const conceptTotals = useMemo(() => {
    const totalAmount = filteredInvoiceConcepts.reduce((sum, c) => sum + c.totalAmount, 0);
    return {
      count: filteredInvoiceConcepts.length,
      totalAmount,
    };
  }, [filteredInvoiceConcepts]);

  const {
    visibleItems: visibleConcepts,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(filteredInvoiceConcepts, [
    conceptSearchTerm,
    from,
    to,
    clientId,
    documents,
  ]);

  const conceptDocuments = useMemo(() => {
    if (!selectedConcept) return [];
    return getConceptDocumentsForPeriod(documents, from, to, clientId, selectedConcept.normalizedKey);
  }, [documents, from, to, clientId, selectedConcept]);

  const conceptByClient = useMemo(() => {
    if (!selectedConcept) return [];
    return aggregateConceptByClient(documents, from, to, clientId, selectedConcept.normalizedKey);
  }, [documents, from, to, clientId, selectedConcept]);

  const conceptByClientChartItems = useMemo(
    () =>
      conceptByClient.map((entry) => ({
        id: entry.clientId,
        label: clientsMap.get(entry.clientId)?.name ?? 'Contacto desconocido',
        amount: entry.totalAmount,
      })),
    [conceptByClient, clientsMap],
  );

  const conceptDetailTotalAmount = useMemo(
    () => conceptDocuments.reduce((sum, entry) => sum + entry.conceptAmount, 0),
    [conceptDocuments],
  );

  const {
    visibleItems: visibleConceptDocuments,
    sentinelRef: conceptDocumentsSentinelRef,
    hasMore: hasMoreConceptDocuments,
  } = useInfiniteScrollList(conceptDocuments, [selectedConcept, from, to, clientId, documents]);

  const hasConceptData = invoiceConcepts.length > 0;
  const canSearch = hasConceptData && !invalidCustomRange && !selectedConcept;
  const showSearchField = canSearch && searchOpen;
  const isDetailView = selectedConcept !== null;

  const hasConceptDonutData =
    !isDetailView &&
    conceptTotals.totalAmount > 0 &&
    filteredInvoiceConcepts.length > 0 &&
    !invalidCustomRange;

  const showConceptDonutChart =
    hasConceptDonutData && (!collapsibleDonutChart || donutChartExpanded);

  const showConceptChartToggle =
    collapsibleDonutChart && hasConceptDonutData && onDonutChartToggle != null;

  const isCard = variant === 'card';
  const layoutClass =
    layout === 'panel' ? styles.panel : layout === 'summary' ? styles.summary : undefined;

  useChartThemeVersion();
  const conceptColorMap = useMemo(
    () => buildConceptColorMap(filteredInvoiceConcepts, conceptTotals.totalAmount),
    [filteredInvoiceConcepts, conceptTotals.totalAmount],
  );

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (canSearch) return;
    setSearchOpen(false);
    setConceptSearchTerm('');
  }, [canSearch]);

  useEffect(() => {
    setSelectedConcept(null);
  }, [from, to, clientId]);

  const handleConceptSelect = (concept: DocumentConceptSummary) => {
    setSelectedConcept(concept);
    setSearchOpen(false);
    setConceptSearchTerm('');
  };

  const handleBackToConcepts = () => {
    setSelectedConcept(null);
  };

  const searchToggle = canSearch ? (
    <button
      type="button"
      className={styles.searchToggleBtn}
      aria-label={searchOpen ? 'Ocultar búsqueda' : 'Buscar conceptos'}
      aria-expanded={searchOpen}
      onClick={() => setSearchOpen((open) => !open)}
    >
      <Search size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  const searchOutsideCard = isCard && pageSectionHeader;
  const searchField = showSearchField ? (
    <div
      className={cx(
        isCard ? ui.listPanelToolbar : styles.toolbarEmbedded,
        searchOutsideCard && styles.sectionSearch,
      )}
    >
      <div className={ui.filtersRow}>
        <SearchField
          ref={searchInputRef}
          wrapperClassName={ui.searchWrapper}
          placeholder="Buscar"
          value={conceptSearchTerm}
          onChange={(e) => setConceptSearchTerm(e.target.value)}
        />
      </div>
    </div>
  ) : null;

  const detailHeader =
    isDetailView && !pageSectionHeader ? (
      <div className={styles.detailHeader}>
        <button
          type="button"
          className={styles.detailBackBtn}
          onClick={handleBackToConcepts}
          aria-label="Volver a conceptos"
        >
          <ArrowLeft size={16} strokeWidth={2} aria-hidden />
        </button>
        <ConceptEmojiEditor
          normalizedKey={selectedConcept.normalizedKey}
          description={selectedConcept.description}
          editable={canEditConceptEmoji}
        />
        <p className={styles.detailTitle} title={selectedConcept.description}>
          {selectedConcept.description}
        </p>
      </div>
    ) : null;

  const listContent = (
    <>
      {invalidCustomRange ? (
        <p className={cx(ui.alertError, isCard ? styles.conceptsEmptyCard : styles.conceptsEmpty)}>
          La fecha de inicio debe ser anterior o igual a la de fin.
        </p>
      ) : isDetailView ? (
        <>
          {conceptByClientChartItems.length > 0 && conceptDetailTotalAmount > 0 && (
            <ConceptByClientDonutChart
              items={conceptByClientChartItems}
              totalAmount={conceptDetailTotalAmount}
              clientCount={conceptByClient.length}
            />
          )}
          {visibleConceptDocuments.length > 0 ? (
            <div className={styles.conceptList}>
              {visibleConceptDocuments.map(({ document, conceptAmount, conceptQuantity }) => {
                const clientName = clientsMap.get(document.clientId)?.name ?? 'Contacto desconocido';
                const typeLabel = DOCUMENT_TYPE_LABELS[document.type];

                return (
                  <Link
                    key={document.id}
                    to={`/docs/${document.id}`}
                    state={navigationStateForReturn(returnPath)}
                    className={cx(styles.conceptItem, ui.listPanelItem)}
                    title={`Abrir ${typeLabel.toLowerCase()} ${document.number}`}
                  >
                    <div className={ui.listPanelItemBody}>
                      <p className={ui.listPanelItemTitleTruncate}>
                        {typeLabel} {document.number}
                      </p>
                      <p className={ui.listPanelItemMessage}>
                        {clientName}
                        {' · '}
                        {format(parseISO(document.date), 'd MMM yyyy', { locale: es })}
                        {' · '}
                        {conceptQuantity} {conceptQuantity === 1 ? 'ud.' : 'uds.'}
                      </p>
                    </div>
                    <div className={ui.listPanelAside}>
                      <p className={ui.listPanelAsidePrimary}>
                        {formatDocumentAmount(conceptAmount)}
                      </p>
                    </div>
                  </Link>
                );
              })}
              <InfiniteScrollSentinel
                sentinelRef={conceptDocumentsSentinelRef}
                hasMore={hasMoreConceptDocuments}
              />
            </div>
          ) : (
            <div
              className={cx(
                isCard ? styles.emptyStateCardBody : styles.emptyState,
                emptyStateClassName,
              )}
            >
              <EmptyState
                emoji="🧾"
                description="No hay facturas con este concepto en el periodo seleccionado."
                compact
              />
            </div>
          )}
        </>
      ) : visibleConcepts.length > 0 ? (
        <>
          {showConceptDonutChart && (
            <div id={collapsibleDonutChart ? 'dashboard-concepts-chart-panel' : undefined}>
              <InvoiceConceptsDonutChart
                concepts={filteredInvoiceConcepts}
                totalAmount={conceptTotals.totalAmount}
                conceptCount={conceptTotals.count}
              />
            </div>
          )}
          <div className={styles.conceptList}>
            {visibleConcepts.map((concept) => {
              const sharePercent =
                conceptTotals.totalAmount > 0
                  ? Math.round((concept.totalAmount / conceptTotals.totalAmount) * 100)
                  : 0;
              const conceptColor =
                conceptColorMap.get(concept.normalizedKey) ??
                conceptColorMap.get('__others__') ??
                getEffectiveChartAccent();

              return (
                <div
                  key={concept.normalizedKey}
                  className={cx(styles.conceptItem, styles.conceptItemBtn)}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleConceptSelect(concept)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleConceptSelect(concept);
                    }
                  }}
                  title={`Ver facturas de ${concept.description}`}
                >
                  <div
                    className={styles.conceptEmojiWrap}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <ConceptEmojiEditor
                      normalizedKey={concept.normalizedKey}
                      description={concept.description}
                      editable={canEditConceptEmoji}
                    />
                  </div>
                  <div className={ui.listPanelItemBody}>
                    <p
                      className={ui.listPanelItemTitleTruncate}
                      title={concept.description}
                    >
                      {concept.description}
                    </p>
                    <p className={ui.listPanelItemMessage}>
                      {concept.invoiceCount}{' '}
                      {concept.invoiceCount === 1 ? 'factura' : 'facturas'}
                      {' · '}
                      {concept.totalQuantity}{' '}
                      {concept.totalQuantity === 1 ? 'ud.' : 'uds.'}
                    </p>
                  </div>
                  <div className={ui.listPanelAside}>
                    <p className={ui.listPanelAsidePrimary}>
                      {formatDocumentAmount(concept.totalAmount)}
                    </p>
                    <p className={cx(ui.listPanelAsideSecondary, styles.conceptShare)}>
                      <span
                        className={styles.conceptColorDot}
                        style={{ backgroundColor: conceptColor }}
                        aria-hidden
                      />
                      {sharePercent}%
                    </p>
                  </div>
                </div>
              );
            })}
            <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
          </div>
        </>
      ) : (
        <div
          className={cx(
            isCard ? styles.emptyStateCardBody : styles.emptyState,
            emptyStateClassName,
          )}
        >
          <EmptyState
            emoji="🧾"
            description={
              conceptSearchTerm.trim()
                ? 'No hay conceptos que coincidan con la búsqueda.'
                : 'No hay conceptos de factura en el periodo seleccionado.'
            }
            compact
          />
        </div>
      )}
    </>
  );

  const bodyContent = (
    <>
      {!hideTitle && !pageSectionHeader && !isDetailView && (
        <div className={styles.sectionHeading}>
          <h3 className={cx(styles.sectionTitle, titleClassName)}>
            Conceptos de Factura
          </h3>
          {searchToggle}
        </div>
      )}
      {detailHeader}
      {!searchOutsideCard && searchField}
      {listContent}
    </>
  );

  if (isCard && pageSectionHeader) {
    return (
      <>
        {isDetailView ? (
          <div className={plainSectionHeader ? ui.pageSectionTitleRow : ui.pageSectionHeading}>
            <button
              type="button"
              className={styles.sectionBackBtn}
              onClick={handleBackToConcepts}
              aria-label="Volver a conceptos"
            >
              <ArrowLeft size={18} strokeWidth={2} aria-hidden />
            </button>
            <h2 className={ui.pageSectionTitle} title={selectedConcept.description}>
              {selectedConcept.description}
            </h2>
          </div>
        ) : (
          <>
            <div className={plainSectionHeader ? ui.pageSectionTitleRow : ui.pageSectionHeading}>
              {showConceptChartToggle ? (
                <ChartSectionToggle
                  expanded={donutChartExpanded}
                  onToggle={onDonutChartToggle!}
                  controlsId="dashboard-concepts-chart-panel"
                />
              ) : null}
              <h2 className={ui.pageSectionTitle}>Conceptos de Factura</h2>
              <div className={styles.sectionTitleActions}>{searchToggle}</div>
            </div>
            {searchField}
          </>
        )}
        <div
          className={cx(
            ui.card,
            cardClassName,
            styles.cardShell,
          )}
        >
          <div
            className={cx(styles.cardBody, ui.listPanelShell, cardBodyClassName)}
            {...scrollSecondaryRegionProps}
          >
            {bodyContent}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={cx(layoutClass, isCard && styles.cardFill)}>
      {bodyContent}
    </div>
  );
}
