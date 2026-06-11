import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachMonthOfInterval,
  isSameDay,
  isSameWeek,
  isWithinInterval,
  parseISO,
  addMonths,
  subMonths,
  addYears,
  subYears,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  eachWeekOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, ArrowDownToLine, MoreVertical, Settings } from 'lucide-react';
import {
  eventsService,
  clientsService,
  activitiesService,
  authService,
  documentsService,
  usersService,
} from '@/api';
import { invalidateActivitiesCache } from '@/api/activities';
import {
  invalidateDocumentsBootstrapCache,
  invalidateResourceCache,
  resourceCacheKey,
} from '@/api/resourceCache';
import type { Activity, CalendarEvent, Client, Document, UserAssignee } from '@shared/types';
import {
  HOLIDAY_SHIFT_CODE,
  isActivityPast,
  resolveEventType,
  formatUserDayShiftHoursCompact,
  formatUserDayShiftHoursTitle,
  resolveUserDayShiftDisplay,
  SHIFT_META,
} from '@shared/types';
import {
  buildActivitiesSidebarItems,
  buildCalendarEventStubFromActivity,
  findActivityForEvent,
  findEventForActivity,
} from '@/lib/activityUtils';
import { matchesActivityPreviewSearch } from '@/lib/activityPreview';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { newActivityPath } from '@/lib/activityPaths';
import { downloadCalendarIcs } from '@/lib/calendarIcs';
import { formatDeleteSavedViewConfirmMessage } from '@/lib/viewConfig';
import { downloadActivitiesCsv } from '@/lib/activityCsv';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { SearchField, Select } from '@/components/forms';
import ui from '@/styles/shared.module.css';
import ContentLoading from '@/components/ContentLoading';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import { buildDocumentsByActivity } from '@/lib/documentsByActivity';
import CalendarEventButton from '@/components/CalendarEventButton';
import CalendarEventBody from '@/components/CalendarEventBody';
import CalendarDayEventCard from '@/components/CalendarDayEventCard';
import CalendarViewModeToggle from '@/components/CalendarViewModeToggle';
import ActivitiesScheduleNav from '@/components/ActivitiesScheduleNav';
import ActivitiesSidebarNav, {
  type ActivitiesSidebarItem,
} from '@/components/ActivitiesSidebarNav';
import UserScheduleSidebarList from '@/components/UserScheduleSidebarList';
import EmptyState from '@/components/EmptyState';
import ActivitiesDisplayModeToggle from '@/components/ActivitiesDisplayModeToggle';
import ActivitiesTableNav from '@/components/ActivitiesTableNav';
import ActivitiesTeamTable, {
  useActivitiesTeamTableController,
} from '@/components/ActivitiesTeamTable';
import ViewFilterModal from '@/components/ViewFilterModal';
import SavedViewsNav from '@/components/SavedViewsNav';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  ScheduleAvailabilityModeToolbarButton,
  ScheduleShiftLegend,
  ShiftStateBadge,
} from '@/components/UserScheduleEditor';
import editorStyles from '@/components/UserScheduleEditor.module.css';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { SidebarFooter } from '@/components/SidebarFooter';
import SecondarySidebarResizableSections from '@/components/SecondarySidebarResizableSections';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useElementWidthBelow } from '@/hooks/useElementWidthBelow';
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useCalendarScrollPeriod } from '@/hooks/useCalendarScrollPeriod';
import { useCalendarScrollBatch } from '@/hooks/useCalendarScrollBatch';
import {
  getCalendarViewDateRange,
  readStoredCalendarViewMode,
  writeStoredCalendarViewMode,
  type CalendarViewMode,
} from '@/lib/calendarViewMode';
import {
  readStoredActivitiesDisplayMode,
  writeStoredActivitiesDisplayMode,
  type ActivitiesDisplayMode,
} from '@/lib/activitiesDisplayMode';
import {
  countActivityAssociationGaps,
  formatActivityAssociationGapBanner,
  listActivityAssociationGapsFromActivities,
  resolveActivitySignatureSubjectLabel,
  resolveActivitySignatureUserId,
} from '@/lib/activityAssociationGaps';
import { activityMatchesTeamUser, eventMatchesTeamUser } from '@/lib/activitiesTeamScope';
import {
  ACTIVITIES_ALL_USERS_ID,
  isAllTeamUsers,
  teamUserIdFromUrlParam,
  teamUserIdToUrlParam,
} from '@/lib/activitiesTeamFilter';
import { toScheduleDateKey } from '@/lib/schedulePeriod';
import { getShiftPaletteColor } from '@/lib/shiftColorPalette';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import { useCalendarAvailability } from '@/hooks/useCalendarAvailability';
import { getActivitiesSearchPlaceholder } from '@/lib/searchPlaceholder';
import { matchesTableSearch } from '@/lib/tableViews';
import type { ActivityTableContext } from '@/lib/activityTableView';
import ActivityAssociationGapBanner from '@/components/ActivityAssociationGapBanner';
import styles from './Calendar.module.css';

/** Etiquetas de cabecera estilo Calendario iOS (español, semana empieza en lunes). */
const IOS_WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

function readInitialTeamUserId(
  searchParams: URLSearchParams,
  isAdmin: boolean,
  currentUserId: string,
): string {
  if (searchParams.get('view') === 'schedules' && isAdmin) {
    const legacyUser = teamUserIdFromUrlParam(searchParams.get('userId'));
    if (legacyUser) return legacyUser;
    return ACTIVITIES_ALL_USERS_ID;
  }
  const fromUrl = teamUserIdFromUrlParam(searchParams.get('userId'));
  if (fromUrl) return fromUrl;
  if (isAdmin) return ACTIVITIES_ALL_USERS_ID;
  return currentUserId;
}

export default function Calendar() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const currentUserId = currentUser?.id ?? '';

  const {
    openNew,
    openEdit,
    openEditByActivity,
    onActivitySaved,
    activitiesRefreshKey,
    activeEventId,
    activeActivityId,
  } = useActivityModal();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewModeState] = useState<CalendarViewMode>(() => readStoredCalendarViewMode());
  const setViewMode = useCallback((mode: CalendarViewMode) => {
    setViewModeState(mode);
    writeStoredCalendarViewMode(mode);
  }, []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { activityTypes } = useActivityTypes();
  const { boundaries } = useWorkspaceScheduleSettings();
  const { shiftSchedulingEnabled, workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigneesLoading, setAssigneesLoading] = useState(true);
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const [displayMode, setDisplayModeState] = useState<ActivitiesDisplayMode>(() =>
    readStoredActivitiesDisplayMode(),
  );
  const setDisplayMode = useCallback((mode: ActivitiesDisplayMode) => {
    setDisplayModeState(mode);
    writeStoredActivitiesDisplayMode(mode);
  }, []);
  const [teamUserId, setTeamUserId] = useState(() =>
    readInitialTeamUserId(searchParams, !!isAdmin, currentUserId),
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [calendarAvailabilityMode, setCalendarAvailabilityMode] = useState(false);
  const shiftColors = useShiftColorPalette();
  const [toolbarOptionsMenu, setToolbarOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const selectedTeamUserId = isAdmin ? teamUserId : currentUserId;
  const isAllTeam = isAllTeamUsers(selectedTeamUserId);
  const secondaryNavCollapsePage =
    displayMode === 'calendar' ? ('activities-calendar' as const) : ('activities' as const);
  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav } =
    useSecondaryNavCollapsed(secondaryNavCollapsePage);
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [tablePageRef, navMobileHidden] = useHideOnScrollDown(isMobile && !loading);
  const [mainContentMeasureRef, isMainContentNarrow] = useElementWidthBelow(677, !isMobile && !loading);
  const isCalendarCompact = isMobile || isMainContentNarrow;
  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const isScrollPeriodView =
    displayMode === 'calendar' && (viewMode === 'week' || viewMode === 'day');
  const [visibleScrollDate, setVisibleScrollDate] = useState(() => new Date());
  const periodAnchorDate = isScrollPeriodView ? visibleScrollDate : currentDate;

  useEffect(() => {
    if (isScrollPeriodView) {
      setVisibleScrollDate(currentDate);
    }
  }, [currentDate, isScrollPeriodView, viewMode, displayMode]);

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
  const tableController = useActivitiesTeamTableController(
    assignees,
    activityTypes,
    clients,
    tableCtx,
  );
  const filtersModalOpen = displayMode === 'table' && tableController.modalOpen;
  const hasSecondaryNavContent =
    isAdmin ||
    displayMode === 'calendar' ||
    (displayMode === 'table' && tableController.savedViews.length > 0);
  const showTeamSecondaryNav =
    hasSecondaryNavContent && !secondaryNavCollapsed && !filtersModalOpen;
  const showDisplayModeInToolbar =
    isMobile || !isMainContentNarrow || secondaryNavCollapsed || filtersModalOpen;
  const showDisplayModeInSidebar =
    !isMobile && isMainContentNarrow && showTeamSecondaryNav;
  useLayoutSecondarySidebarWidth(
    !isMobile && hasSecondaryNavContent && (!secondaryNavCollapsed || filtersModalOpen),
    {
      defaultToMax: displayMode === 'calendar',
    },
  );

  useEffect(() => {
    if (searchParams.get('view') !== 'schedules') return;
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    if (isAdmin && !next.has('userId')) next.set('userId', 'all');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !currentUserId || assignees.length === 0) return;
    if (searchParams.get('userId') !== null) return;
    const next = new URLSearchParams(searchParams);
    next.set('userId', 'all');
    setSearchParams(next, { replace: true });
  }, [isAdmin, currentUserId, assignees.length, searchParams, setSearchParams]);

  useEffect(() => {
    if (displayMode !== 'calendar') setCalendarAvailabilityMode(false);
  }, [displayMode]);

  useEffect(() => {
    let cancelled = false;
    void usersService
      .getAssignees()
      .then((users) => {
        if (!cancelled) setAssignees(users);
      })
      .finally(() => {
        if (!cancelled) setAssigneesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || assignees.length === 0) return;
    const urlParam = searchParams.get('userId');
    if (urlParam !== null) {
      const fromUrl = teamUserIdFromUrlParam(urlParam);
      if (fromUrl && isAllTeamUsers(fromUrl) && isAdmin) {
        setTeamUserId(fromUrl);
        return;
      }
      if (fromUrl && assignees.some((user) => user.id === fromUrl)) {
        setTeamUserId(fromUrl);
        return;
      }
    }
    if (!isAllTeamUsers(teamUserId) && !assignees.some((user) => user.id === teamUserId)) {
      setTeamUserId(isAdmin ? ACTIVITIES_ALL_USERS_ID : currentUserId);
    }
  }, [assignees, currentUserId, searchParams, teamUserId, isAdmin]);

  const syncTeamUserUrl = useCallback(
    (userId: string) => {
      const next = new URLSearchParams(searchParams);
      if (isAdmin) next.set('userId', teamUserIdToUrlParam(userId));
      else next.delete('userId');
      setSearchParams(next, { replace: true });
    },
    [isAdmin, searchParams, setSearchParams],
  );

  const selectTeamUser = useCallback(
    (userId: string) => {
      setTeamUserId(userId);
      syncTeamUserUrl(userId);
    },
    [syncTeamUserUrl],
  );

  const loadData = useCallback(async () => {
    invalidateActivitiesCache();
    invalidateDocumentsBootstrapCache();
    invalidateResourceCache(resourceCacheKey('/clients'));
    invalidateResourceCache(resourceCacheKey('/documents'));

    const [eventsData, clientsData, activitiesData, documentsData] = await Promise.all([
      eventsService.getAll(),
      clientsService.getAll(),
      activitiesService.getAllFresh(),
      documentsService.getAll(),
    ]);
    setEvents(eventsData);
    setClients(clientsData);
    setDocuments(documentsData);
    setRecentActivities(
      activitiesData.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => onActivitySaved(loadData), [onActivitySaved, loadData]);

  useEffect(() => {
    if (activitiesRefreshKey === 0) return;
    void loadData();
  }, [activitiesRefreshKey, loadData]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      const date = searchParams.get('date') ?? undefined;
      navigate(newActivityPath(date), { replace: true });
    }
  }, [searchParams, navigate]);

  const teamAssigneeIds = useMemo(() => new Set(assignees.map((user) => user.id)), [assignees]);

  const viewDateRange = useMemo(() => {
    const { start, end } = getCalendarViewDateRange(periodAnchorDate, viewMode);
    return { start, end };
  }, [periodAnchorDate, viewMode]);

  const selectedAssignee = useMemo(
    () => assignees.find((user) => user.id === selectedTeamUserId),
    [assignees, selectedTeamUserId],
  );
  const canUseCalendarAvailability =
    shiftSchedulingEnabled && displayMode === 'calendar' && !isAllTeam;
  const canShowCalendarShifts = canUseCalendarAvailability && calendarAvailabilityMode;
  const calendarAvailabilityRange = useMemo(
    () => ({
      from: format(viewDateRange.start, 'yyyy-MM-dd'),
      to: format(viewDateRange.end, 'yyyy-MM-dd'),
    }),
    [viewDateRange],
  );
  const calendarAvailability = useCalendarAvailability({
    userId: selectedTeamUserId,
    enabled: canShowCalendarShifts,
    rangeFrom: calendarAvailabilityRange.from,
    rangeTo: calendarAvailabilityRange.to,
    maxVacationDays:
      selectedAssignee?.maxVacationDays ??
      (selectedTeamUserId === currentUserId ? currentUser?.maxVacationDays : undefined),
    activities: recentActivities,
    events,
  });

  const toolbarActivitiesCount = useMemo(() => {
    let scoped: Activity[];

    if (displayMode === 'table') {
      const { from, to } = getCalendarViewDateRange(currentDate, viewMode);
      scoped = recentActivities.filter(
        (activity) => activity.date >= from && activity.date <= to,
      );
    } else {
      const fromKey = format(viewDateRange.start, 'yyyy-MM-dd');
      const toKey = format(viewDateRange.end, 'yyyy-MM-dd');
      scoped = recentActivities.filter(
        (activity) => activity.date >= fromKey && activity.date <= toKey,
      );
    }

    scoped = scoped.filter((activity) =>
      activityMatchesTeamUser(activity, events, selectedTeamUserId, teamAssigneeIds),
    );

    if (displayMode === 'table') {
      return tableController.applyView(scoped).length;
    }

    return scoped.length;
  }, [
    displayMode,
    currentDate,
    viewMode,
    viewDateRange,
    recentActivities,
    events,
    selectedTeamUserId,
    teamAssigneeIds,
    tableController.applyView,
  ]);

  const activitiesSearchPlaceholder = useMemo(
    () => getActivitiesSearchPlaceholder(toolbarActivitiesCount),
    [toolbarActivitiesCount],
  );

  const gapBannerActivities = useMemo(() => {
    let scoped: Activity[];

    if (displayMode === 'table') {
      const { from, to } = getCalendarViewDateRange(currentDate, viewMode);
      scoped = recentActivities.filter(
        (activity) => activity.date >= from && activity.date <= to,
      );
    } else {
      const fromKey = format(viewDateRange.start, 'yyyy-MM-dd');
      const toKey = format(viewDateRange.end, 'yyyy-MM-dd');
      scoped = recentActivities.filter(
        (activity) => activity.date >= fromKey && activity.date <= toKey,
      );
    }

    scoped = scoped.filter((activity) =>
      activityMatchesTeamUser(activity, events, selectedTeamUserId, teamAssigneeIds),
    );

    if (displayMode === 'table') {
      const searched = scoped.filter((activity) =>
        matchesTableSearch(activity, searchTerm, tableController.dataColumns, tableCtx),
      );
      return tableController.sortedItems(searched);
    }

    if (displayMode === 'calendar' && searchTerm.trim()) {
      scoped = scoped.filter((activity) => {
        const event = findEventForActivity(activity, events);
        return matchesActivityPreviewSearch(
          { event, activity, clientsMap, activityTypes },
          searchTerm,
        );
      });
    }

    return scoped;
  }, [
    displayMode,
    currentDate,
    viewMode,
    viewDateRange,
    recentActivities,
    events,
    selectedTeamUserId,
    teamAssigneeIds,
    searchTerm,
    tableController.dataColumns,
    tableController.sortedItems,
    tableCtx,
    clientsMap,
    activityTypes,
  ]);

  const gapBannerDateRange = useMemo(() => {
    if (displayMode === 'table') {
      const { from, to } = getCalendarViewDateRange(currentDate, viewMode);
      return { from, to };
    }
    return {
      from: format(viewDateRange.start, 'yyyy-MM-dd'),
      to: format(viewDateRange.end, 'yyyy-MM-dd'),
    };
  }, [displayMode, currentDate, viewMode, viewDateRange]);

  const gapBannerSignatureUserId = useMemo(
    () => resolveActivitySignatureUserId(selectedTeamUserId, currentUserId),
    [selectedTeamUserId, currentUserId],
  );

  const gapBannerSignatureSubjectLabel = useMemo(
    () =>
      resolveActivitySignatureSubjectLabel(
        selectedTeamUserId,
        assignees.find((user) => user.id === selectedTeamUserId)?.name,
      ),
    [selectedTeamUserId, assignees],
  );

  const associationGapBanner = useMemo(() => {
    const counts = countActivityAssociationGaps(
      gapBannerActivities,
      events,
      documentsByActivity,
      selectedTeamUserId,
      teamAssigneeIds,
      currentUserId,
      boundaries,
      {
        viewerIsAdmin: isAdmin,
        activityTypes,
        operatorUserId: currentUserId,
        workerSignaturesEnabled,
      },
    );
    return formatActivityAssociationGapBanner(
      counts,
      gapBannerDateRange.from,
      gapBannerDateRange.to,
      {
        signatureSubjectLabel: gapBannerSignatureSubjectLabel,
        viewerIsAdmin: isAdmin,
        workerSignaturesEnabled,
      },
    );
  }, [
    gapBannerActivities,
    events,
    documentsByActivity,
    selectedTeamUserId,
    teamAssigneeIds,
    currentUserId,
    boundaries,
    gapBannerDateRange.from,
    gapBannerDateRange.to,
    gapBannerSignatureSubjectLabel,
    isAdmin,
    activityTypes,
    workerSignaturesEnabled,
  ]);

  const associationGapItems = useMemo(
    () =>
      listActivityAssociationGapsFromActivities(
        gapBannerActivities,
        events,
        documentsByActivity,
        gapBannerSignatureUserId,
        boundaries,
        {
          viewerIsAdmin: isAdmin,
          activityTypes,
          operatorUserId: currentUserId,
          workerSignaturesEnabled,
        },
      ),
    [
      gapBannerActivities,
      events,
      documentsByActivity,
      gapBannerSignatureUserId,
      boundaries,
      isAdmin,
      activityTypes,
      currentUserId,
      workerSignaturesEnabled,
    ],
  );

  const tableExportActivities = useMemo(() => {
    if (displayMode !== 'table') return [];
    return gapBannerActivities;
  }, [displayMode, gapBannerActivities]);

  const eventMatchesCalendarSearch = useCallback(
    (event: CalendarEvent) =>
      matchesActivityPreviewSearch(
        {
          event,
          activity: findActivityForEvent(event, recentActivities),
          clientsMap,
          activityTypes,
        },
        searchTerm,
      ),
    [searchTerm, recentActivities, clientsMap, activityTypes],
  );

  const eventsInView = useMemo(
    () =>
      events
        .filter((event) => {
          const eventDate = parseISO(event.date);
          return (
            !Number.isNaN(eventDate.getTime()) &&
            isWithinInterval(eventDate, viewDateRange) &&
            eventMatchesTeamUser(
              event,
              recentActivities,
              selectedTeamUserId,
              teamAssigneeIds,
            ) &&
            eventMatchesCalendarSearch(event)
          );
        })
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.startTime.localeCompare(b.startTime);
        }),
    [
      events,
      viewDateRange,
      recentActivities,
      selectedTeamUserId,
      teamAssigneeIds,
      eventMatchesCalendarSearch,
    ],
  );

  const activitiesInView = useMemo(() => {
    const fromKey = format(viewDateRange.start, 'yyyy-MM-dd');
    const toKey = format(viewDateRange.end, 'yyyy-MM-dd');
    let scoped = recentActivities.filter(
      (activity) => activity.date >= fromKey && activity.date <= toKey,
    );
    scoped = scoped.filter((activity) =>
      activityMatchesTeamUser(activity, events, selectedTeamUserId, teamAssigneeIds),
    );
    if (searchTerm.trim()) {
      scoped = scoped.filter((activity) => {
        const linkedEvent = findEventForActivity(activity, events);
        const event =
          linkedEvent ??
          buildCalendarEventStubFromActivity(activity, clientsMap, activityTypes);
        return matchesActivityPreviewSearch(
          { event, activity, clientsMap, activityTypes },
          searchTerm,
        );
      });
    }
    return scoped;
  }, [
    viewDateRange,
    recentActivities,
    events,
    selectedTeamUserId,
    teamAssigneeIds,
    searchTerm,
    clientsMap,
    activityTypes,
  ]);

  const sidebarItems = useMemo(
    () =>
      buildActivitiesSidebarItems(
        eventsInView,
        activitiesInView,
        recentActivities,
        events,
        clientsMap,
        activityTypes,
      ),
    [eventsInView, activitiesInView, recentActivities, events, clientsMap, activityTypes],
  );

  const sidebarEmptyDescription = useMemo(() => {
    if (viewMode === 'year') return 'No hay actividades programadas en este año.';
    if (viewMode === 'month') return 'No hay actividades programadas en este mes.';
    if (viewMode === 'week') return 'No hay actividades programadas en esta semana.';
    return 'No hay actividades programadas en este día.';
  }, [viewMode]);

  const openCalendarEvent = useCallback(
    (event: CalendarEvent) => {
      const activity = findActivityForEvent(event, recentActivities);
      if (activity) openEditByActivity(activity, events);
      else openEdit(event);
    },
    [openEdit, openEditByActivity, events, recentActivities],
  );

  const handleSidebarItemSelect = useCallback(
    ({ event, activity }: ActivitiesSidebarItem) => {
      if (activity) openEditByActivity(activity, events);
      else openCalendarEvent(event);
    },
    [openEditByActivity, openCalendarEvent, events],
  );

  const showAvailabilitySidebar =
    displayMode === 'calendar' && calendarAvailabilityMode;
  const secondaryNavTitle = showAvailabilitySidebar ? 'Jornadas' : 'Actividades';

  const handleJornadaDateSelect = useCallback((date: string) => {
    setCurrentDate(parseISO(date));
  }, []);

  const periodLabel = useMemo(() => {
    if (viewMode === 'year') return format(periodAnchorDate, 'yyyy', { locale: es });
    if (viewMode === 'month') return format(periodAnchorDate, 'MMMM yyyy', { locale: es });
    if (viewMode === 'week') {
      return `Semana del ${format(startOfWeek(periodAnchorDate, { locale: es }), 'd MMM', { locale: es })}`;
    }
    return format(periodAnchorDate, "d 'de' MMMM yyyy", { locale: es });
  }, [periodAnchorDate, viewMode]);

  const formatScrollPeriodLabel = useCallback(
    (period: Date) => {
      if (viewMode === 'day') {
        return format(period, "d 'de' MMMM yyyy", { locale: es });
      }
      const weekStart = startOfWeek(period, { locale: es });
      const weekEnd = endOfWeek(period, { locale: es });
      return `${format(weekStart, 'd MMM', { locale: es })} – ${format(weekEnd, 'd MMM yyyy', { locale: es })}`;
    },
    [viewMode],
  );

  const showPeriodNav = displayMode === 'calendar';

  const monthsInYear = useMemo(() => {
    const start = startOfYear(currentDate);
    const end = endOfYear(currentDate);
    return eachMonthOfInterval({ start, end });
  }, [currentDate]);

  const getDaysForMonth = (month: Date) => {
    const start = startOfWeek(startOfMonth(month), { locale: es });
    const end = endOfWeek(endOfMonth(month), { locale: es });
    return eachDayOfInterval({ start, end });
  };

  const getDaysForWeek = (weekStart: Date) => {
    const start = startOfWeek(weekStart, { locale: es });
    const end = endOfWeek(weekStart, { locale: es });
    return eachDayOfInterval({ start, end });
  };

  const allScrollPeriods = useMemo(() => {
    const yearStart = startOfYear(currentDate);
    const yearEnd = endOfYear(currentDate);
    if (viewMode === 'week') {
      return eachWeekOfInterval({ start: yearStart, end: yearEnd }, { locale: es });
    }
    if (viewMode === 'day') {
      return eachDayOfInterval({ start: yearStart, end: yearEnd });
    }
    return [];
  }, [viewMode, currentDate.getFullYear()]);

  const periodKeyForDate = useCallback(
    (date: Date) => {
      const normalized =
        viewMode === 'day' ? startOfDay(date) : startOfWeek(date, { locale: es });
      return format(normalized, 'yyyy-MM-dd');
    },
    [viewMode],
  );

  const parsePeriodKey = useCallback((key: string) => parseISO(key), []);

  const handleVisibleScrollPeriod = useCallback(
    (key: string) => {
      setVisibleScrollDate(parsePeriodKey(key));
    },
    [parsePeriodKey],
  );

  const { visiblePeriods: scrollVisiblePeriods, visiblePeriodKeys } = useCalendarScrollBatch({
    enabled: isScrollPeriodView && !loading,
    scrollRootRef: calendarBodyRef,
    allPeriods: allScrollPeriods,
    periodKeyForDate,
    anchorDate: currentDate,
  });

  const { registerSection } = useCalendarScrollPeriod({
    enabled: isScrollPeriodView && !loading,
    scrollRootRef: calendarBodyRef,
    periodKeys: visiblePeriodKeys,
    anchorKey: periodKeyForDate(currentDate),
    onVisiblePeriod: handleVisibleScrollPeriod,
  });

  const getEventsForDay = useCallback(
    (day: Date) =>
      events.filter((event) => {
        if (!isSameDay(parseISO(event.date), day)) return false;
        return (
          eventMatchesTeamUser(
            event,
            recentActivities,
            selectedTeamUserId,
            teamAssigneeIds,
          ) && eventMatchesCalendarSearch(event)
        );
      }),
    [
      events,
      recentActivities,
      selectedTeamUserId,
      teamAssigneeIds,
      eventMatchesCalendarSearch,
    ],
  );

  const getEventColor = (event: CalendarEvent) => {
    const resolved = resolveEventType(event.title, activityTypes);
    return resolved?.color ?? '#737373';
  };

  const getEventDayLabel = (event: CalendarEvent) => {
    const activity = findActivityForEvent(event, recentActivities);
    const clientId = activity?.clientId ?? event.clientId;
    const client = clientId ? clientsMap.get(clientId) : undefined;
    return client?.name ?? event.title ?? 'Actividad';
  };

  const handleCalendarDayAvailability = useCallback(
    (day: Date) => {
      if (!canUseCalendarAvailability || calendarAvailability.saving) return;
      calendarAvailability.handleCycleShift(toScheduleDateKey(day));
    },
    [canUseCalendarAvailability, calendarAvailability],
  );

  const renderCalendarDayShiftFooter = useCallback(
    (day: Date) => {
      if (!canShowCalendarShifts) return null;

      const dateKey = toScheduleDateKey(day);
      const plannedShift = calendarAvailability.entriesByDate.get(dateKey);
      const isHoliday = calendarAvailability.holidayDates.has(dateKey);
      const shiftDisplay = resolveUserDayShiftDisplay(
        recentActivities,
        events,
        selectedTeamUserId,
        dateKey,
        plannedShift,
        boundaries,
      );

      if (shiftDisplay.displayShifts.length === 0 && !isHoliday) return null;

      const holidayMeta = SHIFT_META[HOLIDAY_SHIFT_CODE];

      return (
        <div className={styles.calendarDayShiftFooter}>
          <div className={styles.calendarDayShiftBadges}>
            {isHoliday && (
              <span
                className={editorStyles.monthDayBadge}
                style={{ backgroundColor: getShiftPaletteColor(HOLIDAY_SHIFT_CODE, shiftColors) }}
                title={holidayMeta.tooltip}
              >
                {holidayMeta.shortLabel}
              </span>
            )}
            {shiftDisplay.displayShifts.map((shift) => (
              <ShiftStateBadge
                key={shift}
                shift={shift}
                title={SHIFT_META[shift].tooltip}
                plain={!shiftDisplay.lockedByActivities}
              />
            ))}
          </div>
          {shiftDisplay.showActivityHours ? (
            <span
              className={styles.calendarDayShiftHours}
              title={formatUserDayShiftHoursTitle(shiftDisplay)}
            >
              <span className={styles.calendarDayShiftHoursSigned}>
                {shiftDisplay.displaySignedHours}
              </span>
              <span className={styles.calendarDayShiftHoursSep}>/</span>
              <span className={styles.calendarDayShiftHoursAssigned}>
                {shiftDisplay.displayAssignedHours}
              </span>
              <span className={styles.calendarDayShiftHoursUnit}> h</span>
            </span>
          ) : null}
        </div>
      );
    },
    [
      canShowCalendarShifts,
      calendarAvailability,
      shiftColors,
      recentActivities,
      events,
      selectedTeamUserId,
      boundaries,
    ],
  );

  const isCalendarDayShiftLocked = useCallback(
    (day: Date) => {
      const dateKey = toScheduleDateKey(day);
      return resolveUserDayShiftDisplay(
        recentActivities,
        events,
        selectedTeamUserId,
        dateKey,
        calendarAvailability.entriesByDate.get(dateKey),
        boundaries,
      ).lockedByActivities;
    },
    [recentActivities, events, selectedTeamUserId, calendarAvailability.entriesByDate, boundaries],
  );

  const renderGridDayCell = (
    day: Date,
    index: number,
    options: { contextDate: Date; mode: 'month' | 'week'; cellClassName?: string },
  ) => {
    const dayEvents = getEventsForDay(day);
    const isToday = isSameDay(day, new Date());
    const isMuted =
      options.mode === 'month'
        ? day.getMonth() !== options.contextDate.getMonth()
        : !isSameWeek(day, options.contextDate, { locale: es });

    const shiftLocked =
      calendarAvailabilityMode && canUseCalendarAvailability && isCalendarDayShiftLocked(day);

    const handleDayClick = () => {
      if (calendarAvailabilityMode && canUseCalendarAvailability) {
        if (shiftLocked) return;
        handleCalendarDayAvailability(day);
        return;
      }
      openNew(format(day, 'yyyy-MM-dd'), { directForm: true });
    };

    return (
      <div
        key={day.toISOString()}
        role="button"
        tabIndex={shiftLocked ? -1 : 0}
        onClick={handleDayClick}
        onKeyDown={(e) => {
          if (shiftLocked) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleDayClick();
          }
        }}
        className={cx(
          styles.dayCell,
          styles.dayCellInteractive,
          options.cellClassName,
          isMuted && styles.dayCellOtherMonth,
          options.mode === 'month' && index % 7 === 6 && styles.dayCellLastCol,
          calendarAvailabilityMode && canUseCalendarAvailability && styles.dayCellAvailabilityMode,
          shiftLocked && styles.dayCellShiftLocked,
          calendarAvailability.saving && styles.dayCellAvailabilitySaving,
        )}
        aria-label={
          calendarAvailabilityMode && canUseCalendarAvailability
            ? shiftLocked
              ? `${format(day, 'd MMMM yyyy', { locale: es })}, turno fijado por actividad asignada`
              : `${format(day, 'd MMMM yyyy', { locale: es })}, pulsa para cambiar turno`
            : undefined
        }
      >
        <div
          className={cx(
            styles.dayLabel,
            isToday && styles.dayLabelToday,
            isMuted && styles.dayLabelMuted,
          )}
        >
          <span className={cx(styles.dayNumber, isToday && styles.todayNumber)}>
            {format(day, 'd')}
          </span>
        </div>
        <div className={styles.events}>
          {options.mode === 'month' && isCalendarCompact ? (
            dayEvents.length > 0 ? (
              <div className={styles.monthDayDots} aria-label={`${dayEvents.length} actividades`}>
                {dayEvents.slice(0, 4).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.monthDayDot}
                    style={{ backgroundColor: getEventColor(event) }}
                    title={getEventDayLabel(event)}
                    aria-label={getEventDayLabel(event)}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCalendarEvent(event);
                    }}
                  />
                ))}
                {dayEvents.length > 4 ? (
                  <span className={styles.monthDayDotMore} aria-hidden>
                    +{dayEvents.length - 4}
                  </span>
                ) : null}
              </div>
            ) : null
          ) : (
            dayEvents.map((event) => {
              const activity = findActivityForEvent(event, recentActivities);

              return (
                <CalendarEventButton
                  key={event.id}
                  event={event}
                  activity={activity}
                  clientsMap={clientsMap}
                  activityTypes={activityTypes}
                  documentsByActivity={documentsByActivity}
                  assigneesById={assigneesById}
                  events={events}
                  onClick={(e) => {
                    e.stopPropagation();
                    openCalendarEvent(event);
                  }}
                  className={cx(styles.eventBtn, isActivityPast({ event }) && ui.pastActivity)}
                  style={{ '--type-color': getEventColor(event) } as React.CSSProperties}
                >
                  <CalendarEventBody
                    event={event}
                    activity={activity}
                    clientsMap={clientsMap}
                    activityTypes={activityTypes}
                    documentsByActivity={documentsByActivity}
                    assigneesById={assigneesById}
                    events={events}
                    timeClassName={styles.eventTime}
                    compact={options.mode === 'month'}
                  />
                </CalendarEventButton>
              );
            })
          )}
        </div>
        {renderCalendarDayShiftFooter(day)}
      </div>
    );
  };

  const renderDayViewCell = (day: Date) => {
    const dayEvents = getEventsForDay(day);
    const shiftLocked =
      calendarAvailabilityMode && canUseCalendarAvailability && isCalendarDayShiftLocked(day);

    const handleDayClick = () => {
      if (calendarAvailabilityMode && canUseCalendarAvailability) {
        if (shiftLocked) return;
        handleCalendarDayAvailability(day);
        return;
      }
      openNew(format(day, 'yyyy-MM-dd'), { directForm: true });
    };

    return (
      <div
        role="button"
        tabIndex={shiftLocked ? -1 : 0}
        onClick={handleDayClick}
        onKeyDown={(e) => {
          if (shiftLocked) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleDayClick();
          }
        }}
        className={cx(
          styles.dayCell,
          styles.dayCellInteractive,
          styles.weekDayCell,
          styles.dayViewCell,
          calendarAvailabilityMode && canUseCalendarAvailability && styles.dayCellAvailabilityMode,
          shiftLocked && styles.dayCellShiftLocked,
          calendarAvailability.saving && styles.dayCellAvailabilitySaving,
        )}
        aria-label={
          calendarAvailabilityMode && canUseCalendarAvailability
            ? shiftLocked
              ? `${format(day, 'd MMMM yyyy', { locale: es })}, turno fijado por actividad asignada`
              : `${format(day, 'd MMMM yyyy', { locale: es })}, pulsa para cambiar turno`
            : undefined
        }
      >
        <div className={styles.events}>
          {dayEvents.map((event) => (
            <CalendarDayEventCard
              key={event.id}
              event={event}
              activity={findActivityForEvent(event, recentActivities)}
              clientsMap={clientsMap}
              activityTypes={activityTypes}
              documentsByActivity={documentsByActivity}
              assigneesById={assigneesById}
              events={events}
              typeColor={getEventColor(event)}
              past={isActivityPast({ event })}
              onOpen={() => openCalendarEvent(event)}
            />
          ))}
        </div>
        {renderCalendarDayShiftFooter(day)}
      </div>
    );
  };

  const handlePrevious = () => {
    const anchor = isScrollPeriodView ? visibleScrollDate : currentDate;
    if (viewMode === 'year') setCurrentDate(subYears(anchor, 1));
    else if (viewMode === 'month') setCurrentDate(subMonths(anchor, 1));
    else if (viewMode === 'week') setCurrentDate(subDays(anchor, 7));
    else setCurrentDate(subDays(anchor, 1));
  };

  const handleNext = () => {
    const anchor = isScrollPeriodView ? visibleScrollDate : currentDate;
    if (viewMode === 'year') setCurrentDate(addYears(anchor, 1));
    else if (viewMode === 'month') setCurrentDate(addMonths(anchor, 1));
    else if (viewMode === 'week') setCurrentDate(addDays(anchor, 7));
    else setCurrentDate(addDays(anchor, 1));
  };

  const handlePeriodPrevious = () => {
    handlePrevious();
  };

  const handlePeriodNext = () => {
    handleNext();
  };

  const openToolbarOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setToolbarOptionsMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const handleOpenCalendarSettings = useCallback(() => {
    navigate('/settings?tab=schedule');
  }, [navigate]);

  const handleDownloadActivitiesCsv = useCallback(() => {
    if (!isAdmin || tableExportActivities.length === 0) return;
    const filename = `actividades-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadActivitiesCsv(tableExportActivities, tableCtx, filename);
  }, [isAdmin, tableExportActivities, tableCtx]);

  const toolbarOptionsItems: ContextMenuItem[] = useMemo(() => {
    if (displayMode === 'calendar') {
      const items: ContextMenuItem[] = [
        {
          id: 'calendar-settings',
          label: 'Configurar calendario',
          icon: <Settings size={16} />,
          onSelect: handleOpenCalendarSettings,
        },
      ];
      if (isAdmin) {
        items.push({
          id: 'download-ics',
          label: 'Descargar calendario (.ics)',
          icon: <ArrowDownToLine size={16} />,
          disabled: events.length === 0,
          onSelect: () => downloadCalendarIcs(events, clientsMap),
        });
      }
      return items;
    }
    if (displayMode === 'table') {
      const items: ContextMenuItem[] = [
        {
          id: 'calendar-settings',
          label: 'Configurar calendario',
          icon: <Settings size={16} />,
          onSelect: handleOpenCalendarSettings,
        },
      ];
      if (isAdmin) {
        items.push({
          id: 'download-csv',
          label: 'Descargar CSV',
          icon: <ArrowDownToLine size={16} />,
          disabled: tableExportActivities.length === 0,
          onSelect: handleDownloadActivitiesCsv,
        });
      }
      return items;
    }
    return [];
  }, [
    isAdmin,
    displayMode,
    handleOpenCalendarSettings,
    tableExportActivities.length,
    handleDownloadActivitiesCsv,
    events,
    clientsMap,
  ]);

  const showToolbarOptions = displayMode === 'calendar' || displayMode === 'table';

  const calendarViewToggle = (
    <CalendarViewModeToggle value={viewMode} onChange={setViewMode} ariaLabel="Vista del calendario" />
  );

  const teamNav = (sidebarLoading: boolean) => (
    <ActivitiesScheduleNav
      assignees={assignees}
      currentUserId={currentUserId}
      selectedUserId={selectedTeamUserId}
      isAdmin={!!isAdmin}
      onSelect={selectTeamUser}
      sectionHeader={!!isAdmin && displayMode !== 'table'}
      loading={sidebarLoading || assigneesLoading}
    />
  );

  const sidebarPeriodLabel = periodLabel;

  const showMobilePeriodNavRow = isMobile && (displayMode === 'table' || showPeriodNav);
  const showMobileGapBanner = Boolean(associationGapBanner && isMobile);
  const showDesktopGapBanner = Boolean(associationGapBanner && !isMobile);
  const pinMobileGapBannerToCalendar =
    showMobileGapBanner && displayMode === 'calendar' && viewMode === 'month';
  const desktopGapBanner = showDesktopGapBanner ? (
    <div className={styles.calendarContentGapBanner}>
      <ActivityAssociationGapBanner
        content={associationGapBanner!}
        items={associationGapItems}
        events={events}
        clientsMap={clientsMap}
        activityTypes={activityTypes}
        documentsByActivity={documentsByActivity}
        assigneesById={assigneesById}
      />
    </div>
  ) : null;
  const mobilePeriodNavLabel = sidebarPeriodLabel;
  const mobilePeriodNavClassName =
    displayMode === 'table' ? styles.periodTitleNavTable : styles.periodTitleNavToolbar;

  const handleSidebarPeriodPrevious = () => {
    handlePeriodPrevious();
  };

  const handleSidebarPeriodNext = () => {
    handlePeriodNext();
  };

  const renderPeriodNav = (
    label: string,
    onPrevious: () => void,
    onNext: () => void,
    className?: string,
  ) => (
    <div className={cx(styles.periodTitleNav, className)}>
      <button type="button" onClick={onPrevious} className={ui.btnIcon} aria-label="Periodo anterior">
        <ChevronLeft size={20} />
      </button>
      <h2 className={ui.pageSectionTitle}>{label}</h2>
      <button type="button" onClick={onNext} className={ui.btnIcon} aria-label="Periodo siguiente">
        <ChevronRight size={20} />
      </button>
    </div>
  );

  const showPeriodNavAboveBody =
    (showPeriodNav || displayMode === 'table') && !isMobile;

  const displayModeToggle = (
    <ActivitiesDisplayModeToggle value={displayMode} onChange={setDisplayMode} />
  );

  const renderSecondarySidebar = (busy?: boolean) => {
    const sidebarLoading = Boolean(busy || loading);

    return (
    <aside
      id="activities-secondary-nav"
      className={cx(
        styles.activitiesNav,
        filtersModalOpen && styles.activitiesNavFiltersOpen,
        !showTeamSecondaryNav && !filtersModalOpen && styles.activitiesNavCollapsed,
      )}
      aria-label={filtersModalOpen ? 'Vistas y filtros' : 'Actividades del equipo'}
      aria-hidden={!showTeamSecondaryNav && !filtersModalOpen ? true : undefined}
      aria-busy={busy || undefined}
    >
      {filtersModalOpen ? (
        <>
          <SavedViewsNav
            views={tableController.savedViews}
            activeViewId={tableController.activeSavedViewId}
            onSelect={tableController.loadView}
            onDelete={tableController.requestDeleteView}
            filtersOpen
          />
          <ViewFilterModal {...tableController.viewFilterProps} part="panel" />
        </>
      ) : showTeamSecondaryNav ? (
        <>
          <div className={styles.activitiesNavHeader}>
            <p className={styles.activitiesNavTitle}>{secondaryNavTitle}</p>
            <SecondaryNavToggle
              expanded
              onToggle={toggleSecondaryNav}
              controlsId="activities-secondary-nav"
              className={styles.activitiesNavToggle}
            />
          </div>
          <div className={styles.activitiesNavScrollBody} {...scrollRegionProps}>
            {showDisplayModeInSidebar ? (
              <div className={styles.activitiesNavMainViewToggle}>{displayModeToggle}</div>
            ) : null}
            {!isMobile ? (
              <SecondarySidebarResizableSections
                storageKey={`activities-${displayMode}`}
                className={styles.activitiesNavSections}
                sections={[
                  ...(displayMode === 'calendar'
                    ? [
                        {
                          id: showAvailabilitySidebar ? 'jornadas' : 'period',
                          children: showAvailabilitySidebar ? (
                            canUseCalendarAvailability ? (
                              <UserScheduleSidebarList
                                userId={selectedTeamUserId}
                                userName={selectedAssignee?.name}
                                currentDate={currentDate}
                                entriesByDate={calendarAvailability.entriesByDate}
                                activities={recentActivities}
                                events={events}
                                maxVacationDays={
                                  selectedAssignee?.maxVacationDays ??
                                  (selectedTeamUserId === currentUserId
                                    ? currentUser?.maxVacationDays
                                    : undefined)
                                }
                                loading={calendarAvailability.loading}
                                onSelectDate={handleJornadaDateSelect}
                              />
                            ) : (
                              <div className={styles.activitiesNavEmptyState}>
                                <EmptyState
                                  emoji="👤"
                                  compact
                                  description="Selecciona un operario en la lista para ver sus jornadas."
                                />
                              </div>
                            )
                          ) : (
                            <ActivitiesSidebarNav
                              items={sidebarItems}
                              clientsMap={clientsMap}
                              activityTypes={activityTypes}
                              documentsByActivity={documentsByActivity}
                              assigneesById={assigneesById}
                              events={events}
                              onSelect={handleSidebarItemSelect}
                              activeEventId={activeEventId}
                              activeActivityId={activeActivityId}
                              emptyDescription={sidebarEmptyDescription}
                              searchEmptyDescription="No hay actividades que coincidan con la búsqueda."
                              hideSearchField
                              toolbarSearchTerm={searchTerm}
                              loading={sidebarLoading}
                            />
                          ),
                        },
                      ]
                    : []),
                  ...(isAdmin
                    ? [
                        {
                          id: 'team',
                          children: teamNav(sidebarLoading),
                        },
                      ]
                    : []),
                  ...(displayMode === 'table' && tableController.savedViews.length > 0
                    ? [
                        {
                          id: 'views',
                          children: (
                            <SavedViewsNav
                              views={tableController.savedViews}
                              activeViewId={tableController.activeSavedViewId}
                              onSelect={tableController.loadView}
                              onDelete={tableController.requestDeleteView}
                              stacked
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ) : null}
          </div>
          {displayMode === 'calendar' && shiftSchedulingEnabled ? (
            <SidebarFooter variant="secondary" className={styles.activitiesNavAvailabilityFooter}>
              {calendarAvailabilityMode ? (
                <ScheduleShiftLegend
                  compact
                  className={styles.activitiesNavAvailabilityLegend}
                />
              ) : null}
              <ScheduleAvailabilityModeToolbarButton
                active={calendarAvailabilityMode}
                disabled={isAllTeam}
                onToggle={() => setCalendarAvailabilityMode((value) => !value)}
                sidebar
              />
            </SidebarFooter>
          ) : null}
        </>
      ) : null}
    </aside>
    );
  };

  if (loading) {
    return (
      <div className={styles.activitiesPage}>
        <SecondarySidebarPortal>{renderSecondarySidebar(true)}</SecondarySidebarPortal>
        <ContentLoading className={styles.activitiesContentLoading} />
      </div>
    );
  }

  return (
    <div className={styles.activitiesPage}>
      <SecondarySidebarPortal>{renderSecondarySidebar()}</SecondarySidebarPortal>

      <div className={styles.activitiesContent}>
        <div
          ref={(node) => {
            mainContentMeasureRef(node);
            tablePageRef(node);
          }}
          className={ui.tablePage}
        >
          <div className={styles.calendarToolbarStack}>
            <div className={cx(ui.tableToolbar, styles.calendarTableToolbar)}>
              <div className={cx(ui.filtersRow, styles.calendarToolbarRow)}>
                <div className={styles.calendarToolbarMainRow}>
                  {hasSecondaryNavContent && secondaryNavCollapsed && !filtersModalOpen && (
                    <SecondaryNavToggle
                      expanded={false}
                      onToggle={toggleSecondaryNav}
                      controlsId="activities-secondary-nav"
                      className={styles.secondaryNavExpandBtn}
                    />
                  )}
                  {showDisplayModeInToolbar ? displayModeToggle : null}
                  {displayMode === 'table' ? (
                    <>
                      <SearchField
                        wrapperClassName={ui.searchWrapper}
                        placeholder={activitiesSearchPlaceholder}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        trailing={
                          <>
                            {isMobile ? (
                              <ActivitiesTableNav
                                assignees={assignees}
                                currentUserId={currentUserId}
                                selectedUserId={selectedTeamUserId}
                                isAdmin={!!isAdmin}
                                onSelectUser={selectTeamUser}
                                savedViews={tableController.savedViews}
                                activeSavedViewId={tableController.activeSavedViewId}
                                onSelectView={tableController.loadView}
                                loading={assigneesLoading}
                                compact
                                compactPlacement="toolbar"
                              />
                            ) : null}
                            <ViewFilterModal
                              {...tableController.viewFilterProps}
                              part="trigger"
                              embedded
                            />
                          </>
                        }
                      />
                      {!isMobile && (
                        <div className={styles.scheduleToolbarToggles}>
                          {calendarViewToggle}
                        </div>
                      )}
                    </>
                  ) : displayMode === 'calendar' ? (
                    <>
                      <SearchField
                        wrapperClassName={ui.searchWrapper}
                        placeholder={activitiesSearchPlaceholder}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                      />
                      {!isMobile && (
                        <div className={styles.scheduleToolbarToggles}>
                          {calendarViewToggle}
                        </div>
                      )}
                    </>
                  ) : null}

                  {isMobile ? (
                    showToolbarOptions ? (
                      <button
                        type="button"
                        onClick={openToolbarOptionsMenu}
                        className={cx(
                          ui.navMobileOptionsBtn,
                          styles.calendarToolbarMobileOptionsBtn,
                        )}
                        aria-label="Opciones"
                        title="Opciones"
                        aria-haspopup="menu"
                        aria-expanded={toolbarOptionsMenu !== null}
                      >
                        <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                    ) : null
                  ) : (
                    <div
                      className={cx(ui.toolbarBtnGroup, ui.toolbarEnd, styles.headingActions)}
                    >
                      {showToolbarOptions && (
                        <button
                          type="button"
                          onClick={openToolbarOptionsMenu}
                          className={ui.toolbarIconBtn}
                          aria-label="Opciones"
                          title="Opciones"
                          aria-haspopup="menu"
                          aria-expanded={toolbarOptionsMenu !== null}
                        >
                          <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={openNew}
                        className={cx(ui.toolbarBtnPrimary, styles.addActivityBtn)}
                        aria-label="Nueva actividad"
                        title="Nueva actividad"
                      >
                        <Plus size={14} strokeWidth={2} aria-hidden />
                        <span className={ui.toolbarBtnLabel}>Actividad</span>
                      </button>
                    </div>
                  )}
                </div>

                {showMobilePeriodNavRow ? (
                  <div className={styles.periodTitleNavRow}>
                    {renderPeriodNav(
                      mobilePeriodNavLabel,
                      handleSidebarPeriodPrevious,
                      handleSidebarPeriodNext,
                      mobilePeriodNavClassName,
                    )}
                  </div>
                ) : null}

                {isMobile && (
                  <div className={styles.calendarViewToggleRow}>{calendarViewToggle}</div>
                )}

                {isAdmin && isMobile && displayMode === 'calendar' && assignees.length > 0 && secondaryNavCollapsed && (
                  <div className={styles.scheduleUserSelectRow}>
                    <label className={styles.scheduleUserSelectLabel} htmlFor="activities-team-user">
                      Operario
                    </label>
                    <Select
                      id="activities-team-user"
                      value={teamUserId}
                      onChange={(e) => selectTeamUser(e.target.value)}
                    >
                      <option value={ACTIVITIES_ALL_USERS_ID}>Todos</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                          {user.id === currentUserId ? ' (tú)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {displayMode === 'calendar' && calendarAvailability.error ? (
            <p className={styles.availabilityError} role="alert">
              {calendarAvailability.error}
            </p>
          ) : null}

          {showMobileGapBanner && !pinMobileGapBannerToCalendar ? (
            <ActivityAssociationGapBanner
              content={associationGapBanner}
              items={associationGapItems}
              events={events}
              clientsMap={clientsMap}
              activityTypes={activityTypes}
              documentsByActivity={documentsByActivity}
              assigneesById={assigneesById}
            />
          ) : null}

          {displayMode === 'table' ? (
            <div className={styles.calendarBodyStack}>
              {showPeriodNavAboveBody && (
                <div className={styles.calendarBodyPeriodBar}>
                  {renderPeriodNav(
                    sidebarPeriodLabel,
                    handleSidebarPeriodPrevious,
                    handleSidebarPeriodNext,
                    styles.periodTitleNavBody,
                  )}
                </div>
              )}
              <ActivitiesTeamTable
                scrollBodyRef={calendarBodyRef}
                scrollBodyClassName={cx(
                  ui.tableBody,
                  styles.calendarBody,
                  styles.activitiesTableBody,
                )}
                currentDate={currentDate}
                viewMode={viewMode}
                teamUserId={selectedTeamUserId}
                activities={recentActivities}
                events={events}
                assignees={assignees}
                searchTerm={searchTerm}
                isAdmin={!!isAdmin}
                tableCtx={tableCtx}
                tableController={tableController}
                onDataChanged={loadData}
              />
              {desktopGapBanner}
            </div>
          ) : (
          <div className={styles.calendarBodyStack}>
            {showPeriodNavAboveBody && (
              <div className={styles.calendarBodyPeriodBar}>
                {renderPeriodNav(
                  sidebarPeriodLabel,
                  handleSidebarPeriodPrevious,
                  handleSidebarPeriodNext,
                  styles.periodTitleNavBody,
                )}
              </div>
            )}
            <div
              ref={calendarBodyRef}
              className={cx(
                ui.tableBody,
                styles.calendarBody,
                isScrollPeriodView && styles.calendarBodyFill,
                pinMobileGapBannerToCalendar && styles.calendarBodyWithPinnedGap,
              )}
            >
            {pinMobileGapBannerToCalendar && associationGapBanner ? (
              <ActivityAssociationGapBanner
                content={associationGapBanner}
                items={associationGapItems}
                events={events}
                clientsMap={clientsMap}
                activityTypes={activityTypes}
                documentsByActivity={documentsByActivity}
                assigneesById={assigneesById}
                pinSummary
              />
            ) : null}
            {isScrollPeriodView ? (
              <div className={styles.calendarViewWrap}>
                <section className={cx(ui.pageSection, styles.calendarSection)}>
                  <div className={styles.calendarScrollStack}>
                    {scrollVisiblePeriods.map((period) => {
                      const key = periodKeyForDate(period);

                      if (viewMode === 'day') {
                        return (
                          <div
                            key={key}
                            ref={(node) => registerSection(key, node)}
                            data-scroll-period={key}
                            className={styles.calendarPeriodSection}
                          >
                            <div className={styles.calendarMainShell}>
                              <div className={cx(styles.weekCalendar, styles.dayCalendar)}>
                                <div className={styles.weekColumn}>
                                  <div className={cx(styles.weekday, styles.dayCalendarWeekday)}>
                                    <span className={styles.dayCalendarWeekdayLabel}>
                                      {IOS_WEEKDAY_LABELS[(period.getDay() + 6) % 7]}
                                    </span>
                                    <span
                                      className={cx(
                                        styles.dayCalendarWeekdayNumber,
                                        isSameDay(period, new Date()) && styles.todayNumber,
                                      )}
                                    >
                                      {format(period, 'd')}
                                    </span>
                                  </div>
                                  {renderDayViewCell(period)}
                                </div>
                              </div>
                            </div>
                            <h3 className={styles.calendarPeriodHeader}>
                              {formatScrollPeriodLabel(period)}
                            </h3>
                          </div>
                        );
                      }

                      const periodDays = getDaysForWeek(period);

                      return (
                        <div
                          key={key}
                          ref={(node) => registerSection(key, node)}
                          data-scroll-period={key}
                          className={styles.calendarPeriodSection}
                        >
                          <div className={styles.calendarMainShell}>
                            <div
                              className={cx(
                                styles.weekCalendar,
                                isCalendarCompact && styles.weekCalendarStacked,
                              )}
                            >
                              {periodDays.map((day, index) => (
                                <div
                                  key={`${key}-${day.toISOString()}`}
                                  className={styles.weekColumn}
                                >
                                  <div className={cx(styles.weekday, styles.weekCalendarWeekday)}>
                                    <span className={styles.weekCalendarWeekdayLabel}>
                                      {IOS_WEEKDAY_LABELS[index]}
                                    </span>
                                    <span
                                      className={cx(
                                        styles.weekCalendarWeekdayNumber,
                                        isSameDay(day, new Date()) && styles.todayNumber,
                                      )}
                                    >
                                      {format(day, 'd')}
                                    </span>
                                  </div>
                                  {renderGridDayCell(day, index, {
                                    contextDate: period,
                                    mode: 'week',
                                    cellClassName: styles.weekDayCell,
                                  })}
                                </div>
                              ))}
                            </div>
                          </div>
                          <h3 className={styles.calendarPeriodHeader}>
                            {formatScrollPeriodLabel(period)}
                          </h3>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            ) : (
              <div className={styles.calendarViewWrap}>
              <section className={cx(ui.pageSection, styles.calendarSection)}>
                <div className={styles.calendarContentShell}>
        {viewMode === 'year' ? (
        <div className={styles.yearCalendar}>
          {monthsInYear.map((month) => {
            const monthDays = getDaysForMonth(month);

            return (
              <div key={month.toISOString()} className={styles.yearMonth}>
                <button
                  type="button"
                  className={styles.yearMonthTitle}
                  onClick={() => {
                    setCurrentDate(month);
                    setViewMode('month');
                  }}
                >
                  {format(month, 'MMMM', { locale: es })}
                </button>
                <div className={styles.yearMonthWeekdays}>
                  {IOS_WEEKDAY_LABELS.map((day) => (
                    <span key={day} className={styles.yearWeekday}>
                      {day}
                    </span>
                  ))}
                </div>
                <div className={styles.yearMonthGrid}>
                  {monthDays.map((day) => {
                    const dayEvents = getEventsForDay(day);
                    const isToday = isSameDay(day, new Date());
                    const isCurrentMonth = day.getMonth() === month.getMonth();

                    const yearDateKey = toScheduleDateKey(day);
                    const yearShiftDisplay = canShowCalendarShifts
                      ? resolveUserDayShiftDisplay(
                          recentActivities,
                          events,
                          selectedTeamUserId,
                          yearDateKey,
                          calendarAvailability.entriesByDate.get(yearDateKey),
                          boundaries,
                        )
                      : null;
                    const yearShiftLocked =
                      calendarAvailabilityMode &&
                      canUseCalendarAvailability &&
                      (yearShiftDisplay?.lockedByActivities ?? false);

                    const handleDayClick = () => {
                      if (calendarAvailabilityMode && canUseCalendarAvailability) {
                        if (yearShiftLocked) return;
                        handleCalendarDayAvailability(day);
                        return;
                      }
                      setCurrentDate(day);
                      setViewMode('day');
                    };

                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={handleDayClick}
                        className={cx(
                          styles.yearDay,
                          !isCurrentMonth && styles.yearDayOtherMonth,
                          isToday && styles.yearDayToday,
                          calendarAvailabilityMode &&
                            canUseCalendarAvailability &&
                            styles.yearDayAvailabilityMode,
                          yearShiftLocked && styles.dayCellShiftLocked,
                        )}
                        aria-label={
                          calendarAvailabilityMode && canUseCalendarAvailability
                            ? yearShiftLocked
                              ? `${format(day, "d 'de' MMMM yyyy", { locale: es })}, turno fijado por actividad asignada`
                              : `${format(day, "d 'de' MMMM yyyy", { locale: es })}, pulsa para cambiar turno`
                            : format(day, "d 'de' MMMM yyyy", { locale: es })
                        }
                      >
                        <span className={styles.yearDayNumber}>{format(day, 'd')}</span>
                        {yearShiftDisplay && yearShiftDisplay.displayShifts.length > 0 ? (
                          <div className={styles.yearDayShiftFooter}>
                            <span className={styles.yearDayShiftRow}>
                              {yearShiftDisplay.displayShifts.map((shift) => (
                                <span
                                  key={shift}
                                  className={cx(
                                    styles.yearDayShift,
                                    yearShiftDisplay.lockedByActivities && styles.yearDayShiftAssigned,
                                  )}
                                  style={{
                                    color: yearShiftDisplay.lockedByActivities
                                      ? undefined
                                      : getShiftPaletteColor(shift, shiftColors),
                                    backgroundColor: yearShiftDisplay.lockedByActivities
                                      ? getShiftPaletteColor(shift, shiftColors)
                                      : undefined,
                                  }}
                                  title={SHIFT_META[shift].label}
                                >
                                  {SHIFT_META[shift].shortLabel}
                                </span>
                              ))}
                            </span>
                            {yearShiftDisplay.showActivityHours ? (
                              <span
                                className={styles.yearDayShiftHours}
                                title={formatUserDayShiftHoursTitle(yearShiftDisplay)}
                              >
                                {formatUserDayShiftHoursCompact(yearShiftDisplay)}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {dayEvents.length > 0 && (
                          <span className={styles.yearDayDots} aria-hidden>
                            {dayEvents.slice(0, 4).map((event) => (
                              <span
                                key={event.id}
                                className={styles.yearDot}
                                style={{ backgroundColor: getEventColor(event) }}
                              />
                            ))}
                            {dayEvents.length > 4 && (
                              <span className={styles.yearDotMore}>+</span>
                            )}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        ) : (
        <div className={styles.calendarMainShell}>
          <div className={cx(styles.monthCalendar, isCalendarCompact && styles.monthCalendarCompact)}>
            {IOS_WEEKDAY_LABELS.map((day) => (
              <div key={day} className={styles.weekday}>
                {day}
              </div>
            ))}
            {getDaysForMonth(currentDate).map((day, index) =>
              renderGridDayCell(day, index, {
                contextDate: currentDate,
                mode: 'month',
              }),
            )}
          </div>
        </div>
        )}
                </div>
              </section>
              </div>
            )}
            </div>
            {desktopGapBanner}
          </div>
          )}

          {isMobile && (
        <div
          className={cx(
            styles.calendarNavMobile,
            navMobileHidden && styles.calendarNavMobileHidden,
          )}
          role="toolbar"
          aria-label={
            displayMode === 'calendar' ? 'Acciones del calendario' : 'Acciones de la tabla'
          }
        >
          <div className={styles.calendarNavMobileActions}>
            <button
              type="button"
              onClick={openNew}
              className={styles.calendarNavMobileFooterPrimary}
              aria-label="Nueva actividad"
              title="Nueva actividad"
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Actividad
            </button>
          </div>
        </div>
      )}

          {showToolbarOptions && toolbarOptionsMenu && (
            <ContextMenu
              x={toolbarOptionsMenu.x}
              y={toolbarOptionsMenu.y}
              anchorX="center"
              ariaLabel="Opciones"
              onClose={() => setToolbarOptionsMenu(null)}
              items={toolbarOptionsItems}
            />
          )}

          <ConfirmDialog
            open={tableController.deleteViewConfirm !== null}
            title="Eliminar vista"
            message={
              tableController.deleteViewConfirm
                ? formatDeleteSavedViewConfirmMessage(
                    tableController.deleteViewConfirm.name,
                    tableController.deleteViewConfirm.isPrivate,
                  )
                : ''
            }
            onConfirm={tableController.confirmDeleteView}
            onCancel={tableController.cancelDeleteView}
          />
        </div>
      </div>
    </div>
  );
}
