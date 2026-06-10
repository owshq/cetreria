import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Document, WorkspaceBillingSettings } from '@shared/types';
import { cx } from '@/lib/cx';
import { isVerifactuProductionEnabledInClient } from '@/lib/verifactuProduction';
import styles from './VerifactuDocumentMetaPanel.module.css';

type VerifactuDocumentMetaPanelProps = {
  document: Document;
  billingSettings: WorkspaceBillingSettings | null;
};

function formatSubmittedAt(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return format(parseISO(value), "d MMM yyyy, HH:mm", { locale: es });
  } catch {
    return value;
  }
}

export default function VerifactuDocumentMetaPanel({
  document,
  billingSettings,
}: VerifactuDocumentMetaPanelProps) {
  const status = document.verifactuStatus;
  if (status !== 'aceptado' && status !== 'rechazado') return null;

  const submittedAtLabel = formatSubmittedAt(document.verifactuSubmittedAt);
  const isSandbox =
    billingSettings?.verifactuEnvironment !== 'production' ||
    !isVerifactuProductionEnabledInClient();

  if (status === 'rechazado') {
    return (
      <section
        className={cx(styles.panel, styles.panelRejected)}
        aria-label="Registro fiscal rechazado"
        data-testid="verifactu-meta-rejected"
      >
        <h2 className={styles.title}>Registro fiscal rechazado</h2>
        <p className={styles.sandboxNote}>
          Proveedor fiscal: Espana � AEAT Veri*Factu
          {isSandbox ? '. En sandbox la respuesta esta simulada; no hay envio real a Hacienda.' : '.'}
        </p>
        <dl className={styles.metaList}>
          {document.verifactuErrorCode ? (
            <div className={styles.metaRow}>
              <dt>Codigo de error</dt>
              <dd>
                <code className={styles.code}>{document.verifactuErrorCode}</code>
              </dd>
            </div>
          ) : null}
          {document.verifactuErrorMessage ? (
            <div className={styles.metaRow}>
              <dt>Motivo</dt>
              <dd>{document.verifactuErrorMessage}</dd>
            </div>
          ) : null}
          {!document.verifactuErrorCode && !document.verifactuErrorMessage ? (
            <div className={styles.metaRow}>
              <dt>Motivo</dt>
              <dd className={styles.muted}>Sin detalle de error registrado.</dd>
            </div>
          ) : null}
          {submittedAtLabel ? (
            <div className={styles.metaRow}>
              <dt>Fecha del intento</dt>
              <dd>{submittedAtLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>
    );
  }

  return (
    <section
      className={cx(styles.panel, styles.panelAccepted)}
      aria-label="Registro fiscal aceptado"
      data-testid="verifactu-meta-accepted"
    >
      <h2 className={styles.title}>Registro fiscal aceptado</h2>
      <p className={styles.sandboxNote}>
        Proveedor fiscal: Espana � AEAT Veri*Factu
        {isSandbox
          ? '. En sandbox se simula el registro fiscal. No se realiza un envio real a Hacienda.'
          : '.'}
      </p>
      <dl className={styles.metaList}>
        {document.verifactuCsv ? (
          <div className={styles.metaRow}>
            <dt>CSV</dt>
            <dd>
              <code className={styles.code}>{document.verifactuCsv}</code>
            </dd>
          </div>
        ) : null}
        {submittedAtLabel ? (
          <div className={styles.metaRow}>
            <dt>Fecha de registro fiscal</dt>
            <dd>{submittedAtLabel}</dd>
          </div>
        ) : null}
        {document.verifactuHash ? (
          <div className={styles.metaRow}>
            <dt>Huella</dt>
            <dd>
              <code className={styles.hash}>{document.verifactuHash}</code>
            </dd>
          </div>
        ) : null}
        {document.verifactuQrUrl ? (
          <div className={styles.metaRow}>
            <dt>Validacion QR</dt>
            <dd>
              <a
                href={document.verifactuQrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.qrLink}
              >
                {isSandbox ? 'Ver URL de validacion QR' : 'Abrir URL QR'}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {!document.verifactuCsv && !document.verifactuHash && !document.verifactuQrUrl ? (
        <p className={styles.muted}>Sin metadatos de registro guardados.</p>
      ) : null}
    </section>
  );
}
