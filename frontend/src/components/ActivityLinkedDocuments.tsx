import type { Client, Document } from '@shared/types';
import { DOCUMENT_TYPE_LABELS } from '@shared/types';
import { openDocumentPdf, openDocumentPdfLocally } from '@/lib/documentPdf';
import { cx } from '@/lib/cx';
import styles from './ActivityLinkedDocuments.module.css';

type Props = {
  documents: Document[];
  clientsMap?: Map<string, Client>;
  className?: string;
};

export default function ActivityLinkedDocuments({ documents, clientsMap, className }: Props) {
  if (documents.length === 0) return null;

  const handleOpen = async (doc: Document, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const client = clientsMap?.get(doc.clientId);
    try {
      await openDocumentPdf(doc, client);
    } catch {
      if (client) openDocumentPdfLocally(doc, client);
    }
  };

  return (
    <div className={cx(styles.root, className)}>
      {documents.map((doc) => (
        <button
          key={doc.id}
          type="button"
          className={styles.chip}
          onClick={(event) => void handleOpen(doc, event)}
          title={`Abrir ${DOCUMENT_TYPE_LABELS[doc.type].toLowerCase()} ${doc.number}`}
        >
          <span className={styles.chipLabel}>
            {DOCUMENT_TYPE_LABELS[doc.type]} {doc.number}
          </span>
        </button>
      ))}
    </div>
  );
}
