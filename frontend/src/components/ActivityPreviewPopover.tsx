import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import ActivityPreviewContent from '@/components/ActivityPreviewContent';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { buildActivityPreviewMeta, canViewerSignActivityHours } from '@/lib/activityPreview';
import {
  activityHasLinkedDeliveryNote,
  canAssociateActivityDeliveryNote,
} from '@/lib/activityDocumentModalOptions';
import { authService } from '@/api';
import { useActivityModal } from '@/context/ActivityModalContext';
import styles from './ActivityPreviewPopover.module.css';

type ActivityPreviewPopoverProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  event: CalendarEvent;
  activity: Activity | undefined;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  onAssociateDocument?: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function updatePopoverPosition(anchorEl: HTMLElement, popoverEl: HTMLDivElement) {
  const padding = 8;
  const gap = 6;
  const anchorRect = anchorEl.getBoundingClientRect();
  const { width, height } = popoverEl.getBoundingClientRect();

  let left = anchorRect.right + gap;
  let top = anchorRect.top;

  if (left + width > window.innerWidth - padding) {
    left = anchorRect.left - width - gap;
  }
  if (left < padding) {
    left = Math.max(padding, anchorRect.left);
  }
  if (top + height > window.innerHeight - padding) {
    top = Math.max(padding, window.innerHeight - height - padding);
  }
  if (top < padding) {
    top = padding;
  }

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
}

export default function ActivityPreviewPopover({
  anchorEl,
  open,
  event,
  activity,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  onAssociateDocument,
  onMouseEnter,
  onMouseLeave,
}: ActivityPreviewPopoverProps) {
  const { openEditByActivity } = useActivityModal();
  const { boundaries } = useWorkspaceScheduleSettings();
  const { workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const currentUser = authService.getCurrentUser();
  const viewerUserId = currentUser?.id;
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  const canSignHours =
    workerSignaturesEnabled &&
    canViewerSignActivityHours(activity, event, viewerUserId, boundaries);

  const handleSignHours = useCallback(() => {
    if (!activity) return;
    openEditByActivity(activity, events, { editMode: true });
  }, [activity, events, openEditByActivity]);

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

  const linkedDocuments = activity ? (documentsByActivity.get(activity.id) ?? []) : [];
  const showAssociateDocument = Boolean(
    activity &&
      currentUser &&
      canAssociateActivityDeliveryNote(currentUser, activity, linkedDocuments, event),
  );
  const associateDocumentLabel =
    linkedDocuments.length > 0 && !activityHasLinkedDeliveryNote(linkedDocuments)
      ? 'Crear albarán'
      : 'Asociar documento';

  const reposition = useCallback(() => {
    if (!anchorEl || !popoverRef.current) return;
    updatePopoverPosition(anchorEl, popoverRef.current);
  }, [anchorEl]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    reposition();
    const frameId = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(frameId);
  }, [open, anchorEl, reposition, meta]);

  useEffect(() => {
    if (!open) return;

    const handleScroll = () => reposition();
    const handleResize = () => reposition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, reposition]);

  if (!mounted || !open || !anchorEl || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className={styles.popover}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ActivityPreviewContent
        meta={meta}
        activityTypes={activityTypes}
        clientsMap={clientsMap}
        onAssociateDocument={onAssociateDocument}
        showAssociateDocument={showAssociateDocument}
        associateDocumentLabel={associateDocumentLabel}
        canSignHours={canSignHours}
        onSignHours={activity ? handleSignHours : undefined}
      />
    </div>,
    document.body,
  );
}
