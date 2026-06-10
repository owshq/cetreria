import { useMemo, useState, useEffect } from 'react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import { isActivityPast } from '@shared/types';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { isPastActivity } from '@/lib/activityUtils';
import { buildActivityPreviewMeta, matchesActivityPreviewSearch } from '@/lib/activityPreview';
import { scrollRegionProps } from '@/lib/scrollRegion';
import EmptyState from '@/components/EmptyState';
import ActivitiesSidebarNavItem from '@/components/ActivitiesSidebarNavItem';
import { SearchField } from '@/components/forms';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import styles from './ActivitiesSidebarNav.module.css';

export type ActivitiesSidebarItem = {
  event: CalendarEvent;
  activity: Activity | undefined;
};

type ActivitiesSidebarNavProps = {
  items: ActivitiesSidebarItem[];
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  onSelect: (item: ActivitiesSidebarItem) => void;
  activeEventId?: string | null;
  activeActivityId?: string | null;
  emptyDescription: string;
  searchEmptyDescription?: string;
  /** Oculta el buscador lateral cuando la búsqueda vive en la barra principal. */
  hideSearchField?: boolean;
  /** Término de búsqueda de la barra principal (solo con `hideSearchField`). */
  toolbarSearchTerm?: string;
  loading?: boolean;
};

export default function ActivitiesSidebarNav({
  items,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  onSelect,
  activeEventId = null,
  activeActivityId = null,
  emptyDescription,
  searchEmptyDescription = 'No hay actividades que coincidan con la búsqueda.',
  hideSearchField = false,
  toolbarSearchTerm = '',
  loading = false,
}: ActivitiesSidebarNavProps) {
  const { boundaries } = useWorkspaceScheduleSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearchTerm = hideSearchField ? toolbarSearchTerm : searchTerm;
  const canSearch = items.length > 0;

  useEffect(() => {
    if (canSearch) return;
    setSearchTerm('');
  }, [canSearch]);

  const visibleItems = useMemo(() => {
    if (hideSearchField) return items;

    return items.filter(({ event, activity }) =>
      matchesActivityPreviewSearch(
        { event, activity, clientsMap, activityTypes },
        searchTerm,
      ),
    );
  }, [items, searchTerm, clientsMap, activityTypes, hideSearchField]);

  return (
    <section className={styles.wrap} aria-label="Actividades del periodo">
      {canSearch && !hideSearchField ? (
        <div className={styles.search}>
          <SearchField
            wrapperClassName={styles.searchField}
            placeholder="Buscar"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      ) : null}

      <div className={styles.list} {...scrollRegionProps} aria-busy={loading || undefined}>
        {loading ? (
          <div className={styles.empty}>
            <p className={styles.loadingText}>Cargando...</p>
          </div>
        ) : visibleItems.length > 0 ? (
          visibleItems.map(({ event, activity }) => {
            const past = activity
              ? isPastActivity(activity, events)
              : isActivityPast({ event });
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
            const isActive =
              (activeEventId != null && event.id === activeEventId) ||
              (activeActivityId != null &&
                activity?.id != null &&
                activity.id === activeActivityId);

            return (
              <ActivitiesSidebarNavItem
                key={event.id}
                event={event}
                activity={activity}
                meta={meta}
                activityTypes={activityTypes}
                clientsMap={clientsMap}
                documentsByActivity={documentsByActivity}
                assigneesById={assigneesById}
                events={events}
                isActive={isActive}
                past={past}
                onSelect={() => onSelect({ event, activity })}
              />
            );
          })
        ) : (
          <div className={styles.empty}>
            <EmptyState
              emoji={ACTIVITY_EMOJI}
              compact
              description={
                activeSearchTerm.trim() ? searchEmptyDescription : emptyDescription
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}
