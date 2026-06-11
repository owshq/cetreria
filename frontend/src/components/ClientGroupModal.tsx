import { useEffect, useState } from 'react';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { usePopupEscape } from '@/context/PopupStackContext';
import type { ClientGroup } from '@shared/types';
import { clientGroupsService } from '@/api';
import { cx } from '@/lib/cx';
import { Input } from '@/components/forms';
import ui from '@/styles/shared.module.css';

type ClientGroupModalProps = {
  open: boolean;
  group?: ClientGroup | null;
  onClose: () => void;
  onSaved: (group: ClientGroup) => void;
};

export default function ClientGroupModal({
  open,
  group = null,
  onClose,
  onSaved,
}: ClientGroupModalProps) {
  const isEdit = Boolean(group);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setError('');
  }, [open, group]);

  const handleClose = () => {
    if (saving) return;
    setError('');
    onClose();
  };

  usePopupEscape(open, handleClose);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved =
        isEdit && group
          ? await clientGroupsService.update(group.id, { name: trimmed })
          : await clientGroupsService.create(trimmed);
      onSaved(saved);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo guardar el grupo';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <ModalOverlay>
      <div className={cx(ui.modal, ui.modalMd)} role="dialog" aria-modal="true" aria-labelledby="client-group-title">
        <ModalHeader
          title={isEdit ? 'Editar grupo de contactos' : 'Nuevo grupo de contactos'}
          titleId="client-group-title"
          onClose={handleClose}
          closeDisabled={saving}
        />
        <form onSubmit={handleSubmit} className={ui.modalForm}>
          <div className={ui.modalScroll}>
            <div className={ui.form}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="client-group-name">
                  Nombre del grupo *
                </label>
                <Input
                  id="client-group-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Proveedores, Partners…"
                  autoFocus
                  required
                />
              </div>
              {error && <p className={ui.alertError}>{error}</p>}
            </div>
          </div>
          <ModalFooter>
            <ModalActions>
              <button type="submit" className={modalBtnPrimary} disabled={saving}>
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear grupo'}
              </button>
              <button type="button" onClick={handleClose} className={modalBtnSecondary} disabled={saving}>
                Cancelar
              </button>
            </ModalActions>
          </ModalFooter>
        </form>
      </div>
    </ModalOverlay>
  );
}
