import { ArrowDownToLine } from 'lucide-react';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import ContentLoading from '@/components/ContentLoading';
import previewModalStyles from '@/components/documentPreviewModal.module.css';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ActivityDeliveryNotePreviewModal.module.css';

type ActivityDeliveryNotePreviewModalProps = {
  open: boolean;
  url: string | null;
  title: string;
  hint?: string | null;
  fileName: string;
  loading?: boolean;
  error?: string | null;
  persisted: boolean;
  onClose: () => void;
  onDownload: () => void | Promise<void>;
};

export default function ActivityDeliveryNotePreviewModal({
  open,
  url,
  title,
  hint,
  fileName,
  loading = false,
  error = null,
  onClose,
  onDownload,
}: ActivityDeliveryNotePreviewModalProps) {
  usePopupEscape(open, onClose);

  if (!open) return null;

  return (
    <ModalOverlay raised>
      <div
        className={cx(ui.modal, ui.modalXl, previewModalStyles.previewPanel)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-delivery-note-preview-title"
      >
        <ModalHeader
          title={title}
          titleId="activity-delivery-note-preview-title"
          onClose={onClose}
          closeLabel="Cerrar albarán"
        >
          {hint ? <p className={previewModalStyles.previewHint}>{hint}</p> : null}
          <div className={previewModalStyles.previewHeaderActions}>
            <button
              type="button"
              className={ui.btnSecondary}
              disabled={loading || Boolean(error) || !url}
              onClick={() => void onDownload()}
            >
              <ArrowDownToLine size={16} aria-hidden />
              Descargar albarán
            </button>
          </div>
        </ModalHeader>
        <div className={previewModalStyles.previewBody}>
          {loading ? (
            <div className={styles.loadingWrap}>
              <ContentLoading label="Generando albaran" />
            </div>
          ) : error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : url ? (
            <PdfViewer
              className={previewModalStyles.previewFrame}
              src={url}
              fileName={fileName}
              title={title}
            />
          ) : null}
        </div>
      </div>
    </ModalOverlay>
  );
}
