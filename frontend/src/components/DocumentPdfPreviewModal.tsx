import { Download } from 'lucide-react';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import ContentLoading from '@/components/ContentLoading';
import previewModalStyles from '@/components/documentPreviewModal.module.css';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './DocumentPdfPreviewModal.module.css';

type DocumentPdfPreviewModalProps = {
  open: boolean;
  url: string | null;
  title: string;
  fileName: string;
  loading?: boolean;
  error?: string;
  hint?: string | null;
  onClose: () => void;
  onDownload?: () => void | Promise<void>;
};

export default function DocumentPdfPreviewModal({
  open,
  url,
  title,
  fileName,
  loading = false,
  error = '',
  hint,
  onClose,
  onDownload,
}: DocumentPdfPreviewModalProps) {
  if (!open) return null;

  return (
    <ModalOverlay>
      <div
        className={cx(ui.modal, ui.modalXl, previewModalStyles.previewPanel)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-pdf-preview-title"
      >
        <ModalHeader
          title={title}
          titleId="document-pdf-preview-title"
          onClose={onClose}
          closeLabel="Cerrar vista previa"
        >
          {hint ? <p className={previewModalStyles.previewHint}>{hint}</p> : null}
          {onDownload ? (
            <div className={previewModalStyles.previewHeaderActions}>
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => void onDownload()}
              >
                <Download size={16} aria-hidden />
                Descargar PDF
              </button>
            </div>
          ) : null}
        </ModalHeader>
        <div className={previewModalStyles.previewBody}>
          {loading ? (
            <div className={styles.loadingWrap}>
              <ContentLoading label="Cargando documento" />
            </div>
          ) : error ? (
            <p className={styles.error}>{error}</p>
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
