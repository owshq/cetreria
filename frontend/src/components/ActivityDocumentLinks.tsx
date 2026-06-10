import { useMemo, useState } from 'react';
import { Copy, FilePlus, GripVertical } from 'lucide-react';
import type { Document } from '@shared/types';
import { DOCUMENT_TYPE_LABELS, isBillableDocumentType } from '@shared/types';
import type { DocumentCreationMode } from '@/components/DocumentFormModal';
import documentFormStyles from '@/components/DocumentFormModal.module.css';
import { SearchField } from '@/components/forms';
import SearchableSelect from '@/components/SearchableSelect';
import { cx } from '@/lib/cx';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ui from '@/styles/shared.module.css';
import selectStyles from './SearchableSelect.module.css';
import styles from './ActivityDocumentLinks.module.css';

const DRAG_MIME = 'application/x-document-id';
const LEGACY_DRAG_MIME = 'application/x-crm-document-id';

function isLinkedElsewhere(doc: Document, currentActivityId?: string): boolean {
  return Boolean(doc.activityId && doc.activityId !== currentActivityId);
}

function documentSortRank(
  doc: Document,
  selectedIds: string[],
  currentActivityId?: string,
): number {
  if (selectedIds.includes(doc.id)) return 0;
  if (!isLinkedElsewhere(doc, currentActivityId)) return 1;
  return 2;
}

function matchesDocumentSearch(doc: Document, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    doc.number,
    DOCUMENT_TYPE_LABELS[doc.type],
    doc.date,
    doc.total.toFixed(2),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

type ActivityDocumentLinksProps = {
  documents: Document[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Actividad en edición; permite marcar docs ya vinculados a ella */
  currentActivityId?: string;
  disabled?: boolean;
  onCreateDocument?: (mode: DocumentCreationMode) => void;
  onDuplicateInvoice?: (invoiceId: string) => void;
};

export default function ActivityDocumentLinks({
  documents,
  selectedIds,
  onChange,
  currentActivityId,
  disabled = false,
  onCreateDocument,
  onDuplicateInvoice,
}: ActivityDocumentLinksProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [dragActive, setDragActive] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [listQuery, setListQuery] = useState('');

  const billable = documents.filter((doc) => isBillableDocumentType(doc.type));
  const visibleBillable = useMemo(
    () =>
      billable
        .filter((doc) => matchesDocumentSearch(doc, listQuery))
        .sort((a, b) => {
          const rankDiff =
            documentSortRank(a, selectedIds, currentActivityId) -
            documentSortRank(b, selectedIds, currentActivityId);
          if (rankDiff !== 0) return rankDiff;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        }),
    [billable, listQuery, selectedIds, currentActivityId],
  );
  const invoices = billable.filter((doc) => doc.type === 'invoice');
  const invoiceOptions = useMemo(
    () =>
      invoices
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((doc) => ({
          value: doc.id,
          label: doc.number,
          hint: `${doc.date} · ${doc.total.toFixed(2)}€`,
        })),
    [invoices],
  );

  const canLink = (doc: Document) => !isLinkedElsewhere(doc, currentActivityId);

  const linkDocument = (id: string) => {
    if (disabled) return;
    const doc = billable.find((item) => item.id === id);
    if (!doc || !canLink(doc)) return;
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
  };

  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      linkDocument(id);
    }
  };

  const handleDragStart = (event: React.DragEvent, docId: string) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData(DRAG_MIME, docId);
    event.dataTransfer.effectAllowed = 'copy';
    setDraggingId(docId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragActive(false);
  };

  const handleDropZoneDragOver = (event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragActive(true);
  };

  const handleDropZoneDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragActive(false);
    const docId =
      event.dataTransfer.getData(DRAG_MIME) ||
      event.dataTransfer.getData(LEGACY_DRAG_MIME);
    if (docId) linkDocument(docId);
  };

  const showCreateActions = Boolean(onCreateDocument);
  const showDuplicate = Boolean(onDuplicateInvoice);
  const showActionPicker = showCreateActions || showDuplicate;

  return (
    <div className={styles.root}>
      {showActionPicker && (
        <div
          className={documentFormStyles.creationModePicker}
          role="radiogroup"
          aria-label="Crear documento para vincular"
        >
          {showCreateActions && (
            <button
              type="button"
              role="radio"
              aria-checked={!duplicateOpen}
              className={cx(
                documentFormStyles.creationModeOption,
                !duplicateOpen && documentFormStyles.creationModeOptionActive,
              )}
              onClick={() => {
                setDuplicateOpen(false);
                onCreateDocument?.('generate');
              }}
              disabled={disabled}
            >
              <FilePlus size={18} aria-hidden />
              <span className={documentFormStyles.creationModeLabel}>Nuevo documento</span>
              <span className={documentFormStyles.creationModeDesc}>Genera PDF con plantilla</span>
            </button>
          )}
          {showDuplicate && (
            <button
              type="button"
              role="radio"
              aria-checked={duplicateOpen}
              className={cx(
                documentFormStyles.creationModeOption,
                duplicateOpen && documentFormStyles.creationModeOptionActive,
              )}
              onClick={() => setDuplicateOpen((open) => !open)}
              disabled={disabled || invoiceOptions.length === 0}
              aria-expanded={duplicateOpen}
            >
              <Copy size={18} aria-hidden />
              <span className={documentFormStyles.creationModeLabel}>Duplicar factura</span>
              <span className={documentFormStyles.creationModeDesc}>
                Copia una factura existente
              </span>
            </button>
          )}
        </div>
      )}

      {showDuplicate && duplicateOpen && (
        <div className={styles.duplicateSelect}>
          <SearchableSelect
            label="Factura a duplicar"
            value=""
            onChange={(invoiceId) => {
              if (invoiceId) {
                onDuplicateInvoice?.(invoiceId);
                setDuplicateOpen(false);
              }
            }}
            options={invoiceOptions}
            placeholder={
              invoiceOptions.length > 0
                ? 'Buscar factura para duplicar'
                : 'No hay facturas para duplicar'
            }
            disabled={disabled || invoiceOptions.length === 0}
            menuPortal
            dropdownClassName={selectStyles.dropdownTall}
          />
        </div>
      )}

      <div
        className={cx(styles.dropzone, dragActive && styles.dropzoneActive, disabled && styles.dropzoneDisabled)}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDropZoneDrop}
      >
        <p className={cx(ui.textSmall, ui.textMuted, styles.dropzoneHint)}>
          {isMobile
            ? 'Marca facturas o albaranes de la lista para vincularlos a esta actividad.'
            : 'Arrastra facturas o albaranes aquí para vincularlos a esta actividad.'}
        </p>
      </div>

      {billable.length === 0 ? (
        <p className={cx(ui.textSmall, ui.textMuted, styles.emptyHint)}>
          No hay facturas ni albaranes para este contacto. Créalos con los botones de arriba o en
          Documentos.
        </p>
      ) : (
        <div className={styles.listSection}>
          <SearchField
            wrapperClassName={styles.listSearch}
            placeholder="Buscar factura o albarán"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
            disabled={disabled}
            aria-label="Buscar documentos para vincular"
          />
          {listQuery.trim() ? (
            <p className={cx(ui.textSmall, ui.textMuted, styles.listSummary)}>
              {visibleBillable.length === 0
                ? 'Sin coincidencias'
                : `${visibleBillable.length} de ${billable.length} documentos`}
            </p>
          ) : selectedIds.length > 0 ? (
            <p className={cx(ui.textSmall, ui.textMuted, styles.listSummary)}>
              {selectedIds.length} vinculado{selectedIds.length === 1 ? '' : 's'} · {billable.length}{' '}
              en total
            </p>
          ) : null}
          {visibleBillable.length === 0 ? (
            <p className={cx(ui.textSmall, ui.textMuted, styles.emptyHint)}>
              {listQuery.trim()
                ? 'No hay documentos que coincidan con la búsqueda.'
                : 'No hay facturas ni albaranes para este contacto.'}
            </p>
          ) : (
            <div className={styles.list}>
              {visibleBillable.map((doc) => {
                const checked = selectedIds.includes(doc.id);
                const linkedElsewhere = isLinkedElsewhere(doc, currentActivityId);
                const itemDisabled = disabled || (linkedElsewhere && !checked);

                return (
                  <label
                    key={doc.id}
                    className={cx(
                      styles.item,
                      checked && styles.itemChecked,
                      itemDisabled && styles.itemDisabled,
                      draggingId === doc.id && styles.itemDragging,
                    )}
                    draggable={!itemDisabled && !isMobile}
                    onDragStart={(event) => handleDragStart(event, doc.id)}
                    onDragEnd={handleDragEnd}
                  >
                    {!isMobile && (
                      <span className={styles.dragHandle} aria-hidden>
                        <GripVertical size={16} />
                      </span>
                    )}
                    <input
                      type="checkbox"
                      className={ui.checkbox}
                      checked={checked}
                      disabled={itemDisabled}
                      onChange={() => toggle(doc.id)}
                    />
                    <span className={styles.itemBody}>
                      <span className={styles.itemTitle}>
                        {doc.number} · {DOCUMENT_TYPE_LABELS[doc.type]}
                      </span>
                      <span className={styles.itemMeta}>
                        {doc.date} · {doc.total.toFixed(2)}€
                      </span>
                    </span>
                    {linkedElsewhere && (
                      <span className={styles.linkedBadge}>Vinculado a otra actividad</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {invoices.length === 0 && billable.length > 0 && onDuplicateInvoice && (
        <p className={cx(ui.textSmall, ui.textMuted, styles.emptyHint)}>
          No hay facturas; solo albaranes. Crea una factura o duplica desde Documentos.
        </p>
      )}
    </div>
  );
}

export { DRAG_MIME };
