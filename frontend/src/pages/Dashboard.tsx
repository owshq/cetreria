import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  authService,
  clientsService,
  activitiesService,
  eventsService,
  dashboardService,
  documentsService,
} from '@/api';
import ContentLoading from '@/components/ContentLoading';
import GlobalSearch from '@/components/GlobalSearch';
import QuickCreateModal from '@/components/QuickCreateModal';
import type { DashboardStats } from '@/api';
import type { Activity, CalendarEvent, Client, Document } from '@shared/types';
import {
  filterActivitiesAssignedToUser,
} from '@shared/types';
import ui from '@/styles/shared.module.css';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import DatePeriodFilters from '@/components/DatePeriodFilters';
import DashboardJobsSection from '@/components/DashboardJobsSection';
import RecentActivitiesSection from '@/components/RecentActivitiesSection';
import type { ActivityGroupBy, ActivityValueMeasure } from '@/components/clientCharts/utils';
import type {
  WorkShiftsGroupBy,
  WorkShiftsValueMeasure,
} from '@/lib/workShiftsChartUtils';
import PeriodMetricsChartSection, {
  type PeriodMetricButtonConfig,
} from '@/components/PeriodMetricsChartSection';
import {
  dashboardMetricForDimension,
  DASHBOARD_METRIC_CHART_PRESETS,
  type DashboardMetricKey,
  type MetricDimension,
} from '@/lib/metricChartConfig';
import { useDatePeriodFilter } from '@/hooks/useDatePeriodFilter';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatChangePercent, type MetricDeltaTone } from '@/lib/metricDelta';
import { buildPendingPeriodMetric } from '@/lib/periodMetricTiles';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import styles from './Dashboard.module.css';

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatNewClients(count: number): { text: string; tone: MetricDeltaTone } {
  if (count === 0) return { text: 'Sin altas en el periodo', tone: 'neutral' };
  if (count === 1) return { text: '1 contacto nuevo', tone: 'info' };
  return { text: `${count} contactos nuevos`, tone: 'info' };
}

const DASHBOARD_METRIC_KEYS: DashboardMetricKey[] = [
  'clients',
  'activities',
  'hours',
  'documents',
];

type DashboardChartsPanelPrefs = {
  expanded: boolean;
  metric: DashboardMetricKey;
};

function isDashboardMetricKey(value: unknown): value is DashboardMetricKey {
  return typeof value === 'string' && DASHBOARD_METRIC_KEYS.includes(value as DashboardMetricKey);
}

function readDashboardChartsPanelPrefs(): DashboardChartsPanelPrefs {
  try {
    const raw = readWorkspaceScopedStorage(storageKeys.dashboardChartsPanel);
    if (!raw) return { expanded: false, metric: 'clients' };

    const data = JSON.parse(raw) as Partial<DashboardChartsPanelPrefs>;
    const metric = isDashboardMetricKey(data.metric) ? data.metric : 'clients';
    const expanded = data.expanded === true;

    return { expanded, metric };
  } catch {
    return { expanded: false, metric: 'clients' };
  }
}

function writeDashboardChartsPanelPrefs(prefs: DashboardChartsPanelPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKeys.dashboardChartsPanel);
}

type DashboardActivitiesChartPanelPrefs = {
  expanded: boolean;
  groupBy: ActivityGroupBy;
  valueMeasure: ActivityValueMeasure;
};

function isActivityGroupBy(value: unknown): value is ActivityGroupBy {
  return value === 'type' || value === 'team';
}

function isActivityValueMeasure(value: unknown): value is ActivityValueMeasure {
  return value === 'hours' || value === 'income';
}

function readDashboardActivitiesChartPanelPrefs(): DashboardActivitiesChartPanelPrefs {
  try {
    const raw = readWorkspaceScopedStorage(storageKeys.dashboardActivitiesChartPanel);
    if (!raw) return { expanded: false, groupBy: 'type', valueMeasure: 'hours' };

    const data = JSON.parse(raw) as Partial<
      DashboardActivitiesChartPanelPrefs & { measure?: string }
    >;

    if (isActivityGroupBy(data.groupBy) && isActivityValueMeasure(data.valueMeasure)) {
      return {
        expanded: data.expanded === true,
        groupBy: data.groupBy,
        valueMeasure: data.valueMeasure,
      };
    }

    if (data.measure === 'team') {
      return { expanded: data.expanded === true, groupBy: 'team', valueMeasure: 'hours' };
    }
    if (data.measure === 'income') {
      return { expanded: data.expanded === true, groupBy: 'type', valueMeasure: 'income' };
    }

    return { expanded: data.expanded === true, groupBy: 'type', valueMeasure: 'hours' };
  } catch {
    return { expanded: false, groupBy: 'type', valueMeasure: 'hours' };
  }
}

function writeDashboardActivitiesChartPanelPrefs(prefs: DashboardActivitiesChartPanelPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKeys.dashboardActivitiesChartPanel);
}

type DashboardWorkShiftsChartPanelPrefs = {
  expanded: boolean;
  groupBy: WorkShiftsGroupBy;
  valueMeasure: WorkShiftsValueMeasure;
};

function isWorkShiftsGroupBy(value: unknown): value is WorkShiftsGroupBy {
  return value === 'team' || value === 'shift' || value === 'type';
}

function isWorkShiftsValueMeasure(value: unknown): value is WorkShiftsValueMeasure {
  return (
    value === 'hours' ||
    value === 'hoursSigned' ||
    value === 'hoursAssigned' ||
    value === 'income'
  );
}

function readDashboardWorkShiftsChartPanelPrefs(): DashboardWorkShiftsChartPanelPrefs {
  try {
    const raw = readWorkspaceScopedStorage(storageKeys.dashboardWorkShiftsChartPanel);
    if (!raw) return { expanded: false, groupBy: 'team', valueMeasure: 'hours' };

    const data = JSON.parse(raw) as Partial<DashboardWorkShiftsChartPanelPrefs>;
    return {
      expanded: data.expanded === true,
      groupBy: isWorkShiftsGroupBy(data.groupBy) ? data.groupBy : 'team',
      valueMeasure: isWorkShiftsValueMeasure(data.valueMeasure) ? data.valueMeasure : 'hours',
    };
  } catch {
    return { expanded: false, groupBy: 'team', valueMeasure: 'hours' };
  }
}

function writeDashboardWorkShiftsChartPanelPrefs(prefs: DashboardWorkShiftsChartPanelPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKeys.dashboardWorkShiftsChartPanel);
}

export default function Dashboard() {
  const { onActivitySaved, onDocumentSaved, openNew } = useActivityModal();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const currentUserId = currentUser?.id ?? '';
  const defaultMetricId: DashboardMetricKey = isAdmin ? 'clients' : 'documents';
  const {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateRange,
    periodFiltersRef,
    invalidCustomRange,
  } = useDatePeriodFilter();

  const metricComparison = { period, from: dateRange.from, to: dateRange.to };

  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { activityTypes } = useActivityTypes();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const savedChartsPrefs = useMemo(() => readDashboardChartsPanelPrefs(), []);
  const hasStoredChartsPrefs = useMemo(
    () => Boolean(readWorkspaceScopedStorage(storageKeys.dashboardChartsPanel)),
    [],
  );
  const initialMetric: DashboardMetricKey =
    !isAdmin && savedChartsPrefs.metric === 'clients'
      ? 'documents'
      : savedChartsPrefs.metric;
  const savedActivitiesChartPrefs = useMemo(() => readDashboardActivitiesChartPanelPrefs(), []);
  const savedWorkShiftsChartPrefs = useMemo(() => readDashboardWorkShiftsChartPanelPrefs(), []);
  const [chartsExpanded, setChartsExpanded] = useState(
    hasStoredChartsPrefs ? savedChartsPrefs.expanded : true,
  );
  const [selectedMetric, setSelectedMetric] = useState<DashboardMetricKey>(initialMetric);
  const [activitiesChartExpanded, setActivitiesChartExpanded] = useState(
    readWorkspaceScopedStorage(storageKeys.dashboardActivitiesChartPanel)
      ? savedActivitiesChartPrefs.expanded
      : true,
  );
  const [activitiesChartGroupBy, setActivitiesChartGroupBy] = useState<ActivityGroupBy>(
    savedActivitiesChartPrefs.groupBy,
  );
  const [activitiesChartValueMeasure, setActivitiesChartValueMeasure] =
    useState<ActivityValueMeasure>(savedActivitiesChartPrefs.valueMeasure);
  const [workShiftsChartExpanded, setWorkShiftsChartExpanded] = useState(
    readWorkspaceScopedStorage(storageKeys.dashboardWorkShiftsChartPanel)
      ? savedWorkShiftsChartPrefs.expanded
      : true,
  );
  const [workShiftsChartGroupBy, setWorkShiftsChartGroupBy] = useState<WorkShiftsGroupBy>(
    savedWorkShiftsChartPrefs.groupBy,
  );
  const [workShiftsChartValueMeasure, setWorkShiftsChartValueMeasure] =
    useState<WorkShiftsValueMeasure>(savedWorkShiftsChartPrefs.valueMeasure);
  const [chartControlsHost, setChartControlsHost] = useState<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    writeDashboardChartsPanelPrefs({
      expanded: chartsExpanded,
      metric: selectedMetric,
    });
  }, [chartsExpanded, selectedMetric]);

  useEffect(() => {
    writeDashboardActivitiesChartPanelPrefs({
      expanded: activitiesChartExpanded,
      groupBy: activitiesChartGroupBy,
      valueMeasure: activitiesChartValueMeasure,
    });
  }, [activitiesChartExpanded, activitiesChartGroupBy, activitiesChartValueMeasure]);

  useEffect(() => {
    writeDashboardWorkShiftsChartPanelPrefs({
      expanded: workShiftsChartExpanded,
      groupBy: workShiftsChartGroupBy,
      valueMeasure: workShiftsChartValueMeasure,
    });
  }, [workShiftsChartExpanded, workShiftsChartGroupBy, workShiftsChartValueMeasure]);

  const handleMetricSelect = (metric: DashboardMetricKey) => {
    if (chartsExpanded && selectedMetric === metric) {
      setChartsExpanded(false);
      return;
    }

    setSelectedMetric(metric);
    setChartsExpanded(true);
  };

  const handleChartDimensionChange = (dimension: MetricDimension) => {
    const alignedMetric = dashboardMetricForDimension(dimension);
    if (alignedMetric && alignedMetric !== selectedMetric) {
      setSelectedMetric(alignedMetric);
    }
  };

  const handleChartsToggle = () => {
    setChartsExpanded((expanded) => !expanded);
  };

  const handleActivitiesChartToggle = () => {
    setActivitiesChartExpanded((expanded) => !expanded);
  };

  const handleWorkShiftsChartToggle = () => {
    setWorkShiftsChartExpanded((expanded) => !expanded);
  };

  const loadDashboard = useCallback(async () => {
    if (period === 'custom' && (!customFrom || !customTo || customFrom > customTo)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [clientsResult, activitiesResult, eventsResult, statsResult, documentsResult] =
        await Promise.allSettled([
          clientsService.getAll(),
          activitiesService.getAll({ from: dateRange.from, to: dateRange.to }),
          eventsService.getAll(),
          dashboardService.getStats(dateRange.from, dateRange.to),
          documentsService.getAll(),
        ]);

      const nextClients = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
      if (clientsResult.status === 'fulfilled') setClients(nextClients);
      if (activitiesResult.status === 'fulfilled') setActivities(activitiesResult.value);
      if (eventsResult.status === 'fulfilled') setEvents(eventsResult.value);
      if (documentsResult.status === 'fulfilled') setDocuments(documentsResult.value);

      if (statsResult.status === 'fulfilled') {
        const apiStats = statsResult.value;
        setStats({
          ...apiStats,
          totalClients: apiStats.totalClients ?? apiStats.activeClients ?? nextClients.length,
          activeClients:
            apiStats.activeClients ??
            nextClients.filter((client) => client.status === 'active').length,
        });
      } else if (nextClients.length > 0) {
        setStats((previous) => ({
          ...(previous ?? {
            newClientsInPeriod: 0,
            periodActivities: 0,
            activitiesChangePercent: null,
            periodHours: 0,
            hoursChangePercent: null,
            pendingDocuments: 0,
            periodDocuments: 0,
            pendingDocumentsPercent: null,
            paidDocuments: 0,
            sentDocuments: 0,
            draftDocuments: 0,
            periodDocumentsAmount: 0,
            paidDocumentsAmount: 0,
            sentDocumentsAmount: 0,
            draftDocumentsAmount: 0,
            pendingDocumentsAmount: 0,
          }),
          totalClients: nextClients.length,
          activeClients: nextClients.filter((client) => client.status === 'active').length,
        }));
      }
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, period, customFrom, customTo]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => onActivitySaved(loadDashboard), [onActivitySaved, loadDashboard]);
  useEffect(() => onDocumentSaved(loadDashboard), [onDocumentSaved, loadDashboard]);

  const viewerActivities = useMemo(() => {
    if (isAdmin) return activities;
    if (!currentUserId) return [];
    return filterActivitiesAssignedToUser(activities, events, currentUserId);
  }, [isAdmin, activities, events, currentUserId]);

  const viewerDocuments = useMemo(() => {
    if (isAdmin) return documents;
    return documents;
  }, [isAdmin, documents]);

  const viewerClients = useMemo(() => {
    if (isAdmin) return clients;
    const clientIds = new Set(viewerActivities.map((activity) => activity.clientId));
    return clients.filter((client) => clientIds.has(client.id));
  }, [isAdmin, clients, viewerActivities]);

  const totalClientsMetric =
    stats?.totalClients ?? stats?.activeClients ?? clients.length;

  const dashboardMetrics = useMemo((): PeriodMetricButtonConfig[] => {
    const pendingCount = stats?.pendingDocuments ?? 0;

    const metrics: PeriodMetricButtonConfig[] = [];

    if (isAdmin) {
      metrics.push({
        id: 'clients',
        chartMetric: 'clients',
        chartPreset: DASHBOARD_METRIC_CHART_PRESETS.clients,
        title: 'Contactos',
        value: totalClientsMetric,
        delta: formatNewClients(stats?.newClientsInPeriod ?? 0),
      });
    }

    metrics.push(
      {
        id: 'activities',
        chartMetric: 'activities',
        chartPreset: DASHBOARD_METRIC_CHART_PRESETS.activities,
        title: 'Actividades',
        value: stats?.periodActivities ?? 0,
        delta: formatChangePercent(stats?.activitiesChangePercent, metricComparison),
      },
      {
        id: 'hours',
        chartMetric: 'hours',
        chartPreset: DASHBOARD_METRIC_CHART_PRESETS.hours,
        title: 'Horas trabajadas',
        value: `${stats?.periodHours ?? 0}h`,
        delta: formatChangePercent(stats?.hoursChangePercent, metricComparison),
      },
      buildPendingPeriodMetric(
        {
          pendingDocuments: pendingCount,
          pendingDocumentsAmount: stats?.pendingDocumentsAmount ?? 0,
          pendingDocumentsPercent: stats?.pendingDocumentsPercent ?? null,
        },
        metricComparison,
        { id: 'documents' },
      ),
    );

    return metrics;
  }, [metricComparison, stats, totalClientsMetric, isAdmin]);

  if (loading && !stats) {
    return <ContentLoading className={ui.page} />;
  }

  return (
    <div className={cx(ui.page, ui.tablePage, styles.dashboardPage)}>
      <div className={styles.dashboardHeaderBlock}>
      {currentUser && (
        <div className={styles.dashboardToolbarStack}>
          <div className={cx(ui.tableToolbar, styles.dashboardTableToolbar)}>
            <div className={cx(ui.filtersRow, styles.dashboardToolbarRow)}>
              <div className={styles.dashboardSearchWrapper}>
                <GlobalSearch toolbar hug />
              </div>
              <div className={cx(ui.toolbarBtnGroup, ui.toolbarEnd, styles.dashboardHeadingActions)}>
                <QuickCreateModal
                  onNewActivity={openNew}
                  isAdmin={isAdmin}
                  toolbarTrigger
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <DatePeriodFilters
        sectionLayout
        className={styles.filtersSection}
        panelClassName={styles.filtersCardAccent}
        headingTrailing={
          isDesktop ? (
            <div
              ref={setChartControlsHost}
              className={cx(
                styles.chartControlsHost,
                !(chartsExpanded && selectedMetric) && styles.chartControlsHostIdle,
              )}
            />
          ) : null
        }
        period={period}
        customFrom={customFrom}
        customTo={customTo}
        dateRange={dateRange}
        onPeriodChange={setPeriod}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        periodFiltersRef={periodFiltersRef}
        invalidCustomRange={invalidCustomRange}
      >
        <PeriodMetricsChartSection
          metrics={dashboardMetrics}
          selectedMetricId={selectedMetric}
          chartsExpanded={chartsExpanded}
          onMetricSelect={(metricId, chartMetric) => handleMetricSelect(chartMetric)}
          onChartsToggle={handleChartsToggle}
          onChartDimensionChange={handleChartDimensionChange}
          defaultMetricId={defaultMetricId}
          chartsPanelId="dashboard-charts-panel"
          activities={viewerActivities}
          events={events}
          activityTypes={activityTypes}
          clients={viewerClients}
          documents={viewerDocuments}
          from={dateRange.from}
          to={dateRange.to}
          invalidCustomRange={invalidCustomRange}
          isDesktop={isDesktop}
          chartControlsHost={chartControlsHost}
        />
      </DatePeriodFilters>
      </div>

      <div className={styles.dashboardTwoColGrid}>
        <section className={cx(ui.pageSectionFill, styles.dashboardHoverSection)}>
          <DashboardJobsSection
            activities={viewerActivities}
            events={events}
            clients={viewerClients}
            documents={viewerDocuments}
            activityTypes={activityTypes}
            from={dateRange.from}
            to={dateRange.to}
            invalidCustomRange={invalidCustomRange}
            plainSectionHeader
            cardClassName={styles.dashboardSectionCard}
            cardBodyClassName={styles.dashboardSectionCardBody}
            emptyStateClassName={styles.dashboardSectionEmpty}
            collapsibleChart
            chartExpanded={workShiftsChartExpanded}
            onChartToggle={handleWorkShiftsChartToggle}
            chartGroupBy={workShiftsChartGroupBy}
            chartValueMeasure={workShiftsChartValueMeasure}
            onChartGroupByChange={setWorkShiftsChartGroupBy}
            onChartValueMeasureChange={setWorkShiftsChartValueMeasure}
          />
        </section>

        <section className={cx(ui.pageSectionFill, styles.dashboardHoverSection)}>
          <RecentActivitiesSection
            activities={viewerActivities}
            events={events}
            clients={viewerClients}
            documents={viewerDocuments}
            activityTypes={activityTypes}
            from={dateRange.from}
            to={dateRange.to}
            invalidCustomRange={invalidCustomRange}
            plainSectionHeader
            cardClassName={styles.dashboardSectionCard}
            cardBodyClassName={styles.dashboardSectionCardBody}
            emptyStateClassName={styles.dashboardSectionEmpty}
            collapsibleDonutChart
            donutChartExpanded={activitiesChartExpanded}
            onDonutChartToggle={handleActivitiesChartToggle}
            donutChartGroupBy={activitiesChartGroupBy}
            donutChartValueMeasure={activitiesChartValueMeasure}
            onDonutChartGroupByChange={setActivitiesChartGroupBy}
            onDonutChartValueMeasureChange={setActivitiesChartValueMeasure}
          />
        </section>
      </div>
    </div>
  );
}
