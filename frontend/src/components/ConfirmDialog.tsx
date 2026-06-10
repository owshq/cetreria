import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ConfirmDialog.module.css';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  usePopupEscape(open && !loading, onCancel);

  useEffect(() => {
    if (!open) return;

    confirmRef.current?.focus();

    return undefined;
  }, [open]);

  if (!open) return null;

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
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
          <ModalHeader
            title={title}
            titleId="confirm-dialog-title"
            onClose={onCancel}
            closeDisabled={loading}
          />
          <div className={ui.modalBody}>
            <div className={styles.content}>
              <div className={styles.iconWrap} aria-hidden>
                <AlertTriangle size={20} />
              </div>
              <p id="confirm-dialog-message" className={styles.message}>
                {message}
              </p>
            </div>
          </div>
          <ModalFooter>
            <ModalActions>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => void onConfirm()}
                className={ui.btnDanger}
                disabled={loading}
              >
                {loading ? 'Eliminando…' : confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={modalBtnSecondary}
                disabled={loading}
              >
                {cancelLabel}
              </button>
            </ModalActions>
          </ModalFooter>
        </div>
    </ModalOverlay>
  );
}
