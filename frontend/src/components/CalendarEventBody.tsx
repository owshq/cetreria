import { Clock } from 'lucide-react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  activityTypeUsesWorkReport,
  getActivityTypeLabel,
  resolveActivityType,
} from '@shared/types';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import {
  buildActivityPreviewMeta,
  formatActivityHourRange,
  formatActivityPreviewSignatureLabel,
  formatActivityPreviewSignatureTitle,
  formatActivityPreviewWorkReportLabel,
  formatActivityPreviewWorkReportTitle,
} from '@/lib/activityPreview';
import { cx } from '@/lib/cx';
import styles from './CalendarEventBody.module.css';

type CalendarEventBodyProps = {
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  timeClassName?: string;
};

export default function CalendarEventBody({
  event,
  activity,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  timeClassName,
}: CalendarEventBodyProps) {
  const { boundaries } = useWorkspaceScheduleSettings();
  const { workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const meta = buildActivityPreviewMeta({
    event,
    activity,
    clientsMap,
    activityTypes,
    documentsByActivity,
    assigneesById,
    events,
    boundaries,
  });
  const typeUsesWorkReport = meta.typeRef
    ? activityTypeUsesWorkReport(resolveActivityType(meta.typeRef, activityTypes))
    : false;

  const typeLabel = meta.typeRef ? getActivityTypeLabel(meta.typeRef, activityTypes) : null;
  const hourRangeLabel = formatActivityHourRange(meta.assigneeSlots, event);
  const { signatureSummary, workReportSummary } = meta;

  return (
    <>
      <div className={styles.heading}>
        <div className={styles.client}>{meta.clientName}</div>
        {typeLabel || hourRangeLabel ? (
          <div className={styles.typeRow}>
            {typeLabel ? <div className={styles.type}>{typeLabel}</div> : null}
            {hourRangeLabel ? (
              <div className={styles.hourRange} aria-label="Franja horaria">
                {hourRangeLabel}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {workerSignaturesEnabled && signatureSummary ? (
        <div className={cx(styles.time, timeClassName)}>
          <Clock size={10} aria-hidden className={styles.icon} />
          <div className={styles.timeBody}>
            <p
              className={cx(
                styles.signatures,
                signatureSummary.allSigned && styles.signaturesComplete,
              )}
              title={formatActivityPreviewSignatureTitle(signatureSummary)}
            >
              Firmas: {formatActivityPreviewSignatureLabel(signatureSummary)}
            </p>
          </div>
        </div>
      ) : null}

      {typeUsesWorkReport && workReportSummary ? (
        <div className={cx(styles.time, timeClassName)}>
          <Clock size={10} aria-hidden className={styles.icon} />
          <div className={styles.timeBody}>
            <p
              className={cx(
                styles.signatures,
                workReportSummary.status === 'submitted' && styles.signaturesComplete,
              )}
              title={formatActivityPreviewWorkReportTitle(workReportSummary)}
            >
              Informe: {formatActivityPreviewWorkReportLabel(workReportSummary)}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
