import { useEffect, useState } from 'react';
import { Plus, CircleMinus, Pencil, Check } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import type { ActivityType } from '@shared/types';
import { activityTypeCreatesDeliveryNote, activityTypeUsesWorkReport } from '@shared/types';
import { activityTypesService } from '@/api';
import { ACTIVITY_COLOR_PRESETS, ACTIVITY_ICON_OPTIONS, getActivityEmoji } from '@/lib/activityIcons';
import ColorPicker from '@/components/ColorPicker';
import { cx } from '@/lib/cx';
import { Input } from '@/components/forms';
import ui from '@/styles/shared.module.css';
import EmptyState from '@/components/EmptyState';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import ConfirmDialog from '@/components/ConfirmDialog';
import styles from './ActivityTypeManager.module.css';

type Props = {
  types: ActivityType[];
  onUpdated: () => void;
  onClose?: () => void;
  onCreated?: (type: ActivityType) => void;
  embedded?: boolean;
  hideTitle?: boolean;
  autoCreate?: boolean;
  /** Solo formulario de creación, sin lista ni gestión (p. ej. desde nueva actividad). */
  createOnly?: boolean;
};

type Draft = {
  name: string;
  icon: string;
  color: string;
  createsDeliveryNote: boolean;
};

const emptyDraft = (): Draft => ({
  name: '',
  icon: 'wrench',
  color: ACTIVITY_COLOR_PRESETS[0],
  createsDeliveryNote: true,
});

export default function ActivityTypeManager({
  types,
  onClose,
  onUpdated,
  onCreated,
  embedded = false,
  hideTitle = false,
  autoCreate = false,
  createOnly = false,
}: Props) {
  usePopupEscape(!embedded && Boolean(onClose), () => onClose?.());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<ActivityType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setDraft(emptyDraft());
    setError('');
  };

  useEffect(() => {
    if (autoCreate || createOnly) startCreate();
  }, [autoCreate, createOnly]);

  const startEdit = (type: ActivityType) => {
    setCreating(false);
    setEditingId(type.id);
    setDraft({ name: type.name, icon: type.icon, color: type.color, createsDeliveryNote: activityTypeCreatesDeliveryNote(type) });
    setError('');
  };

  const cancelEdit = () => {
    if (createOnly) {
      onClose?.();
      return;
    }
    setEditingId(null);
    setCreating(false);
    setDraft(emptyDraft());
    setError('');
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (creating) {
        const created = await activityTypesService.create({
          name: draft.name.trim(),
          icon: draft.icon,
          color: draft.color,
          createsDeliveryNote: draft.createsDeliveryNote,
        });
        cancelEdit();
        onUpdated();
        onCreated?.(created);
        return;
      } else if (editingId) {
        await activityTypesService.update(editingId, {
          name: draft.name.trim(),
          icon: draft.icon,
          color: draft.color,
          createsDeliveryNote: draft.createsDeliveryNote,
        });
      }
      cancelEdit();
      onUpdated();
    } catch {
      setError('No se pudo guardar el tipo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (type: ActivityType) => {
    setDeleteConfirm(type);
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await activityTypesService.delete(deleteConfirm.id);
      if (editingId === deleteConfirm.id) cancelEdit();
      setDeleteConfirm(null);
      onUpdated();
    } catch {
      setError('No se pudo eliminar el tipo');
    } finally {
      setDeleting(false);
    }
  };

  const isEditing = creating || editingId !== null;

  const scrollContent = (
    <>
      {!hideTitle && embedded && <h4 className={styles.embeddedTitle}>Gestionar tipos</h4>}
      {error && <p className={styles.error}>{error}</p>}

      {!createOnly && (
        <div className={cx(styles.typeList, embedded && styles.typeListEmbedded)}>
          {types.length === 0 && !isEditing ? (
            <EmptyState emoji="🏷️" description="Añade un tipo con el botón de abajo." compact />
          ) : (
            types.map((type) => {
            const emoji = getActivityEmoji(type.icon);
            const isActive = editingId === type.id;
            return (
              <div
                key={type.id}
                className={cx(
                  embedded ? styles.typeRowEmbedded : styles.typeRow,
                  isActive &&
                    (embedded ? styles.typeRowActiveEmbedded : styles.typeRowActive),
                )}
              >
                <div
                  className={cx(ui.activityEmojiBox, styles.typePreview)}
                  style={{ '--type-color': type.color } as React.CSSProperties}
                >
                  <span aria-hidden style={{ fontSize: '1rem', lineHeight: 1 }}>{emoji}</span>
                </div>
                <div className={embedded ? ui.listPanelItemBody : styles.typeInfo}>
                  <span className={embedded ? ui.listPanelItemTitle : styles.typeName}>{type.name}</span>
                  <span className={embedded ? ui.listPanelItemMessage : styles.typeMeta}>
                    {activityTypeUsesWorkReport(type) ? 'Informe de Trabajo' : 'Actividad normal'}
                  </span>
                </div>
                <div className={styles.typeActions}>
                  <button type="button" onClick={() => startEdit(type)} className={ui.btnIcon} title="Editar">
                    <Pencil size={16} />
                  </button>
                  <button type="button" onClick={() => handleDelete(type)} className={ui.btnIconDanger} title="Eliminar">
                    <CircleMinus size={16} />
                  </button>
                </div>
              </div>
            );
          })
          )}
        </div>
      )}

      {isEditing && (
        <div className={ui.form}>
          <div className={ui.field}>
            <label className={ui.label}>Nombre *</label>
            <Input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ej. Mantenimiento, Instalación, Reparación, Inspección…"
            />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Color</label>
            <ColorPicker value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </div>
          <div className={ui.field}>
            <label className={ui.label}>Icono</label>
            <div className={styles.iconGrid}>
              {ACTIVITY_ICON_OPTIONS.map(({ id, emoji, label }) => (
                <button
                  key={id}
                  type="button"
                  className={cx(styles.iconOption, draft.icon === id && styles.iconOptionActive)}
                  onClick={() => setDraft({ ...draft, icon: id })}
                  title={label}
                >
                  <span aria-hidden style={{ fontSize: '1.125rem', lineHeight: 1 }}>{emoji}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={ui.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={draft.createsDeliveryNote}
                onChange={(event) =>
                  setDraft({ ...draft, createsDeliveryNote: event.target.checked })
                }
              />
              Informe de Trabajo (genera albarán al completar)
            </label>
            <p className={styles.checkboxHint}>
              Si está desactivado, el tipo es una actividad normal sin informe ni albarán automático.
            </p>
          </div>
        </div>
      )}
    </>
  );

  const footer = (
    <ModalFooter className={embedded ? styles.embeddedFooter : undefined}>
      {isEditing || createOnly ? (
        <ModalActions>
          <button type="button" onClick={handleSave} disabled={saving} className={cx(modalBtnPrimary, styles.footerActionBtn)}>
            <Check size={18} />
            Guardar
          </button>
          <button type="button" onClick={cancelEdit} className={cx(modalBtnSecondary, styles.footerActionBtn)}>
            Cancelar
          </button>
        </ModalActions>
      ) : (
        <button type="button" onClick={startCreate} className={cx(modalBtnSecondary, styles.addBtn)}>
          <Plus size={18} />
          Añadir tipo
        </button>
      )}
    </ModalFooter>
  );

  const layout = (
    <div className={styles.managerLayout}>
      <div className={embedded ? styles.embeddedScroll : ui.modalScroll}>{scrollContent}</div>
      {footer}
    </div>
  );

  const deleteConfirmDialog = (
    <ConfirmDialog
      open={deleteConfirm !== null}
      title="Eliminar tipo de actividad"
      message={
        deleteConfirm
          ? `¿Eliminar el tipo "${deleteConfirm.name}"? Las actividades que lo usen aparecerán como "Sin tipo".`
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
        {deleteConfirmDialog}
      </>
    );
  }

  return (
    <>
      <ModalOverlay>
        <div className={cx(ui.modal, ui.modalLg, styles.managerModal)}>
          <ModalHeader title={createOnly ? 'Nuevo tipo de actividad' : 'Tipos de actividad'} onClose={onClose} />
          {layout}
        </div>
      </ModalOverlay>
      {deleteConfirmDialog}
    </>
  );
}
