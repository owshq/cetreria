import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { DeleteDocumentTypeGroupDocumentsAction, DocumentTypeGroup } from '@shared/types';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ConfirmDialog.module.css';

type DeleteDocumentTypeGroupDialogProps = {
  open: boolean;
  group: DocumentTypeGroup | null;
  documentCount: number;
  loading?: boolean;
  onConfirm: (action: DeleteDocumentTypeGroupDocumentsAction) => void | Promise<void>;
  onCancel: () => void;
};

export default function DeleteDocumentTypeGroupDialog({
  open,
  group,
  documentCount,
  loading = false,
  onConfirm,
  onCancel,
}: DeleteDocumentTypeGroupDialogProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  usePopupEscape(open && !loading, onCancel);

  useEffect(() => {
    if (!open) return;
    acceptRef.current?.focus();
    return undefined;
  }, [open]);

  if (!open || !group) return null;

  const documentsLabel =
    documentCount === 1 ? '1 documento' : `${documentCount} documentos`;

  return (
    <ModalOverlay
      onClick={() => {
        if (!loading) onCancel();
      }}
      role="presentation"
    >
      <div
        className={cx(ui.modal, ui.modalMd)}
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-document-type-group-dialog-title"
        aria-describedby="delete-document-type-group-dialog-message"
      >
        <ModalHeader
          title="Eliminar tipo"
          titleId="delete-document-type-group-dialog-title"
          onClose={onCancel}
          closeDisabled={loading}
        />
        <div className={ui.modalBody}>
          <div className={styles.content}>
            <div className={styles.iconWrap} aria-hidden>
              <AlertTriangle size={20} />
            </div>
            <p id="delete-document-type-group-dialog-message" className={styles.message}>
              ¿Eliminar «{group.name}»?
              {documentCount > 0 ? (
                <>
                  {' '}
                  {documentsLabel} seguirán visibles en «Todos».
                  También puedes eliminar {documentCount === 1 ? 'ese documento' : 'todos los documentos'}.
                </>
              ) : (
                <> No hay documentos de este tipo.</>
              )}
            </p>
          </div>
        </div>
        <ModalFooter>
          <ModalActions>
            <button
              ref={acceptRef}
              type="button"
              onClick={() => void onConfirm('keep')}
              className={modalBtnPrimary}
              disabled={loading}
            >
              {loading ? 'Eliminando…' : 'Aceptar'}
            </button>
            {documentCount > 0 && (
              <button
                type="button"
                onClick={() => void onConfirm('delete_documents')}
                className={ui.btnDanger}
                disabled={loading}
              >
                {loading ? 'Eliminando…' : 'Eliminar documentos'}
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className={modalBtnSecondary}
              disabled={loading}
            >
              Cancelar
            </button>
          </ModalActions>
        </ModalFooter>
      </div>
    </ModalOverlay>
  );
}
