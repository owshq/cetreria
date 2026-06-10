import { useEffect, useMemo, useState } from 'react';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import SelectMenu, { type SelectMenuOption } from '@/components/SelectMenu';
import { usePopupEscape } from '@/context/PopupStackContext';
import type { Document, DocumentTypeGroup } from '@shared/types';
import { DEFAULT_DOCUMENT_TYPE_GROUP_LABELS, DOCUMENT_TYPE_LABELS } from '@shared/types';
import { documentTypeGroupsService } from '@/api';
import { cx } from '@/lib/cx';
import { Input } from '@/components/forms';
import ui from '@/styles/shared.module.css';

const ALL_DOCUMENT_TYPE_OPTIONS: SelectMenuOption[] = [
  { value: 'delivery-note', label: DOCUMENT_TYPE_LABELS['delivery-note'], emoji: '??' },
  { value: 'invoice', label: DOCUMENT_TYPE_LABELS.invoice, emoji: '??' },
];

type DocumentTypeGroupModalProps = {
  open: boolean;
  group?: DocumentTypeGroup | null;
  creatableDocumentTypes?: Document['type'][];
  onClose: () => void;
  onSaved: (group: DocumentTypeGroup) => void;
};

export default function DocumentTypeGroupModal({
  open,
  group = null,
  creatableDocumentTypes = [],
  onClose,
  onSaved,
}: DocumentTypeGroupModalProps) {
  const isEdit = Boolean(group);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState<Document['type']>('delivery-note');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const documentTypeOptions = useMemo(
    () => ALL_DOCUMENT_TYPE_OPTIONS.filter((option) => creatableDocumentTypes.includes(option.value as Document['type'])),
    [creatableDocumentTypes],
  );

  const resolvedDocumentType = isEdit && group ? group.documentType : documentType;
  const isInvoiceGroup = resolvedDocumentType === 'invoice';

  const visibilityIsPublic = useMemo(
    () => (isInvoiceGroup ? false : isPublic),
    [isInvoiceGroup, isPublic],
  );

  useEffect(() => {
    if (!open) return;
    const initialType = group?.documentType ?? creatableDocumentTypes[0] ?? 'delivery-note';
    setName(group?.name ?? DEFAULT_DOCUMENT_TYPE_GROUP_LABELS[initialType] ?? '');
    setDocumentType(initialType);
    setIsPublic(group?.documentType === 'invoice' ? false : group?.isPublic === true);
    setError('');
  }, [open, group, creatableDocumentTypes]);

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

    if (!isEdit && !creatableDocumentTypes.includes(documentType)) {
      setError('Ya existe un grupo para este tipo de documento');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved = isEdit && group
        ? await documentTypeGroupsService.update(group.id, {
            name: trimmed,
            ...(group.documentType === 'invoice' ? {} : { isPublic: visibilityIsPublic }),
          })
        : await documentTypeGroupsService.create({
            name: trimmed,
            documentType,
            isPublic: visibilityIsPublic,
          });
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
      <div
        className={cx(ui.modal, ui.modalMd)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-type-group-title"
      >
        <ModalHeader
          title={isEdit ? 'Editar grupo de documentos' : 'Nuevo grupo de documentos'}
          titleId="document-type-group-title"
          onClose={handleClose}
          closeDisabled={saving}
        />
        <form onSubmit={handleSubmit} className={ui.modalForm}>
          <div className={ui.modalScroll}>
            <div className={ui.form}>
              <div className={ui.field}>
                <label className={ui.label} htmlFor="document-type-group-name">
                  Nombre del grupo *
                </label>
                <Input
                  id="document-type-group-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Albaranes de obra, Facturas emitidas…"
                  autoFocus
                  required
                />
              </div>

              {!isEdit && documentTypeOptions.length > 0 && (
                <div className={ui.field}>
                  <label className={ui.label} htmlFor="document-type-group-type">
                    Tipo de documento *
                  </label>
                  {documentTypeOptions.length === 1 ? (
                    <Input
                      id="document-type-group-type"
                      value={DOCUMENT_TYPE_LABELS[documentType]}
                      readOnly
                      disabled
                    />
                  ) : (
                    <SelectMenu
                      id="document-type-group-type"
                      value={documentType}
                      onChange={(value) => {
                        const nextType = value as Document['type'];
                        setDocumentType(nextType);
                        if (nextType === 'invoice') setIsPublic(false);
                      }}
                      options={documentTypeOptions}
                      ariaLabel="Tipo de documento del grupo"
                      menuPortal
                    />
                  )}
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Solo puede existir un grupo por tipo (Facturas o Albaranes).
                  </p>
                </div>
              )}

              {isInvoiceGroup ? (
                <div className={ui.field}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    Las facturas son solo visibles para administradores. Los operarios no acceden a
                    este grupo.
                  </p>
                </div>
              ) : (
                <div className={ui.field}>
                  <label className={ui.checkboxRow} htmlFor="document-type-group-public">
                    <input
                      id="document-type-group-public"
                      type="checkbox"
                      checked={isPublic}
                      onChange={(event) => setIsPublic(event.target.checked)}
                    />
                    <span>Grupo publico para operarios</span>
                  </label>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    {isPublic
                      ? 'Todos los operarios pueden ver los albaranes de este tipo en el workspace.'
                      : 'Solo ven albaranes ligados a actividades en las que estan asignados.'}
                  </p>
                </div>
              )}

              {error && <p className={ui.alertError}>{error}</p>}
            </div>
          </div>
          <ModalFooter>
            <ModalActions>
              <button type="submit" className={modalBtnPrimary} disabled={saving}>
                {saving ? 'Guardando�' : isEdit ? 'Guardar cambios' : 'Crear grupo'}
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
