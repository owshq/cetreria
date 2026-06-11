import { useCallback, useEffect, useMemo, useState } from 'react';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity, CalendarEvent, Client, Document } from '@shared/types';
import {
  formatActivityRelativeTime,
  getActivityTypeLabel,
  normalizeActivityAssigneeSlots,
} from '@shared/types';
import { activitiesService, documentsService, eventsService } from '@/api';
import ActivityLinkedDocuments from '@/components/ActivityLinkedDocuments';
import ActivityTypeBadge from '@/components/ActivityTypeBadge';
import badgeStyles from '@/components/ActivityTypeBadge.module.css';
import ContentLoading from '@/components/ContentLoading';
import EmptyState from '@/components/EmptyState';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { activityMatchesTeamUser } from '@/lib/activitiesTeamScope';
import { formatActivityHourRange } from '@/lib/activityPreview';
import { findEventForActivity, isPastActivity } from '@/lib/activityUtils';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import { buildDocumentsByActivity } from '@/lib/documentsByActivity';
import { toScheduleDateKey } from '@/lib/schedulePeriod';
import { META_SEPARATOR } from '@/lib/textSeparators';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import recentStyles from '@/components/RecentActivitiesSection.module.css';
import styles from './UserActivitiesPanel.module.css';

type UserActivitiesPanelProps = {
  userId: string;
  userName?: string;
  currentDate: Date;
};

export default function UserActivitiesPanel({
  userId,
  userName,
  currentDate,
}: UserActivitiesPanelProps) {
  const { openEditByActivity } = useActivityModal();
  const { activityTypes } = useActivityTypes();
  const { boundaries } = useWorkspaceScheduleSettings();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return {
      from: toScheduleDateKey(start),
      to: toScheduleDateKey(end),
    };
  }, [currentDate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      activitiesService.getAll({ from: range.from, to: range.to }),
      eventsService.getAll(),
      documentsService.getBootstrap(),
    ])
      .then(([activitiesResult, eventsResult, bootstrap]) => {
        if (cancelled) return;
        setActivities(activitiesResult);
        setEvents(eventsResult);
        setClients(bootstrap.clients);
        setDocuments(bootstrap.documents);
      })
      .catch((err) => {
        if (cancelled) return;
        setActivities([]);
        setEvents([]);
        setClients([]);
        setDocuments([]);
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las actividades.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const clientsMap = useMemo(
    () => new Map(clients.map((client) => [client.id, client])),
    [clients],
  );

  const documentsByActivity = useMemo(
    () => buildDocumentsByActivity(documents),
    [documents],
  );

  const userActivities = useMemo(() => {
    const teamAssigneeIds = new Set<string>();
    return activities
      .filter((activity) =>
        activityMatchesTeamUser(activity, events, userId, teamAssigneeIds),
      )
      .sort((left, right) => {
        if (left.date !== right.date) return right.date.localeCompare(left.date);
        return right.id.localeCompare(left.id);
      });
  }, [activities, events, userId]);

  const handleOpenActivity = useCallback(
    (activity: Activity) => {
      openEditByActivity(activity, events);
    },
    [openEditByActivity, events],
  );

  if (loading) {
    return <ContentLoading className={styles.loading} />;
  }

  if (error) {
    return <p className={cx(ui.alertError, styles.error)}>{error}</p>;
  }

  if (userActivities.length === 0) {
    return (
      <EmptyState
        emoji={ACTIVITY_EMOJI}
        description={
          userName
            ? `${userName} no tiene actividades asignadas este mes.`
            : 'No hay actividades asignadas este mes.'
        }
        compact
      />
    );
  }

  return (
    <section
      className={styles.wrap}
      aria-label={userName ? `Actividades de ${userName}` : 'Actividades asignadas'}
    >
      <p className={styles.meta}>
        {userActivities.length}{' '}
        {userActivities.length === 1 ? 'actividad' : 'actividades'} en{' '}
        {format(currentDate, 'MMMM yyyy', { locale: es })}
      </p>
      <div className={ui.listPanel}>
        {userActivities.map((activity) => {
          const client = clientsMap.get(activity.clientId);
          const event = findEventForActivity(activity, events);
          const past = isPastActivity(activity, events);
          const relativeTime = formatActivityRelativeTime({ activity, event });
          const hoursLabel =
            activity.hours != null && activity.hours > 0
              ? `${activity.hours} ${activity.hours === 1 ? 'hora' : 'horas'}`
              : null;
          const dateLabel = format(parseISO(activity.date), 'd MMM', { locale: es });
          const assigneeSlots = normalizeActivityAssigneeSlots(activity, event ?? null, boundaries);
          const hourRangeLabel = formatActivityHourRange(assigneeSlots, event);
          const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
          const asidePrimary = relativeTime ?? dateLabel;
          const asideSecondary = (
            relativeTime ? [dateLabel, hourRangeLabel, hoursLabel] : [hourRangeLabel, hoursLabel]
          )
            .filter(Boolean)
            .join(META_SEPARATOR) || null;

          return (
            <div
              key={activity.id}
              role="button"
              tabIndex={0}
              className={cx(ui.listPanelItem, past && ui.pastActivity)}
              onClick={() => handleOpenActivity(activity)}
              onKeyDown={(keydownEvent) => {
                if (keydownEvent.key !== 'Enter' && keydownEvent.key !== ' ') return;
                keydownEvent.preventDefault();
                handleOpenActivity(activity);
              }}
            >
              <div className={ui.listPanelItemBody}>
                <p className={ui.listPanelItemTitle}>{client?.name || 'Contacto desconocido'}</p>
                <div className={recentStyles.typeDescriptionRow}>
                  <ActivityTypeBadge
                    typeRef={activity.type}
                    activityTypes={activityTypes}
                    className={badgeStyles.badgeInRow}
                    hideEmoji
                  />
                  <p className={recentStyles.descriptionInRow}>
                    {activity.description || typeLabel}
                  </p>
                </div>
                <ActivityLinkedDocuments
                  documents={documentsByActivity.get(activity.id) ?? []}
                  clientsMap={clientsMap}
                />
              </div>
              <div className={ui.listPanelAside}>
                <p className={ui.listPanelAsidePrimary}>{asidePrimary}</p>
                {asideSecondary ? (
                  <p className={ui.listPanelAsideSecondary}>{asideSecondary}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
