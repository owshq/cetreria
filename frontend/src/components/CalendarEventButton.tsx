import { useRef, type MouseEvent, type ReactNode } from 'react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import ActivityPreviewPopover from '@/components/ActivityPreviewPopover';
import { useActivityPreviewHover } from '@/hooks/useActivityPreviewHover';

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {
    previewOpen,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
  } = useActivityPreviewHover();

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
    </>
  );
}
