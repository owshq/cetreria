import { useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  activityUsesWorkReport,
} from '@shared/types';
import ActivityPreviewContent from '@/components/ActivityPreviewContent';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import {
  buildActivityPreviewMeta,
  canViewerOpenWorkReportPreview,
  canViewerSignActivityHours,
} from '@/lib/activityPreview';
import { authService } from '@/api';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './CalendarDayEventCard.module.css';

type CalendarDayEventCardProps = {
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  typeColor: string;
  past?: boolean;
  onOpen: () => void;
};

export default function CalendarDayEventCard({
  event,
  activity,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  typeColor,
  past = false,
  onOpen,
}: CalendarDayEventCardProps) {
  const { openEditByActivity } = useActivityModal();
  const { boundaries } = useWorkspaceScheduleSettings();
  const viewerUserId = authService.getCurrentUser()?.id;

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

  const activityUsesWorkReportFlow = activity
    ? activityUsesWorkReport(activity, activityTypes)
    : false;
  const canSignHours =
    !activityUsesWorkReportFlow &&
    canViewerSignActivityHours(activity, event, viewerUserId, boundaries);

  const currentUser = authService.getCurrentUser();
  const linkedDocuments = activity ? (documentsByActivity.get(activity.id) ?? []) : [];
  const showWorkReportAction = canViewerOpenWorkReportPreview(
    activity,
    event,
    currentUser,
    activityTypes,
    linkedDocuments,
  );

  const handleOpenWorkReport = useCallback(() => {
    if (!activity) return;
    openEditByActivity(activity, events, { focusSection: 'workReport' });
  }, [activity, events, openEditByActivity]);

  const handleSignHours = useCallback(() => {
    if (!activity) return;
    openEditByActivity(activity, events, { editMode: true });
  }, [activity, events, openEditByActivity]);

  const handleKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>) => {
    if (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ') return;
    keyboardEvent.preventDefault();
    keyboardEvent.stopPropagation();
    onOpen();
  };

  const handleCardClick = (mouseEvent: MouseEvent<HTMLDivElement>) => {
    const nestedInteractive =
      mouseEvent.target instanceof Element
        ? mouseEvent.target.closest('button, [role="button"]')
        : null;
    if (nestedInteractive && nestedInteractive !== mouseEvent.currentTarget) {
      return;
    }
    mouseEvent.stopPropagation();
    onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cx(styles.card, past && ui.pastActivity)}
      style={{ '--type-color': typeColor } as React.CSSProperties}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      <ActivityPreviewContent
        meta={meta}
        activityTypes={activityTypes}
        variant="day"
        clientsMap={clientsMap}
        onOpenWorkReport={handleOpenWorkReport}
        showWorkReportAction={showWorkReportAction}
        workReportActionLabel="Informe de trabajo"
        canSignHours={canSignHours}
        onSignHours={activity ? handleSignHours : undefined}
      />
    </div>
  );
}
