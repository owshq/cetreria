import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  ShiftCode,
  UserAssignee,
  UserDayActivityEntry,
  WorkspaceScheduleShiftBoundaries,
} from '@shared/types';
import { SHIFT_META, findEventForActivity } from '@shared/types';
import ActivityPreviewContent from '@/components/ActivityPreviewContent';
import { authService } from '@/api';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import {
  buildActivityPreviewMeta,
  canViewerSignActivityHours,
} from '@/lib/activityPreview';
import { getShiftPaletteColor } from '@/lib/shiftColorPalette';
import { cx } from '@/lib/cx';
import editorStyles from '@/components/UserScheduleEditor.module.css';
import styles from './ScheduleDayActivitiesPopover.module.css';

function EntryShiftBadge({ shift }: { shift: ShiftCode }) {
  const shiftColors = useShiftColorPalette();
  const meta = SHIFT_META[shift];
  return (
    <span
      className={editorStyles.monthDayBadge}
      style={{ backgroundColor: getShiftPaletteColor(shift, shiftColors) }}
      title={meta.tooltip}
      aria-hidden
    >
      {meta.shortLabel}
    </span>
  );
}

export type ScheduleDayPreviewContext = {
  events: CalendarEvent[];
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  boundaries: WorkspaceScheduleShiftBoundaries;
};

type ScheduleDayActivitiesPopoverProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  day: Date;
  entries: UserDayActivityEntry[];
  preview?: ScheduleDayPreviewContext | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

function updatePopoverPosition(anchorEl: HTMLElement, popoverEl: HTMLDivElement) {
  const padding = 8;
  const gap = 6;
  const anchorRect = anchorEl.getBoundingClientRect();
  const { width, height } = popoverEl.getBoundingClientRect();

  let left = anchorRect.left + anchorRect.width / 2 - width / 2;
  let top = anchorRect.bottom + gap;

  if (left + width > window.innerWidth - padding) {
    left = window.innerWidth - width - padding;
  }
  if (left < padding) {
    left = padding;
  }
  if (top + height > window.innerHeight - padding) {
    top = anchorRect.top - height - gap;
  }
  if (top < padding) {
    top = padding;
  }

  popoverEl.style.left = `${left}px`;
  popoverEl.style.top = `${top}px`;
}

function ScheduleDayActivityPreviewItem({
  entry,
  preview,
}: {
  entry: UserDayActivityEntry;
  preview: ScheduleDayPreviewContext;
}) {
  const { openEditByActivity } = useActivityModal();
  const viewerUserId = authService.getCurrentUser()?.id;
  const event = findEventForActivity(entry.activity, preview.events);

  if (!event) return null;

  const meta = buildActivityPreviewMeta({
    event,
    activity: entry.activity,
    clientsMap: preview.clientsMap,
    activityTypes: preview.activityTypes,
    documentsByActivity: preview.documentsByActivity,
    assigneesById: preview.assigneesById,
    events: preview.events,
    boundaries: preview.boundaries,
  });

  const canSignHours = canViewerSignActivityHours(
    entry.activity,
    event,
    viewerUserId,
    preview.boundaries,
  );

  return (
    <ActivityPreviewContent
      meta={meta}
      activityTypes={preview.activityTypes}
      clientsMap={preview.clientsMap}
      variant="day"
      canSignHours={canSignHours}
      onSignHours={() => openEditByActivity(entry.activity, preview.events, { editMode: true })}
    />
  );
}

export default function ScheduleDayActivitiesPopover({
  anchorEl,
  open,
  day,
  entries,
  preview,
  onMouseEnter,
  onMouseLeave,
}: ScheduleDayActivitiesPopoverProps) {
  const { shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const hasRichPreview = preview != null;

  const reposition = useCallback(() => {
    if (!anchorEl || !popoverRef.current) return;
    updatePopoverPosition(anchorEl, popoverRef.current);
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    reposition();
    const frameId = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(frameId);
  }, [open, anchorEl, entries, reposition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => reposition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, reposition]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open || !anchorEl || entries.length === 0) return null;

  const dayLabel = format(day, 'EEEE d MMMM', { locale: es });
  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);

  return createPortal(
    <div
      ref={popoverRef}
      className={cx(styles.popover, hasRichPreview && styles.popoverRich)}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className={styles.title}>
        {dayLabel} · {totalHours} h
      </p>
      {hasRichPreview ? (
        <div className={styles.previewList}>
          {entries.map((entry, index) => {
            const key = `${entry.activity.id}-${entry.shift}-${entry.startTime}-${entry.endTime}-${index}`;
            return (
              <div key={key} className={styles.previewItem}>
                <ScheduleDayActivityPreviewItem entry={entry} preview={preview} />
              </div>
            );
          })}
        </div>
      ) : (
        <ul className={styles.list}>
          {entries.map((entry, index) => {
            const description = entry.activity.description.trim() || 'Sin descripción';
            const key = `${entry.activity.id}-${entry.shift}-${entry.startTime}-${entry.endTime}-${index}`;
            return (
              <li key={key} className={styles.item}>
                <div className={styles.itemHead}>
                  {shiftSchedulingEnabled ? <EntryShiftBadge shift={entry.shift} /> : null}
                  <span className={styles.itemTime}>
                    {entry.startTime}–{entry.endTime}
                  </span>
                  <span className={styles.itemHours}>{entry.hours} h</span>
                </div>
                <p className={styles.itemDescription}>{description}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body,
  );
}
