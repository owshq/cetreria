import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ActivityType, CalendarEvent, Client, Document, UserAssignee } from '@shared/types';
import { isActivityPast } from '@shared/types';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import { SearchField } from '@/components/forms';
import ActivitiesSidebarNavItem from '@/components/ActivitiesSidebarNavItem';
import { findEventForActivity, isPastActivity } from '@/lib/activityUtils';
import { buildActivityPreviewMeta } from '@/lib/activityPreview';
import {
  matchesActivityAssociationGapSearch,
  type ActivityAssociationGapBannerContent,
  type ActivityAssociationGapItem,
} from '@/lib/activityAssociationGaps';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import styles from './ActivityAssociationGapBanner.module.css';

const GAP_LIST_BATCH_SIZE = 10;

type ActivityAssociationGapBannerProps = {
  content: ActivityAssociationGapBannerContent;
  items: ActivityAssociationGapItem[];
  events: CalendarEvent[];
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  placement?: 'content' | 'sidebar';
  /** Mantiene el resumen visible al hacer scroll (vista mes en móvil). */
  pinSummary?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export default function ActivityAssociationGapBanner({
  content,
  items,
  events,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  placement = 'content',
  pinSummary = false,
  onExpandedChange,
}: ActivityAssociationGapBannerProps) {
  const { boundaries } = useWorkspaceScheduleSettings();
  const { openEditByActivity } = useActivityModal();
  const [expanded, setExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const isSidebarExpanded = placement === 'sidebar' && expanded;

  useEffect(() => {
    setExpanded(false);
    setSearchTerm('');
    onExpandedChange?.(false);
  }, [content.rangeLabel, items.length, onExpandedChange]);

  const toggleExpanded = () => {
    setExpanded((open) => {
      const next = !open;
      onExpandedChange?.(next);
      return next;
    });
  };

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const event = findEventForActivity(item.activity, events);
        return matchesActivityAssociationGapSearch(
          item,
          searchTerm,
          event,
          clientsMap,
          activityTypes,
        );
      }),
    [items, searchTerm, events, clientsMap, activityTypes],
  );

  const {
    visibleItems,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(
    filteredItems,
    [searchTerm, filteredItems.length, content.rangeLabel],
    GAP_LIST_BATCH_SIZE,
    listRef,
  );

  const handleOpenActivity = (item: ActivityAssociationGapItem) => {
    const focusSection = item.lacksUsers
      ? ('assignees' as const)
      : item.lacksWorkReport || item.actionableFocusWorkReport
        ? ('workReport' as const)
        : item.lacksInvoice || item.lacksDeliveryNote
          ? ('documents' as const)
          : item.lacksSignature
            ? ('assignees' as const)
            : undefined;

    openEditByActivity(item.activity, events, {
      editMode: focusSection === 'assignees' || item.lacksInvoice,
      ...(focusSection ? { focusSection } : {}),
    });
  };

  return (
    <section
      className={cx(
        styles.wrap,
        placement === 'sidebar' && styles.wrapSidebar,
        isSidebarExpanded && styles.wrapSidebarExpanded,
        pinSummary && styles.wrapPinned,
      )}
      aria-label="Actividades con datos incompletos"
    >
      <div className={styles.summary}>
        <p className={styles.message} role="status">
          En el periodo <strong>{content.rangeLabel}</strong>: {content.text}
        </p>
        <button
          type="button"
          className={styles.toggleBtn}
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
          {expanded ? (
            <>
              Ver menos
              <ChevronUp size={14} aria-hidden />
            </>
          ) : (
            <>
              Ver más
              <ChevronDown size={14} aria-hidden />
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <div className={styles.panel}>
          <SearchField
            wrapperClassName={styles.searchField}
            placeholder="Buscar actividades"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            aria-label="Buscar actividades con datos incompletos"
          />

          <div ref={listRef} className={styles.list} {...scrollRegionProps}>
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => {
                const event = findEventForActivity(item.activity, events);
                if (!event) return null;

                const activity = item.activity;
                const past = isPastActivity(activity, events) || isActivityPast({ event });
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

                return (
                  <ActivitiesSidebarNavItem
                    key={item.activity.id}
                    event={event}
                    activity={activity}
                    meta={meta}
                    activityTypes={activityTypes}
                    clientsMap={clientsMap}
                    documentsByActivity={documentsByActivity}
                    assigneesById={assigneesById}
                    events={events}
                    isActive={false}
                    past={past}
                    onSelect={() => handleOpenActivity(item)}
                  />
                );
              })
            ) : (
              <p className={styles.empty}>
                {searchTerm.trim()
                  ? 'No hay actividades que coincidan con la búsqueda.'
                  : 'No hay actividades con datos incompletos en este periodo.'}
              </p>
            )}

            <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
