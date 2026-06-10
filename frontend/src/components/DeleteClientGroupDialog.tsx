import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ClientGroup, DeleteClientGroupContactsAction } from '@shared/types';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ConfirmDialog.module.css';

type DeleteClientGroupDialogProps = {
  open: boolean;
  group: ClientGroup | null;
  contactCount: number;
  loading?: boolean;
  onConfirm: (action: DeleteClientGroupContactsAction) => void | Promise<void>;
  onCancel: () => void;
};

export default function DeleteClientGroupDialog({
  open,
  group,
  contactCount,
  loading = false,
  onConfirm,
  onCancel,
}: DeleteClientGroupDialogProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);

  usePopupEscape(open && !loading, onCancel);

  useEffect(() => {
    if (!open) return;
    acceptRef.current?.focus();
    return undefined;
  }, [open]);

  if (!open || !group) return null;

  const contactsLabel =
    contactCount === 1 ? '1 contacto' : `${contactCount} contactos`;

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
        aria-labelledby="delete-group-dialog-title"
        aria-describedby="delete-group-dialog-message"
      >
        <ModalHeader
          title="Eliminar grupo"
          titleId="delete-group-dialog-title"
          onClose={onCancel}
          closeDisabled={loading}
        />
        <div className={ui.modalBody}>
          <div className={styles.content}>
            <div className={styles.iconWrap} aria-hidden>
              <AlertTriangle size={20} />
            </div>
            <p id="delete-group-dialog-message" className={styles.message}>
              ¿Eliminar el grupo «{group.name}»?
              {contactCount > 0 ? (
                <>
                  {' '}
                  {contactsLabel} del grupo {contactCount === 1 ? 'pasará' : 'pasarán'} a «Todos».
                  También puedes eliminar {contactCount === 1 ? 'ese contacto' : 'todos los contactos'}.
                </>
              ) : (
                <> No hay contactos en este grupo.</>
              )}
            </p>
          </div>
        </div>
        <ModalFooter>
          <ModalActions>
            <button
              ref={acceptRef}
              type="button"
              onClick={() => void onConfirm('move_to_all')}
              className={modalBtnPrimary}
              disabled={loading}
            >
              {loading ? 'Eliminando…' : 'Aceptar'}
            </button>
            {contactCount > 0 && (
              <button
                type="button"
                onClick={() => void onConfirm('delete_contacts')}
                className={ui.btnDanger}
                disabled={loading}
              >
                {loading ? 'Eliminando…' : 'Eliminar contactos'}
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
