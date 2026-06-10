import { Download } from 'lucide-react';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import previewModalStyles from '@/components/documentPreviewModal.module.css';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ActivityDeliveryNotePreviewModalProps = {
  open: boolean;
  url: string;
  title: string;
  hint?: string | null;
  fileName: string;
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
  onClose,
  onDownload,
}: ActivityDeliveryNotePreviewModalProps) {
  if (!open) return null;

  return (
    <ModalOverlay>
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
              onClick={() => void onDownload()}
            >
              <Download size={16} aria-hidden />
              Descargar albarán
            </button>
          </div>
        </ModalHeader>
        <div className={previewModalStyles.previewBody}>
          <PdfViewer
            className={previewModalStyles.previewFrame}
            src={url}
            fileName={fileName}
            title={title}
          />
        </div>
      </div>
    </ModalOverlay>
  );
}
