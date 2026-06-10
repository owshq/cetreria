import { PenLine } from 'lucide-react';
import { formatDashboardJobsHours } from '@/lib/dashboardJobsMatrix';
import type { WorkerHoursStatus } from '@shared/types';
import { cx } from '@/lib/cx';
import styles from './ActivityWorkerHoursStatus.module.css';

type Props = {
  status: WorkerHoursStatus;
  /** Vista compacta para celdas del calendario de turnos */
  compact?: boolean;
  /** Operario al que pertenecen las horas (para mensajes admin) */
  workerName?: string;
  /** Usuario que mira la UI */
  viewerUserId?: string;
  workerUserId: string;
  isAdmin?: boolean;
  onSignClick?: () => void;
  className?: string;
};

function formatH(hours: number): string {
  return `${formatDashboardJobsHours(hours)}h`;
}

export default function ActivityWorkerHoursStatus({
  status,
  compact = false,
  workerName,
  viewerUserId,
  workerUserId,
  isAdmin = false,
  onSignClick,
  className,
}: Props) {
  if (status.assignedHours <= 0 && status.signedHours <= 0) return null;

  const isOwnRow = viewerUserId === workerUserId;
  const showSignAction = status.canSignNow && isOwnRow && onSignClick != null;

  if (compact) {
    return (
      <div className={cx(styles.compact, className)}>
        {status.isSigned ? (
          <span className={cx(styles.badge, styles.badgeSigned)} title={`${formatH(status.signedHours)} firmadas`}>
            Firm. {formatH(status.signedHours)}
          </span>
        ) : status.awaitingSlotEnd ? (
          <span
            className={cx(styles.badge, styles.badgeScheduled)}
            title="El tramo asignado aún no ha finalizado"
          >
            En curso
          </span>
        ) : status.needsSignature ? (
          <span
            className={cx(styles.badge, styles.badgePending)}
            title={`${formatH(status.assignedHours)} asignadas sin firmar`}
          >
            {formatH(status.assignedHours)} pend.
          </span>
        ) : null}
        {showSignAction ? (
          <button type="button" className={styles.signBtn} onClick={onSignClick}>
            Firmar
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.hoursRow}>
        <span className={styles.hoursLabel}>Asignadas</span>
        <span className={styles.hoursValue}>{formatH(status.assignedHours)}</span>
      </div>
      <div className={styles.hoursRow}>
        <span className={styles.hoursLabel}>Firmadas</span>
        <span
          className={cx(
            styles.hoursValue,
            status.isSigned ? styles.hoursValueSigned : styles.hoursValuePending,
          )}
        >
          {formatH(status.signedHours)}
        </span>
      </div>
      {status.awaitingSlotEnd ? (
        <p className={styles.pendingHint}>
          {isOwnRow
            ? 'Podrás firmar cuando finalice la fecha y hora de tu tramo asignado.'
            : isAdmin && workerName
              ? `${workerName} podrá firmar cuando finalice su tramo asignado.`
              : 'Tramo aún en curso.'}
        </p>
      ) : status.needsSignature ? (
        <p className={styles.pendingHint}>
          {isAdmin && !isOwnRow && workerName
            ? `${workerName} debe registrar el tramo y guardar con firma (${formatH(status.pendingHours)} pendientes).`
            : isOwnRow
              ? `Indica las horas reales trabajadas y firma para confirmar (asignadas: ${formatH(status.assignedHours)}).`
              : `Faltan ${formatH(status.pendingHours)} por firmar.`}
        </p>
      ) : status.isSigned ? (
        <p className={styles.signedHint}>Horas confirmadas con firma.</p>
      ) : null}
      {showSignAction ? (
        <button type="button" className={styles.signBtnLarge} onClick={onSignClick}>
          <PenLine size={14} strokeWidth={2} aria-hidden />
          Firmar horas
        </button>
      ) : null}
    </div>
  );
}
