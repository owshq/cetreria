import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ChevronDown, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import { isShiftCode, normalizeActivityAssigneeSlots, SHIFT_META } from '@shared/types';
import { usersService } from '@/api';
import UserAvatar from '@/components/UserAvatar';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import { formatActivityRelativeTime, getActivityAssigneeIds } from '@shared/types';
import { getActivityTypeLabel } from '@shared/types';
import { SearchField } from '@/components/forms';
import ActivityTypeBadge from '@/components/ActivityTypeBadge';
import badgeStyles from '@/components/ActivityTypeBadge.module.css';
import EmptyState from '@/components/EmptyState';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ActivityTypeDonutChart, { ActivityChartToggles } from '@/components/ActivityTypeDonutChart';
import type { ActivityGroupBy, ActivityValueMeasure } from '@/components/clientCharts/utils';
import { hasActivityChartData } from '@/components/clientCharts/utils';
import ActivityLinkedDocuments from '@/components/ActivityLinkedDocuments';
import { buildDocumentsByActivity } from '@/lib/documentsByActivity';
import { downloadActivitiesCsv } from '@/lib/activityCsv';
import type { ActivityTableContext } from '@/lib/activityTableView';
import { formatActivityHourRange } from '@/lib/activityPreview';
import { findEventForActivity, isPastActivity } from '@/lib/activityUtils';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import { useActivityModal } from '@/context/ActivityModalContext';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './RecentActivitiesSection.module.css';

const RECENT_ACTIVITIES_BATCH_SIZE = 15;

type Props = {
  activities: Activity[];
  events: CalendarEvent[];
  clients: Client[];
  documents: Document[];
  activityTypes: ActivityType[];
  from: string;
  to: string;
  invalidCustomRange?: boolean;
  plainSectionHeader?: boolean;
  cardClassName?: string;
  cardBodyClassName?: string;
  emptyStateClassName?: string;
  collapsibleDonutChart?: boolean;
  donutChartExpanded?: boolean;
  onDonutChartToggle?: () => void;
  donutChartGroupBy?: ActivityGroupBy;
  donutChartValueMeasure?: ActivityValueMeasure;
  onDonutChartGroupByChange?: (groupBy: ActivityGroupBy) => void;
  onDonutChartValueMeasureChange?: (valueMeasure: ActivityValueMeasure) => void;
};

export default function RecentActivitiesSection({
  activities,
  events,
  clients,
  documents,
  activityTypes,
  from,
  to,
  invalidCustomRange = false,
  plainSectionHeader = false,
  cardClassName,
  cardBodyClassName,
  emptyStateClassName,
  collapsibleDonutChart = false,
  donutChartExpanded = false,
  onDonutChartToggle,
  donutChartGroupBy = 'type',
  donutChartValueMeasure = 'hours',
  onDonutChartGroupByChange,
  onDonutChartValueMeasureChange,
}: Props) {
  const { openEditByActivity } = useActivityModal();
  const { boundaries } = useWorkspaceScheduleSettings();
  const { shiftSchedulingEnabled, workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const [activitySearchTerm, setActivitySearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void usersService.getAssignees().then((users) => {
      if (!cancelled) setAssignees(users);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const assigneesById = useMemo(
    () => new Map(assignees.map((user) => [user.id, user])),
    [assignees],
  );

  const documentsByActivity = useMemo(
    () => buildDocumentsByActivity(documents),
    [documents],
  );

  const tableCtx = useMemo<ActivityTableContext>(
    () => ({
      clientsMap,
      assigneesMap: assigneesById,
      activityTypes,
      events,
      documentsByActivityId: documentsByActivity,
      boundaries,
      shiftSchedulingEnabled,
      workerSignaturesEnabled,
    }),
    [
      clientsMap,
      assigneesById,
      activityTypes,
      events,
      documentsByActivity,
      boundaries,
      shiftSchedulingEnabled,
      workerSignaturesEnabled,
    ],
  );

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [activities],
  );

  const filteredActivities = useMemo(() => {
    const term = activitySearchTerm.toLowerCase().trim();
    if (!term) return sortedActivities;

    const tokens = term.split(/\s+/).filter(Boolean);
    return sortedActivities.filter((activity) => {
      const clientName = clientsMap.get(activity.clientId)?.name ?? '';
      const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
      const haystack = `${clientName} ${typeLabel} ${activity.description}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [sortedActivities, activitySearchTerm, clientsMap, activityTypes]);

  const {
    visibleItems: visibleActivities,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList(
    filteredActivities,
    [activitySearchTerm, activities, clients, documents, activityTypes],
    RECENT_ACTIVITIES_BATCH_SIZE,
  );

  const hasActivityData = sortedActivities.length > 0;
  const canSearch = hasActivityData && !invalidCustomRange;
  const canDownload = hasActivityData && !invalidCustomRange;
  const showSearchField = canSearch && searchOpen;

  const hasActivityDonutData =
    !invalidCustomRange &&
    (hasActivityChartData(
      'type',
      'hours',
      activities,
      events,
      assignees,
      documents,
      activityTypes,
      from,
      to,
    ) ||
      hasActivityChartData(
        'type',
        'income',
        activities,
        events,
        assignees,
        documents,
        activityTypes,
        from,
        to,
      ) ||
      hasActivityChartData(
        'team',
        'hours',
        activities,
        events,
        assignees,
        documents,
        activityTypes,
        from,
        to,
      ) ||
      hasActivityChartData(
        'team',
        'income',
        activities,
        events,
        assignees,
        documents,
        activityTypes,
        from,
        to,
      ));

  const showActivityDonutChart =
    hasActivityDonutData && (!collapsibleDonutChart || donutChartExpanded);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (canSearch) return;
    setSearchOpen(false);
    setActivitySearchTerm('');
  }, [canSearch]);

  const isDesktop = useMediaQuery('(min-width: 768px)');

  const handleOpenActivity = useCallback(
    (activity: Activity) => {
      openEditByActivity(activity, events, { navigate: false });
    },
    [openEditByActivity, events],
  );

  const handleDownloadCsv = useCallback(() => {
    if (!canDownload) return;
    const filename = `actividades-${from}_${to}.csv`;
    downloadActivitiesCsv(filteredActivities, tableCtx, filename);
  }, [canDownload, filteredActivities, from, tableCtx, to]);

  const showChartToggles =
    (onDonutChartGroupByChange != null || onDonutChartValueMeasureChange != null) &&
    showActivityDonutChart;

  const chartToggles = showChartToggles ? (
    isDesktop ? (
      <ActivityChartToggles
        groupBy={donutChartGroupBy}
        valueMeasure={donutChartValueMeasure}
        onGroupByChange={onDonutChartGroupByChange ?? (() => {})}
        onValueMeasureChange={onDonutChartValueMeasureChange ?? (() => {})}
        className={styles.headerChartToggles}
      />
    ) : (
      <div className={styles.chartControlsBelow} {...scrollRegionProps}>
        <ActivityChartToggles
          groupBy={donutChartGroupBy}
          valueMeasure={donutChartValueMeasure}
          onGroupByChange={onDonutChartGroupByChange ?? (() => {})}
          onValueMeasureChange={onDonutChartValueMeasureChange ?? (() => {})}
        />
      </div>
    )
  ) : null;

  const downloadToggle = canDownload ? (
    <button
      type="button"
      className={styles.sectionDownloadBtn}
      aria-label="Descargar actividades"
      title="Descargar CSV"
      onClick={handleDownloadCsv}
    >
      <ArrowDownToLine size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  const searchToggle = canSearch ? (
    <button
      type="button"
      className={styles.searchToggleBtn}
      aria-label={searchOpen ? 'Ocultar búsqueda' : 'Buscar actividades'}
      aria-expanded={searchOpen}
      onClick={() => setSearchOpen((open) => !open)}
    >
      <Search size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  const searchField = showSearchField ? (
    <div className={cx(ui.listPanelToolbar, styles.sectionSearch)}>
      <div className={ui.filtersRow}>
        <SearchField
          ref={searchInputRef}
          wrapperClassName={ui.searchWrapper}
          placeholder="Buscar"
          value={activitySearchTerm}
          onChange={(e) => setActivitySearchTerm(e.target.value)}
        />
      </div>
    </div>
  ) : null;

  const bodyContent = (
    <>
      {invalidCustomRange ? (
        <p className={cx(ui.alertError, emptyStateClassName)}>
          La fecha de inicio debe ser anterior o igual a la de fin.
        </p>
      ) : (
        <>
          {showActivityDonutChart && (
            <div id={collapsibleDonutChart ? 'dashboard-activities-chart-panel' : undefined}>
              <ActivityTypeDonutChart
                activities={activities}
                events={events}
                assignees={assignees}
                documents={documents}
                activityTypes={activityTypes}
                from={from}
                to={to}
                groupBy={donutChartGroupBy}
                valueMeasure={donutChartValueMeasure}
              />
              {!isDesktop && chartToggles}
            </div>
          )}
          {visibleActivities.length > 0 ? (
        <div className={ui.listPanel}>
          {visibleActivities.map((activity) => {
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
            const asidePrimary = relativeTime ?? dateLabel;
            const asideSecondary = (
              relativeTime
                ? [dateLabel, hourRangeLabel, hoursLabel]
                : [hourRangeLabel, hoursLabel]
            )
              .filter(Boolean)
              .join(' · ') || null;
            const assignedUsers = getActivityAssigneeIds(activity, event)
              .map((userId) => assigneesById.get(userId))
              .filter((user): user is UserAssignee => user != null);
            return (
              <div
                key={activity.id}
                role="button"
                tabIndex={0}
                className={cx(ui.listPanelItem, past && ui.pastActivity)}
                onClick={() => handleOpenActivity(activity)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  handleOpenActivity(activity);
                }}
              >
                {assignedUsers.length > 0 ? (
                  <div
                    className={styles.assigneeAvatars}
                    aria-label={`Asignado a ${assignedUsers.map((user) => user.name).join(', ')}`}
                  >
                    {assignedUsers.map((user) => {
                      const slot = assigneeSlots.find((item) => item.userId === user.id);
                      const shift = slot?.shift;
                      return (
                        <div key={user.id} className={styles.assigneeAvatarWrap}>
                          <UserAvatar
                            user={user}
                            size="sm"
                            className={styles.assigneeAvatar}
                          />
                          {shiftSchedulingEnabled && shift && isShiftCode(shift) ? (
                            <ShiftStateBadge
                              shift={shift}
                              compact
                              className={styles.assigneeShiftMark}
                              title={`${user.name}: ${SHIFT_META[shift].label}`}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className={ui.listPanelItemBody}>
                  <p className={ui.listPanelItemTitle}>
                    {client?.name || 'Contacto desconocido'}
                  </p>
                  <div className={styles.typeDescriptionRow}>
                    <ActivityTypeBadge
                      typeRef={activity.type}
                      activityTypes={activityTypes}
                      className={badgeStyles.badgeInRow}
                      hideEmoji
                    />
                    <p className={styles.descriptionInRow}>{activity.description}</p>
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
          <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
        </div>
      ) : (
        <div className={cx(styles.emptyStateCardBody, emptyStateClassName)}>
          <EmptyState
            emoji={ACTIVITY_EMOJI}
            description={
              activitySearchTerm.trim()
                ? 'No hay actividades que coincidan con la búsqueda.'
                : 'Añade actividades en el periodo seleccionado.'
            }
            compact
          />
        </div>
      )}
        </>
      )}
    </>
  );

  return (
    <>
      <div className={plainSectionHeader ? ui.pageSectionTitleRow : ui.pageSectionHeading}>
        <h2 className={ui.pageSectionTitle}>Actividades</h2>
        <div className={styles.sectionTitleActions}>
          {isDesktop ? chartToggles : null}
          {downloadToggle}
          {searchToggle}
        </div>
      </div>
      {searchField}
      <div
        className={cx(
          ui.card,
          cardClassName,
          styles.cardShell,
          collapsibleDonutChart &&
            hasActivityDonutData &&
            onDonutChartToggle &&
            styles.cardShellCollapsible,
        )}
      >
        <div
          className={cx(styles.cardBody, ui.listPanelShell, cardBodyClassName)}
          {...scrollRegionProps}
        >
          {bodyContent}
        </div>
        {collapsibleDonutChart && hasActivityDonutData && onDonutChartToggle ? (
          <div className={styles.chartToggleRow}>
            <button
              type="button"
              className={styles.chartToggleBtn}
              onClick={onDonutChartToggle}
              aria-expanded={donutChartExpanded}
              aria-controls="dashboard-activities-chart-panel"
              aria-label={donutChartExpanded ? 'Ocultar gráfico' : 'Mostrar gráfico'}
              title={donutChartExpanded ? 'Ocultar gráfico' : 'Mostrar gráfico'}
            >
              <ChevronDown
                size={18}
                strokeWidth={2.25}
                className={cx(
                  styles.chartToggleChevron,
                  donutChartExpanded && styles.chartToggleChevronOpen,
                )}
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
