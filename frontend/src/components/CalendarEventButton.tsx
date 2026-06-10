import { useCallback, useRef, type MouseEvent, type ReactNode } from 'react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import ActivityPreviewPopover from '@/components/ActivityPreviewPopover';
import { authService } from '@/api';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityPreviewHover } from '@/hooks/useActivityPreviewHover';
import { buildActivityDocumentsModalOptions } from '@/lib/activityDocumentModalOptions';

type CalendarEventButtonProps = {
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  className?: string;
  style?: React.CSSProperties;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

export default function CalendarEventButton({
  event,
  activity,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  className,
  style,
  onClick,
  children,
}: CalendarEventButtonProps) {
  const { openEdit, openEditByActivity } = useActivityModal();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {
    previewOpen,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
    closePreview,
  } = useActivityPreviewHover();

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
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </button>

      <ActivityPreviewPopover
        anchorEl={buttonRef.current}
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
    </>
  );
}
