import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Paperclip, Send } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import ModalOverlay from '@/components/ModalOverlay';
import ModalHeader from '@/components/ModalHeader';
import DocumentPdfPreviewModal from '@/components/DocumentPdfPreviewModal';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import { parseEmailList } from '@/lib/emailCompose';
import {
  type DocumentEmailAttachmentPreview,
  releaseDocumentAttachmentPreviewUrl,
} from '@/lib/documentEmail';
import EmailRichTextEditor from '@/components/EmailRichTextEditor';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './EmailComposeModal.module.css';

export type EmailComposeModalProps = {
  open: boolean;
  onClose: () => void;
  defaultTo?: string;
  defaultCc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  attachmentLabel?: string;
  attachmentPreview?: DocumentEmailAttachmentPreview;
  sending?: boolean;
  onSend: (payload: { to: string; cc: string; subject: string; body: string }) => void | Promise<void>;
};

export default function EmailComposeModal({
  open,
  onClose,
  defaultTo = '',
  defaultCc = '',
  defaultSubject = '',
  defaultBody = '',
  attachmentLabel,
  attachmentPreview,
  sending = false,
  onSend,
}: EmailComposeModalProps) {
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState(defaultCc);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [showCc, setShowCc] = useState(Boolean(defaultCc.trim()));
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewUrlRef = useRef<string | null>(null);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    releaseDocumentAttachmentPreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPreviewError('');
    setPreviewLoading(false);
  }, []);

  usePopupEscape(open, onClose);
  usePopupEscape(previewOpen, closePreview);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setCc(defaultCc);
    setSubject(defaultSubject);
    setBody(defaultBody);
    setShowCc(Boolean(defaultCc.trim()));
    setError('');
  }, [open, defaultTo, defaultCc, defaultSubject, defaultBody]);

  useEffect(() => {
    if (open) return;
    closePreview();
  }, [open, closePreview]);

  const handleSend = async () => {
    if (parseEmailList(to).length === 0) {
      setError('Indica al menos un destinatario valido en Para.');
      return;
    }
    setError('');
    await onSend({ to, cc, subject, body });
  };

  const handleAttachmentPreview = async () => {
    if (!attachmentPreview || sending || previewLoading) return;

    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError('');
    releaseDocumentAttachmentPreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);

    try {
      const url = await attachmentPreview.loadPreviewUrl();
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch {
      setPreviewError('No se pudo cargar la vista previa del documento.');
    } finally {
      setPreviewLoading(false);
    }
  };

  if (!open) return null;

  const previewTitle = attachmentPreview?.title ?? attachmentLabel ?? 'Documento';
  const previewFileName = attachmentPreview?.fileName ?? attachmentLabel ?? 'documento.pdf';

  return (
    <>
      <ModalOverlay>
        <div
          className={cx(ui.modal, ui.modalLg, styles.compose)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-compose-title"
        >
          <ModalHeader
            title="Enviar correo"
            titleId="email-compose-title"
            onClose={onClose}
            closeDisabled={sending}
          />

          <div className={styles.composeBody}>
            <div className={styles.fields}>
              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel} htmlFor="email-compose-to">
                  Para
                </label>
                <input
                  id="email-compose-to"
                  type="text"
                  className={styles.fieldInput}
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  placeholder="destinatario@correo.com"
                  autoComplete="off"
                  disabled={sending}
                />
                {!showCc ? (
                  <button
                    type="button"
                    className={styles.ccToggle}
                    onClick={() => setShowCc(true)}
                    disabled={sending}
                  >
                    Cc
                  </button>
                ) : (
                  <span className={styles.fieldActionSpacer} />
                )}
              </div>

              {showCc ? (
                <div className={styles.fieldRow}>
                  <label className={styles.fieldLabel} htmlFor="email-compose-cc">
                    Cc
                  </label>
                  <input
                    id="email-compose-cc"
                    type="text"
                    className={styles.fieldInput}
                    value={cc}
                    onChange={(event) => setCc(event.target.value)}
                    placeholder="copia@correo.com"
                    autoComplete="off"
                    disabled={sending}
                  />
                  <span className={styles.fieldActionSpacer} />
                </div>
              ) : null}

              <div className={styles.fieldRow}>
                <label className={styles.fieldLabel} htmlFor="email-compose-subject">
                  Asunto
                </label>
                <input
                  id="email-compose-subject"
                  type="text"
                  className={styles.fieldInput}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  disabled={sending}
                />
                <span className={styles.fieldActionSpacer} />
              </div>
            </div>

            <EmailRichTextEditor
              id="email-compose-body"
              value={body}
              onChange={setBody}
              disabled={sending}
            />
          </div>

          {attachmentLabel ? (
            attachmentPreview ? (
              <button
                type="button"
                className={styles.attachmentBar}
                onClick={() => void handleAttachmentPreview()}
                disabled={sending || previewLoading}
                aria-label={`Vista previa de ${attachmentLabel}`}
              >
                <Paperclip size={14} aria-hidden />
                <span className={styles.attachmentLabel}>Adjunto</span>
                <span className={styles.attachmentName}>{attachmentLabel}</span>
                <span className={styles.attachmentPreviewHint}>
                  <Eye size={14} aria-hidden />
                  Vista previa
                </span>
              </button>
            ) : (
              <div className={styles.attachmentBarStatic}>
                <Paperclip size={14} aria-hidden />
                <span className={styles.attachmentLabel}>Adjunto</span>
                <span className={styles.attachmentName}>{attachmentLabel}</span>
              </div>
            )
          ) : null}

          {error ? <p className={styles.error}>{error}</p> : null}

          <ModalFooter className={styles.footer}>
            <ModalActions>
              <button
                type="button"
                className={modalBtnSecondary}
                onClick={onClose}
                disabled={sending}
              >
                Descartar
              </button>
              <button
                type="button"
                className={cx(modalBtnPrimary, styles.sendBtn)}
                onClick={() => void handleSend()}
                disabled={sending}
              >
                <Send size={15} aria-hidden />
                Enviar
              </button>
            </ModalActions>
          </ModalFooter>
        </div>
      </ModalOverlay>

      <DocumentPdfPreviewModal
        open={previewOpen}
        url={previewUrl}
        title={previewTitle}
        fileName={previewFileName}
        loading={previewLoading}
        error={previewError}
        hint="Vista previa del documento adjunto al correo."
        onClose={closePreview}
        onDownload={attachmentPreview?.onDownload}
      />
    </>
  );
}
