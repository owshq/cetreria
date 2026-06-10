import { useCallback, useRef } from 'react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import { resolveActivityType } from '@shared/types';
import ActivityPreviewPopover from '@/components/ActivityPreviewPopover';
import StatusDot from '@/components/StatusDot';
import { authService } from '@/api';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityPreviewHover } from '@/hooks/useActivityPreviewHover';
import { buildActivityDocumentsModalOptions } from '@/lib/activityDocumentModalOptions';
import { getActivitySidebarListLines, type ActivityPreviewMeta } from '@/lib/activityPreview';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ActivitiesSidebarNav.module.css';

type ActivitiesSidebarNavItemProps = {
  event: CalendarEvent;
  activity: Activity | undefined;
  meta: ActivityPreviewMeta;
  activityTypes: ActivityType[];
  clientsMap: Map<string, Client>;
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  isActive: boolean;
  past: boolean;
  onSelect: () => void;
};

export default function ActivitiesSidebarNavItem({
  event,
  activity,
  meta,
  activityTypes,
  clientsMap,
  documentsByActivity,
  assigneesById,
  events,
  isActive,
  past,
  onSelect,
}: ActivitiesSidebarNavItemProps) {
  const { openEdit, openEditByActivity } = useActivityModal();
  const itemRef = useRef<HTMLDivElement>(null);
  const {
    previewOpen,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
    closePreview,
  } = useActivityPreviewHover();

  const { clientName, summary, metaLine } = getActivitySidebarListLines(meta, activityTypes);
  const typeColor = meta.typeRef
    ? (resolveActivityType(meta.typeRef, activityTypes)?.color ?? '#a3a3a3')
    : null;

  const handleAssociateDocument = useCallback(() => {
    closePreview();
    if (activity) {
      openEditByActivity(
        activity,
        events,
        buildActivityDocumentsModalOptions(authService.getCurrentUser(), activity, event),
      );
      return;
    }
    openEdit(event, { editMode: true, focusSection: 'documents' });
  }, [activity, closePreview, event, events, openEdit, openEditByActivity]);

  return (
    <div
      ref={itemRef}
      className={cx(styles.item, isActive && styles.itemActive, past && ui.pastActivity)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={styles.itemMain}
        onClick={onSelect}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`Ver actividad de ${clientName}`}
      >
        <span className={styles.compact}>
          <span className={styles.compactClientRow}>
            {typeColor ? (
              <StatusDot color={typeColor} size={6} className={styles.compactTypeDot} />
            ) : null}
            <span className={styles.compactClient}>{clientName}</span>
          </span>
          {summary ? <span className={styles.compactSummary}>{summary}</span> : null}
          {metaLine ? <span className={styles.compactMeta}>{metaLine}</span> : null}
        </span>
      </button>

      <ActivityPreviewPopover
        anchorEl={itemRef.current}
        open={previewOpen}
        event={event}
        activity={activity}
        clientsMap={clientsMap}
        activityTypes={activityTypes}
        documentsByActivity={documentsByActivity}
        assigneesById={assigneesById}
        events={events}
        onAssociateDocument={handleAssociateDocument}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
}
