import { useCallback, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, FileText, Link2, Trash2 } from 'lucide-react';
import type { Activity } from '@shared/types';
import { MAX_ACTIVITY_ATTACHMENTS, normalizeActivityAttachments } from '@shared/types';
import { activitiesService } from '@/api/activities';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ActivityAttachmentsPanel.module.css';

const ACCEPTED_FILE_TYPES =
  '.pdf,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

type ActivityAttachmentsPanelProps = {
  activity: Activity | null;
  canEdit?: boolean;
  disabled?: boolean;
  ensureActivity?: () => Promise<Activity | null>;
  onActivityUpdated?: (activity: Activity) => void;
  onError?: (message: string) => void;
};

export default function ActivityAttachmentsPanel({
  activity,
  canEdit = false,
  disabled = false,
  ensureActivity,
  onActivityUpdated,
  onError,
}: ActivityAttachmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const attachments = normalizeActivityAttachments(activity?.attachments);
  const atLimit = attachments.length >= MAX_ACTIVITY_ATTACHMENTS;

  const openFilePicker = useCallback(() => {
    if (!canEdit || disabled || uploading || atLimit) return;
    fileInputRef.current?.click();
  }, [atLimit, canEdit, disabled, uploading]);

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !canEdit || disabled) return;

      setUploading(true);
      try {
        let latest = activity;
        if (!latest?.id) {
          latest = (await ensureActivity?.()) ?? null;
          if (!latest) return;
        }

        for (const file of Array.from(files)) {
          if (normalizeActivityAttachments(latest.attachments).length >= MAX_ACTIVITY_ATTACHMENTS) {
            break;
          }
          latest = await activitiesService.uploadAttachment(latest.id, file);
          onActivityUpdated?.(latest);
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'No se pudo subir el archivo.');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [activity, canEdit, disabled, ensureActivity, onActivityUpdated, onError],
  );

  const handleDownload = useCallback(
    async (attachmentId: string, filename: string) => {
      if (!activity?.id) return;
      try {
        const blob = await activitiesService.getAttachmentBlob(activity.id, attachmentId);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'No se pudo descargar el archivo.');
      }
    },
    [activity?.id, onError],
  );

  const handleDelete = useCallback(
    async (attachmentId: string) => {
      if (!activity?.id) return;
      setDeletingId(attachmentId);
      try {
        const updated = await activitiesService.deleteAttachment(activity.id, attachmentId);
        onActivityUpdated?.(updated);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : 'No se pudo eliminar el archivo.');
      } finally {
        setDeletingId(null);
      }
    },
    [activity?.id, onActivityUpdated, onError],
  );

  return (
    <div className={styles.root}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        multiple
        hidden
        aria-hidden
        tabIndex={-1}
        onChange={(event) => void handleFilesSelected(event.target.files)}
      />

      {attachments.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.activityViewEmpty}>Sin documentos adjuntos a esta actividad.</p>
          {canEdit ? (
            <button
              type="button"
              className={ui.btnPrimary}
              disabled={disabled || uploading}
              onClick={openFilePicker}
            >
              <Link2 size={16} aria-hidden />
              {uploading ? 'Subiendoù' : 'Vincular documentos'}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <ul className={styles.list} aria-label="Documentos adjuntos">
            {attachments.map((attachment) => (
              <li key={attachment.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <FileText size={16} aria-hidden className={styles.itemIcon} />
                  <div className={styles.itemMeta}>
                    <span className={styles.itemName}>{attachment.filename}</span>
                    <span className={styles.itemDate}>
                      {attachment.uploadedAt
                        ? format(parseISO(attachment.uploadedAt), "d MMM yyyy ù HH:mm", {
                            locale: es,
                          })
                        : null}
                    </span>
                  </div>
                </div>
                <div className={styles.itemActions}>
                  <button
                    type="button"
                    className={ui.btnSecondary}
                    onClick={() => void handleDownload(attachment.id, attachment.filename)}
                  >
                    <Download size={16} aria-hidden />
                    Descargar
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      disabled={disabled || deletingId === attachment.id}
                      onClick={() => void handleDelete(attachment.id)}
                    >
                      <Trash2 size={16} aria-hidden />
                      {deletingId === attachment.id ? 'Eliminandoù' : 'Eliminar'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <button
              type="button"
              className={cx(ui.btnSecondary, styles.addButton)}
              disabled={disabled || uploading || atLimit}
              onClick={openFilePicker}
            >
              <Link2 size={16} aria-hidden />
              {uploading ? 'Subiendoù' : atLimit ? 'Limite alcanzado' : 'Vincular documentos'}
            </button>
          ) : null}
        </>
      )}

      {canEdit ? (
        <p className={cx(ui.textSmall, ui.textMuted, styles.hint)}>
          PDF o imagen desde tu dispositivo. Maximo {MAX_ACTIVITY_ATTACHMENTS} archivos.
        </p>
      ) : null}
    </div>
  );
}
