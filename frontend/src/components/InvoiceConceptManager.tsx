import { useMemo, useState } from 'react';
import { Plus, CircleMinus, Pencil, Check } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import type { InvoiceConceptSetting } from '@shared/types';
import {
  DEFAULT_CONCEPT_EMOJI,
  formatDocumentAmount,
  getInvoiceConceptLabel,
  normalizeInvoiceConceptDefaultPrice,
} from '@shared/types';
import { invoiceConceptSettingsService } from '@/api';
import EmojiPicker from '@/components/EmojiPicker';
import { cx } from '@/lib/cx';
import { Input, SearchField } from '@/components/forms';
import ui from '@/styles/shared.module.css';
import EmptyState from '@/components/EmptyState';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import ConfirmDialog from '@/components/ConfirmDialog';
import styles from './ActivityTypeManager.module.css';
import conceptStyles from './InvoiceConceptManager.module.css';

type Props = {
  concepts: InvoiceConceptSetting[];
  onUpdated: () => void;
  onClose?: () => void;
  embedded?: boolean;
  hideTitle?: boolean;
  /** Búsqueda renderizada fuera del manager (p. ej. bajo el título de sección). */
  searchOutside?: boolean;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
};

type Draft = {
  label: string;
  emoji: string;
  defaultPrice: string;
};

const emptyDraft = (): Draft => ({
  label: '',
  emoji: DEFAULT_CONCEPT_EMOJI,
  defaultPrice: '0',
});

export default function InvoiceConceptManager({
  concepts,
  onClose,
  onUpdated,
  embedded = false,
  hideTitle = false,
  searchOutside = false,
  searchTerm: controlledSearchTerm,
  onSearchTermChange,
}: Props) {
  const [internalSearchTerm, setInternalSearchTerm] = useState('');
  const searchTerm = controlledSearchTerm ?? internalSearchTerm;
  const setSearchTerm = onSearchTermChange ?? setInternalSearchTerm;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<InvoiceConceptSetting | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredConcepts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return concepts;
    const tokens = term.split(/\s+/).filter(Boolean);
    return concepts.filter((concept) => {
      const haystack = getInvoiceConceptLabel(concept).toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [concepts, searchTerm]);

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setDraft(emptyDraft());
    setError('');
  };

  const startEdit = (concept: InvoiceConceptSetting) => {
    setCreating(false);
    setEditingId(concept.id);
    setDraft({
      label: getInvoiceConceptLabel(concept),
      emoji: concept.emoji,
      defaultPrice: String(normalizeInvoiceConceptDefaultPrice(concept.defaultPrice)),
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft());
    setError('');
  };

  const handleSave = async () => {
    if (!draft.label.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    const defaultPrice = normalizeInvoiceConceptDefaultPrice(draft.defaultPrice);

    setSaving(true);
    setError('');
    try {
      if (creating) {
        await invoiceConceptSettingsService.create({
          label: draft.label.trim(),
          emoji: draft.emoji,
          defaultPrice,
        });
      } else if (editingId) {
        await invoiceConceptSettingsService.update(editingId, {
          label: draft.label.trim(),
          emoji: draft.emoji,
          defaultPrice,
        });
      }
      cancelEdit();
      onUpdated();
    } catch {
      setError('No se pudo guardar el concepto');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (concept: InvoiceConceptSetting) => {
    setDeleteConfirm(concept);
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await invoiceConceptSettingsService.delete(deleteConfirm.id);
      if (editingId === deleteConfirm.id) cancelEdit();
      setDeleteConfirm(null);
      onUpdated();
    } catch {
      setError('No se pudo eliminar el concepto');
    } finally {
      setDeleting(false);
    }
  };

  const isEditing = creating || editingId !== null;

  usePopupEscape(
    (!embedded && Boolean(onClose)) || (embedded && isEditing),
    () => {
      if (embedded && isEditing) cancelEdit();
      else onClose?.();
    },
  );

  const formFields = (
    <div className={ui.form}>
      <div className={ui.field}>
        <label className={ui.label} htmlFor="concept-label-input">
          Nombre *
        </label>
        <Input
          id="concept-label-input"
          type="text"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="Ej. Mano de obra, Material, Desplazamiento…"
          required
        />
      </div>
      <div className={conceptStyles.metaRow}>
        <div className={ui.field}>
          <label className={ui.label} htmlFor="concept-price-input">
            Precio unitario
          </label>
          <Input
            id="concept-price-input"
            type="number"
            min={0}
            step={0.01}
            value={draft.defaultPrice}
            onChange={(e) => setDraft({ ...draft, defaultPrice: e.target.value })}
            placeholder="0,00"
          />
        </div>
        <div className={ui.field}>
          <span className={ui.label}>Emoji</span>
          <EmojiPicker
            value={draft.emoji}
            onChange={(emoji) => setDraft({ ...draft, emoji })}
            ariaLabel="Emoji del concepto"
          />
        </div>
      </div>
    </div>
  );

  const editActionButtons = (
    <>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={cx(modalBtnPrimary, styles.footerActionBtn)}
      >
        <Check size={18} />
        Guardar
      </button>
      <button
        type="button"
        onClick={cancelEdit}
        className={cx(modalBtnSecondary, styles.footerActionBtn)}
      >
        Cancelar
      </button>
    </>
  );

  const inlineEditForm = !embedded && isEditing ? (
    <div className={conceptStyles.editPanel}>
      <p className={conceptStyles.editPanelTitle}>
        {creating ? 'Nuevo concepto' : 'Editar concepto'}
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {formFields}
      <ModalActions className={conceptStyles.editPanelActions}>{editActionButtons}</ModalActions>
    </div>
  ) : null;

  const embeddedEditModal = embedded && isEditing ? (
    <ModalOverlay>
      <div
        className={cx(ui.modal, ui.modalMd, styles.managerModal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-concept-edit-title"
      >
        <ModalHeader
          title={creating ? 'Nuevo concepto' : 'Editar concepto'}
          titleId="invoice-concept-edit-title"
          onClose={cancelEdit}
          closeDisabled={saving}
        />
        <div className={ui.modalScroll}>
          {error && <p className={ui.alertError}>{error}</p>}
          {formFields}
        </div>
        <ModalFooter>
          <ModalActions>{editActionButtons}</ModalActions>
        </ModalFooter>
      </div>
    </ModalOverlay>
  ) : null;

  const scrollContent = (
    <>
      {!hideTitle && embedded && <h4 className={styles.embeddedTitle}>Gestionar conceptos</h4>}
      {error && !(embedded && isEditing) && <p className={styles.error}>{error}</p>}

      {concepts.length > 0 && !searchOutside && (
        <div className={ui.filtersRow} style={{ marginBottom: '0.75rem' }}>
          <SearchField
            wrapperClassName={ui.searchWrapper}
            placeholder="Buscar conceptos"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      )}

      {inlineEditForm}

      <div className={cx(styles.typeList, embedded && styles.typeListEmbedded)}>
        {filteredConcepts.length === 0 && !isEditing ? (
          <EmptyState
            emoji="🧾"
            description={
              searchTerm.trim()
                ? 'No hay conceptos que coincidan con la búsqueda.'
                : 'Añade un concepto con el botón de abajo.'
            }
            compact
          />
        ) : (
          filteredConcepts.map((concept) => {
            const isActive = editingId === concept.id;
            const label = getInvoiceConceptLabel(concept);
            return (
              <div
                key={concept.id}
                className={cx(
                  embedded ? styles.typeRowEmbedded : styles.typeRow,
                  isActive &&
                    (embedded ? styles.typeRowActiveEmbedded : styles.typeRowActive),
                )}
              >
                <div className={cx(conceptStyles.conceptEmojiBox, styles.typePreview)}>
                  <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>
                    {concept.emoji}
                  </span>
                </div>
                <div className={embedded ? ui.listPanelItemBody : styles.typeInfo}>
                  <span className={embedded ? ui.listPanelItemTitle : styles.typeName}>{label}</span>
                  <span className={conceptStyles.conceptPrice}>
                    {formatDocumentAmount(normalizeInvoiceConceptDefaultPrice(concept.defaultPrice))}
                  </span>
                </div>
                <div className={styles.typeActions}>
                  <button
                    type="button"
                    onClick={() => startEdit(concept)}
                    className={ui.btnIcon}
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(concept)}
                    className={ui.btnIconDanger}
                    title="Eliminar"
                  >
                    <CircleMinus size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );


  const footer = !isEditing ? (
    <ModalFooter className={embedded ? styles.embeddedFooter : undefined}>
      <button type="button" onClick={startCreate} className={cx(modalBtnSecondary, styles.addBtn)}>
        <Plus size={18} />
        Añadir concepto
      </button>
    </ModalFooter>
  ) : null;

  const layout = (
    <div className={cx(styles.managerLayout, embedded && conceptStyles.embeddedLayout)}>
      <div className={embedded ? styles.embeddedScroll : ui.modalScroll}>{scrollContent}</div>
      {footer}
    </div>
  );

  const deleteConfirmDialog = (
    <ConfirmDialog
      open={deleteConfirm !== null}
      title="Eliminar concepto"
      message={
        deleteConfirm
          ? `¿Eliminar el concepto "${getInvoiceConceptLabel(deleteConfirm)}"? Las facturas existentes conservarán el texto actual en sus líneas.`
          : ''
      }
      loading={deleting}
      onConfirm={executeDelete}
      onCancel={() => {
        if (!deleting) setDeleteConfirm(null);
      }}
    />
  );

  if (embedded) {
    return (
      <>
        {layout}
        {embeddedEditModal}
        {deleteConfirmDialog}
      </>
    );
  }

  return (
    <>
      <ModalOverlay>
        <div className={cx(ui.modal, ui.modalLg, styles.managerModal)}>
          <ModalHeader title="Conceptos de factura" onClose={onClose} />
          {layout}
        </div>
      </ModalOverlay>
      {deleteConfirmDialog}
    </>
  );
}
