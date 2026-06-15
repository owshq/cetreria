import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowDownToLine,
  ArrowLeft,
  ExternalLink,
  FilePlus,
  Plus,
  CircleMinus,
  MoreVertical,
  Search,
} from 'lucide-react';
import {
  activitiesService,
  clientGroupsService,
  clientsService,
  documentsService,
  eventsService,
  reportsService,
  usersService,
} from '@/api';
import type { ReportSummary } from '@/api';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  ClientGroup,
  Document,
  MonthlyReport,
  UserAssignee,
} from '@shared/types';
import {
  formatDocumentAmount,
  formatHoursMinutes,
  formatPeriodDisplayLabel,
  DEFAULT_CLIENT_GROUP_NAME,
  getActivityTypeLabel,
  getPreviousDateRange,
  aggregateInvoiceConcepts,
  isDateInRange,
  documentMetricsForRange,
  documentTypeMetricsForRange,
  documentTypeMetricsForDocuments,
  reportOverlapsRange,
  countClientsWithPeriodData,
  getPeriodDocuments,
  clientHasPeriodData,
  matchesClientScope,
  resolveClientScope,
  getAssignedClientIdsForUser,
  filterActivitiesAssignedToUser,
} from '@shared/types';
import PeriodMetricsChartSection, {
  type PeriodMetricButtonConfig,
} from '@/components/PeriodMetricsChartSection';
import periodMetricsStyles from '@/components/PeriodMetricsChartSection.module.css';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import ui from '@/styles/shared.module.css';
import { cx } from '@/lib/cx';
import { scrollRegionProps, scrollPaneProps } from '@/lib/scrollRegion';
import { SearchField } from '@/components/forms';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import SidebarToggle from '@/components/SidebarToggle';
import UserAvatar from '@/components/UserAvatar';
import { buildReportPreviewHeader, type ReportPreviewAuthor, type ReportPreviewHeader } from '@/lib/reportHeaderMeta';
import EmptyState from '@/components/EmptyState';
import ContextMenu from '@/components/ContextMenu';
import DatePeriodFilters from '@/components/DatePeriodFilters';
import ChartSectionToggle from '@/components/ChartSectionToggle';
import { computeClientPeriodStats } from '@/lib/clientPeriodStats';
import {
  buildTeamShiftBreakdown,
  buildWorkerPeriodRows,
  computeTeamPeriodStats,
  formatWorkerShiftSummary,
  sumWorkerHoursForActivities,
  workerActivitiesInRange,
  workerDocumentsInRange,
  workerHasPeriodData,
  workerReportHoursOnActivity,
  workerInvoiceConceptsInRange,
  workerPeriodDisplayHours,
  type TeamPeriodStats,
  type WorkerPeriodRow,
} from '@/lib/workerPeriodStats';
import { buildWorkerActivityDetailRows } from '@/lib/workerActivityDetailReport';
import {
  buildWorkerDetailedReportFilename,
  downloadWorkerDetailedReportCsv,
} from '@/lib/workerDetailedReportCsv';
import { teamUserIdToUrlParam } from '@/lib/activitiesTeamFilter';
import {
  dashboardMetricForDimension,
  type DashboardMetricKey,
  type MetricDimension,
} from '@/lib/metricChartConfig';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import InvoiceConceptsSection from '@/components/InvoiceConceptsSection';
import RecentActivitiesSection from '@/components/RecentActivitiesSection';
import ReportBreakdownDonutChart, {
  hasReportBreakdownChartData,
  ReportBreakdownChartToggles,
  type ReportBreakdownMeasure,
} from '@/components/ReportBreakdownDonutChart';
import type { ActivityGroupBy, ActivityValueMeasure } from '@/components/clientCharts/utils';
import { buildTypeBuckets, toChartData } from '@/components/clientCharts/utils';
import { useChartThemeVersion } from '@/hooks/useChartThemeVersion';
import type { ChartMode } from '@/components/clientCharts/ClientActivityTypeChart';
import { authService } from '@/api/auth';
import {
  buildPdfParamsFromMonthlyReport,
  downloadMonthlyReportPdf,
  generateAndSaveSummaryReport,
  pdfParamsFromSavedReport,
  type SaveReportScope,
} from '@/lib/savedReportPdf';
import { getReportGenerateTooltip } from '@/lib/reportGenerateTooltip';
import {
  buildSummaryReportPdfBlob,
  type BuildSummaryReportPdfParams,
} from '@/lib/summaryReportPdf';
import { normalizeReportKind, REPORT_KIND_LABELS } from '@shared/types';
import type { ReportBreakdownRow } from '@/lib/reportInstitutionalText';
import { resolveReportKind, type ReportKind } from '@shared/types';
import ReportsKindNav, {
  type ReportsKindNavOption,
  type SavedReportKindFilter,
} from '@/components/ReportsKindNav';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { SidebarFooter, SidebarFooterAction } from '@/components/SidebarFooter';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useWorkspace } from '@/context/useWorkspace';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { useDatePeriodFilter, REPORTS_PERIOD_FILTER_STORAGE_KEY } from '@/hooks/useDatePeriodFilter';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSavedReportHighlight } from '@/hooks/useSavedReportHighlight';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { groupReportsByDateSection } from '@/lib/reportDateSections';
import {
  buildDocumentsPeriodMetric,
  buildWorkPeriodMetric,
} from '@/lib/periodMetricTiles';
import headerStyles from '@/components/DetailPageHeader.module.css';
import dashboardStyles from './Dashboard.module.css';
import documentDetailStyles from './DocumentDetail.module.css';
import styles from './Reports.module.css';

const WORKSPACE_REPORT_KINDS: ReportKind[] = [
  'general',
  'contacts_global',
  'workers_global',
];

const SAVED_REPORT_KIND_ORDER: ReportKind[] = [
  'workers_global',
  'contact',
  'worker',
  'general',
  'contacts_global',
];

function resolveSavedReportKind(report: MonthlyReport): ReportKind {
  if (report.reportKind) return normalizeReportKind(report.reportKind);
  return resolveReportKind({
    clientId: report.clientId,
    workerUserId: report.workerUserId,
  });
}

function resolveWorkspaceReportLabel(
  reportKind: ReportKind,
  clientsGlobalReportScopeName: string,
): string {
  if (reportKind === 'contacts_global') {
    return `Informe de ${clientsGlobalReportScopeName}`;
  }
  return REPORT_KIND_LABELS[reportKind];
}

function savedReportTitle(
  report: MonthlyReport,
  client: Client | undefined,
  clientsGlobalReportScopeName: string,
): string {
  if (report.reportKind && WORKSPACE_REPORT_KINDS.includes(report.reportKind)) {
    return resolveWorkspaceReportLabel(report.reportKind, clientsGlobalReportScopeName);
  }
  if (report.reportLabel?.trim()) return report.reportLabel.trim();
  return client?.name ?? 'Cliente desconocido';
}

const REPORTS_PERIOD_METRIC_IDS = ['documents', 'work'] as const;
type ReportsPeriodMetricId = (typeof REPORTS_PERIOD_METRIC_IDS)[number];

type ReportsChartsPanelPrefs = {
  expanded: boolean;
  metricId: ReportsPeriodMetricId;
};

function normalizeReportsPeriodMetricId(value: unknown): ReportsPeriodMetricId {
  if (value === 'paid' || value === 'pending') return 'documents';
  if (value === 'activities' || value === 'hours') return 'work';
  if (
    typeof value === 'string' &&
    REPORTS_PERIOD_METRIC_IDS.includes(value as ReportsPeriodMetricId)
  ) {
    return value as ReportsPeriodMetricId;
  }
  return 'documents';
}

function readReportsChartsPanelPrefs(): ReportsChartsPanelPrefs {
  try {
    const raw = readWorkspaceScopedStorage(storageKeys.reportsChartsPanel);
    if (!raw) return { expanded: false, metricId: 'documents' };

    const data = JSON.parse(raw) as Partial<ReportsChartsPanelPrefs>;
    return {
      expanded: data.expanded === true,
      metricId: normalizeReportsPeriodMetricId(data.metricId),
    };
  } catch {
    return { expanded: false, metricId: 'documents' };
  }
}

function writeReportsChartsPanelPrefs(prefs: ReportsChartsPanelPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKeys.reportsChartsPanel);
}

type ReportsMainView = 'idle' | 'generate' | 'preview';

function resolveReportAuthor(
  report: Pick<MonthlyReport, 'generatedBy' | 'generatedByName'> | null | undefined,
  usersById: Map<string, UserAssignee>,
): ReportPreviewAuthor | null {
  if (!report) return null;

  const user = report.generatedBy ? usersById.get(report.generatedBy) : undefined;
  const name = report.generatedByName ?? user?.name;
  if (!name) return null;

  return {
    name,
    avatarUrl: user?.avatarUrl,
  };
}

function buildSavedReportSearchHaystack(
  report: MonthlyReport,
  client: Client | undefined,
  activityTypes: ActivityType[],
): string {
  const parts = [
    client?.name ?? '',
    client?.email ?? '',
    client?.phone ?? '',
    client?.address ?? '',
    `${report.month}/${report.year}`,
    `${report.month}-${report.year}`,
    String(report.totalHours),
    String(report.activities.length),
    report.generatedByName ?? '',
    format(parseISO(report.generatedAt), 'd MMM yyyy HH:mm', { locale: es }),
  ];

  report.activities.forEach((activity) => {
    parts.push(activity.description);
    parts.push(getActivityTypeLabel(activity.type, activityTypes));
    parts.push(String(activity.hours));
    parts.push(format(parseISO(activity.date), 'dd/MM/yyyy'));
    parts.push(format(parseISO(activity.date), 'yyyy-MM-dd'));
    activity.attachments.forEach((attachment) => parts.push(attachment.filename));
  });

  return parts.join(' ').toLowerCase();
}

function matchesSavedReportSearch(
  report: MonthlyReport,
  client: Client | undefined,
  activityTypes: ActivityType[],
  term: string,
): boolean {
  const normalizedTerm = term.toLowerCase().trim();
  if (!normalizedTerm) return true;

  const haystack = buildSavedReportSearchHaystack(report, client, activityTypes);
  const tokens = normalizedTerm.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

type ReportsGenerateTab = 'contacts' | 'workers' | 'summary';

const REPORTS_GENERATE_TABS: { id: ReportsGenerateTab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'contacts', label: 'Clientes' },
  { id: 'workers', label: 'Operarios' },
];

function ClientPeriodDocumentMeta({
  deliveryNoteCount,
  invoiceCount,
  hasLeadingContent,
}: {
  deliveryNoteCount: number;
  invoiceCount: number;
  hasLeadingContent: boolean;
}) {
  const parts: React.ReactNode[] = [];

  if (deliveryNoteCount > 0) {
    parts.push(
      <>
        {deliveryNoteCount} {deliveryNoteCount === 1 ? 'albarán' : 'albaranes'}
      </>,
    );
  }

  if (invoiceCount > 0) {
    parts.push(
      <>
        {invoiceCount} {invoiceCount === 1 ? 'factura' : 'facturas'}
      </>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <>
      {hasLeadingContent ? ' • ' : ''}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' • ' : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function WorkerPeriodActivityMeta({
  row,
  workerSignaturesEnabled,
  shiftSchedulingEnabled,
}: {
  row: Pick<
    WorkerPeriodRow,
    | 'totalHours'
    | 'assignedHours'
    | 'signedHours'
    | 'pendingHours'
    | 'signedActivityCount'
    | 'unsignedActivityCount'
    | 'shiftHours'
  >;
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
}) {
  const shiftSummary =
    shiftSchedulingEnabled && formatWorkerShiftSummary(row.shiftHours)
      ? formatWorkerShiftSummary(row.shiftHours)
      : '';

  const displayHours = workerPeriodDisplayHours(row, workerSignaturesEnabled);
  const hoursLabel = workerSignaturesEnabled
    ? 'asig.'
    : shiftSchedulingEnabled
      ? 'asig.'
      : 'reg.';

  if (displayHours <= 0 && !shiftSummary) return null;

  return (
    <>
      {displayHours > 0 && (
        <>
          {' '}
          • {formatHoursMinutes(displayHours) ?? '0m'} {hoursLabel}
          {workerSignaturesEnabled && row.signedHours > 0 && (
            <> · {formatHoursMinutes(row.signedHours)} firm.</>
          )}
          {workerSignaturesEnabled && row.pendingHours > 0 && (
            <> · {formatHoursMinutes(row.pendingHours)} pend.</>
          )}
        </>
      )}
      {workerSignaturesEnabled &&
      (row.signedActivityCount > 0 || row.unsignedActivityCount > 0) ? (
        <>
          {' '}
          • {row.signedActivityCount} firmada
          {row.signedActivityCount === 1 ? '' : 's'}
          {row.unsignedActivityCount > 0 && (
            <>
              {' '}
              / {row.unsignedActivityCount} sin firma
            </>
          )}
        </>
      ) : null}
      {shiftSummary ? <> • {shiftSummary}</> : null}
    </>
  );
}

function WorkerPeriodDocumentMeta({
  row,
  hasLeadingContent,
}: {
  row: WorkerPeriodRow;
  hasLeadingContent: boolean;
}) {
  const deliveryAmount =
    row.deliveryNotesPaidAmount > 0
      ? row.deliveryNotesPaidAmount
      : row.deliveryNotesTotalAmount;
  const deliveryAmountLabel =
    row.deliveryNotesPaidAmount > 0 ? 'cobrado en albaranes' : 'total en albaranes';
  const invoiceAmount =
    row.invoicesPaidAmount > 0 ? row.invoicesPaidAmount : row.invoicesTotalAmount;
  const invoiceAmountLabel =
    row.invoicesPaidAmount > 0 ? 'cobrado en facturas' : 'total en facturas';

  const parts: React.ReactNode[] = [];

  if (row.deliveryNoteCount > 0) {
    parts.push(
      <>
        {row.deliveryNoteCount}{' '}
        {row.deliveryNoteCount === 1 ? 'albarán' : 'albaranes'}
        {deliveryAmount > 0 ? (
          <>
            {' '}
            · {formatDocumentAmount(deliveryAmount)} {deliveryAmountLabel}
          </>
        ) : null}
        {row.deliveryNoteConceptCount > 0 ? (
          <>
            {' '}
            · {row.deliveryNoteConceptCount}{' '}
            {row.deliveryNoteConceptCount === 1 ? 'concepto' : 'conceptos'}
          </>
        ) : null}
      </>,
    );
  }

  if (row.invoiceCount > 0) {
    parts.push(
      <>
        {row.invoiceCount} {row.invoiceCount === 1 ? 'factura' : 'facturas'}
        {invoiceAmount > 0 ? (
          <>
            {' '}
            · {formatDocumentAmount(invoiceAmount)} {invoiceAmountLabel}
          </>
        ) : null}
        {row.invoiceConceptCount > 0 ? (
          <>
            {' '}
            · {row.invoiceConceptCount}{' '}
            {row.invoiceConceptCount === 1 ? 'concepto' : 'conceptos'}
          </>
        ) : null}
      </>,
    );
  }

  if (parts.length === 0) return null;

  return (
    <>
      {hasLeadingContent ? ' • ' : ''}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? ' • ' : null}
          {part}
        </Fragment>
      ))}
    </>
  );
}

function TeamPeriodSummary({
  stats,
  workerSignaturesEnabled,
  shiftSchedulingEnabled,
}: {
  stats: TeamPeriodStats;
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
}) {
  const shiftSummary =
    shiftSchedulingEnabled && formatWorkerShiftSummary(stats.shiftHours)
      ? formatWorkerShiftSummary(stats.shiftHours)
      : '';

  return (
    <p className={cx(ui.textMuted, styles.teamPeriodSummary)}>
      {stats.activityCount} {stats.activityCount === 1 ? 'actividad' : 'actividades'}
      {stats.assignedHours > 0 && (
        <>
          {' · '}
          {formatHoursMinutes(stats.assignedHours) ?? '0m'}{' '}
          {workerSignaturesEnabled || shiftSchedulingEnabled ? 'asignadas' : 'registradas'}
          {workerSignaturesEnabled ? (
            <>
              {' · '}
              {formatHoursMinutes(stats.signedHours) ?? '0m'} firmadas
              {stats.pendingHours > 0 ? (
                <>
                  {' · '}
                  {formatHoursMinutes(stats.pendingHours)} pendientes
                </>
              ) : null}
              {' · '}
              {stats.signedActivityCount} firmadas / {stats.unsignedActivityCount} sin firma
            </>
          ) : null}
        </>
      )}
      {shiftSummary ? <> · {shiftSummary}</> : null}
    </p>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams<{ reportId?: string }>();
  const [searchParams] = useSearchParams();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const currentUserId = currentUser?.id ?? '';
  const reportsDefaultMetricId: ReportsPeriodMetricId = isAdmin ? 'documents' : 'work';
  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav, setCollapsed: setSecondaryNavCollapsed } =
    useSecondaryNavCollapsed('reports');
  const isMobile = !useMediaQuery('(min-width: 768px)');

  const openClientReport = (clientId: string) => {
    navigate(`/clients/${clientId}`, { state: { returnTo: '/reports' } });
  };

  const openWorkerActivities = (userId: string) => {
    navigate(`/activities?userId=${teamUserIdToUrlParam(userId)}`, {
      state: { returnTo: '/reports' },
    });
  };

  useEffect(() => {
    const legacyClientId = searchParams.get('client');
    if (!legacyClientId) return;
    navigate(`/clients/${legacyClientId}`, { replace: true, state: { returnTo: '/reports' } });
  }, [searchParams, navigate]);

  const periodFilter = useDatePeriodFilter(REPORTS_PERIOD_FILTER_STORAGE_KEY);
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
  } = periodFilter;

  const metricComparison = { period, from: dateRange.from, to: dateRange.to };
  const savedChartsPrefs = useMemo(() => readReportsChartsPanelPrefs(), []);
  const initialReportsMetricId: ReportsPeriodMetricId =
    !isAdmin && savedChartsPrefs.metricId === 'documents'
      ? 'work'
      : savedChartsPrefs.metricId;
  const [chartsExpanded, setChartsExpanded] = useState(savedChartsPrefs.expanded);
  const [selectedPeriodMetricId, setSelectedPeriodMetricId] = useState<ReportsPeriodMetricId | null>(
    savedChartsPrefs.expanded ? initialReportsMetricId : null,
  );
  const [chartControlsHost, setChartControlsHost] = useState<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const selectedClientIds: string[] = [];
  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [users, setUsers] = useState<UserAssignee[]>([]);
  const { activityTypes } = useActivityTypes();
  const { currentWorkspace } = useWorkspace();
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const companyName = currentWorkspace?.name ?? 'Empresa';
  const [monthlyData, setMonthlyData] = useState<ReportSummary[]>([]);
  const [savedReports, setSavedReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const clientSearchInputRef = useRef<HTMLInputElement>(null);
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [workerSearchOpen, setWorkerSearchOpen] = useState(false);
  const workerSearchInputRef = useRef<HTMLInputElement>(null);
  const [savedSearchTerm, setSavedSearchTerm] = useState('');
  const [savedReportKindFilter, setSavedReportKindFilter] = useState<SavedReportKindFilter>('all');
  const [mainView, setMainView] = useState<ReportsMainView>(() => {
    if (typeof window === 'undefined') return 'generate';
    return window.matchMedia('(max-width: 767px)').matches ? 'idle' : 'generate';
  });
  const mobileShowMain = isMobile && (mainView === 'generate' || mainView === 'preview');
  useEffect(() => {
    if (!isMobile && mainView === 'idle') {
      setMainView('generate');
    }
  }, [isMobile, mainView]);

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewHeader, setPreviewHeader] = useState<ReportPreviewHeader | null>(null);
  const previewReportIdRef = useRef<string | null>(null);
  const routePreviewLoadRef = useRef<string | null>(null);
  const reportsSecondarySidebarExpanded = !secondaryNavCollapsed;
  useLayoutSecondarySidebarWidth(reportsSecondarySidebarExpanded);
  const [chartMode] = useState<ChartMode>('bars');
  const [conceptsChartExpanded, setConceptsChartExpanded] = useState(false);
  const [activitiesChartExpanded, setActivitiesChartExpanded] = useState(false);
  const [clientsChartExpanded, setClientsChartExpanded] = useState(false);
  const [workersChartExpanded, setWorkersChartExpanded] = useState(false);
  const [clientsChartMeasure, setClientsChartMeasure] = useState<ReportBreakdownMeasure>('hours');
  const [workersChartMeasure, setWorkersChartMeasure] = useState<ReportBreakdownMeasure>('hours');
  const [activitiesChartGroupBy, setActivitiesChartGroupBy] = useState<ActivityGroupBy>('type');
  const [activitiesChartValueMeasure, setActivitiesChartValueMeasure] =
    useState<ActivityValueMeasure>('hours');
  const [activeGenerateTab, setActiveGenerateTab] = useState<ReportsGenerateTab>('summary');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportActionMenu, setReportActionMenu] = useState<{
    x: number;
    y: number;
    report: MonthlyReport;
  } | null>(null);
  const [sidebarDownloadMenu, setSidebarDownloadMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { highlightedReportId, highlightReport } = useSavedReportHighlight();
  const savedReportsSectionRef = useRef<HTMLDivElement>(null);
  const chartThemeVersion = useChartThemeVersion();

  useEffect(() => {
    if (!workerSignaturesEnabled && workersChartMeasure === 'signatures') {
      setWorkersChartMeasure('hours');
    }
  }, [workerSignaturesEnabled, workersChartMeasure]);

  const loadClients = async () => {
    const [clientsResult, docsResult, usersResult, groupsResult] = await Promise.allSettled([
      clientsService.getAll(),
      documentsService.getAll(),
      usersService.getAssignees(),
      clientGroupsService.getAll(),
    ]);

    setClients(clientsResult.status === 'fulfilled' ? clientsResult.value : []);
    setDocuments(docsResult.status === 'fulfilled' ? docsResult.value : []);
    setUsers(usersResult.status === 'fulfilled' ? usersResult.value : []);
    setClientGroups(groupsResult.status === 'fulfilled' ? groupsResult.value : []);

    const failed = [clientsResult, docsResult, usersResult].find(
      (result) => result.status === 'rejected',
    );
    if (failed?.status === 'rejected') {
      const message =
        failed.reason instanceof Error
          ? failed.reason.message
          : 'No se pudieron cargar los datos del informe.';
      throw new Error(message);
    }
  };

  const loadSavedReports = async () => {
    setSavedReports(await reportsService.getAll());
  };

  const loadSummary = async () => {
    if (invalidCustomRange) {
      setMonthlyData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await reportsService.getPeriodSummary(
        dateRange.from,
        dateRange.to,
        selectedClientIds,
      );
      setMonthlyData(data);
    } catch (error) {
      setMonthlyData([]);
      setDataError(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar el resumen del periodo.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    let cancelled = false;
    setDataError(null);

    void (async () => {
      try {
        await loadClients();
        if (cancelled) return;
        await loadSavedReports();
      } catch (error) {
        if (cancelled) return;
        setClients([]);
        setDocuments([]);
        setUsers([]);
        setSavedReports([]);
        setDataError(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar los datos. Comprueba la sesión y el workspace.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
    };
  }, [previewPdfUrl]);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    void loadSummary();
  }, [currentWorkspace?.id, dateRange.from, dateRange.to, selectedClientIds, invalidCustomRange]);

  useEffect(() => {
    writeReportsChartsPanelPrefs({
      expanded: chartsExpanded,
      metricId: selectedPeriodMetricId ?? reportsDefaultMetricId,
    });
  }, [chartsExpanded, selectedPeriodMetricId, reportsDefaultMetricId]);

  const handlePeriodMetricSelect = (metricId: string, _chartMetric: DashboardMetricKey) => {
    const nextId = metricId as ReportsPeriodMetricId;
    if (chartsExpanded && selectedPeriodMetricId === nextId) {
      setChartsExpanded(false);
      setSelectedPeriodMetricId(null);
      return;
    }

    setSelectedPeriodMetricId(nextId);
    setChartsExpanded(true);
  };

  const handleChartDimensionChange = (dimension: MetricDimension) => {
    const alignedMetric = dashboardMetricForDimension(dimension);
    if (alignedMetric === 'documents' && isAdmin) {
      setSelectedPeriodMetricId('documents');
    } else if (
      dimension === 'activity' ||
      dimension === 'team' ||
      dimension === 'time' ||
      alignedMetric === 'activities' ||
      alignedMetric === 'hours'
    ) {
      setSelectedPeriodMetricId('work');
    }
  };

  const handleChartsToggle = () => {
    if (chartsExpanded) {
      setChartsExpanded(false);
      setSelectedPeriodMetricId(null);
      return;
    }

    setChartsExpanded(true);
    setSelectedPeriodMetricId(reportsDefaultMetricId);
  };

  useEffect(() => {
    if (!currentWorkspace?.id || invalidCustomRange) {
      setActivities([]);
      return;
    }

    let cancelled = false;
    const prevRange = getPreviousDateRange(dateRange.from, dateRange.to);

    void (async () => {
      const [activitiesResult, eventsResult] = await Promise.allSettled([
        activitiesService.getAll({ from: prevRange.from, to: dateRange.to }),
        eventsService.getAll(),
      ]);

      if (cancelled) return;

      setActivities(activitiesResult.status === 'fulfilled' ? activitiesResult.value : []);
      setEvents(eventsResult.status === 'fulfilled' ? eventsResult.value : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id, dateRange.from, dateRange.to, invalidCustomRange]);

  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const assignedClientIds = useMemo(() => {
    if (isAdmin || !currentUserId) return null;
    return new Set(getAssignedClientIdsForUser(activities, events, currentUserId));
  }, [isAdmin, currentUserId, activities, events]);

  const operatorActivities = useMemo(() => {
    if (isAdmin) return activities;
    if (!currentUserId) return [];
    return filterActivitiesAssignedToUser(activities, events, currentUserId);
  }, [isAdmin, activities, events, currentUserId]);

  const operatorDocuments = useMemo(() => {
    if (isAdmin) return documents;
    return documents;
  }, [isAdmin, documents]);

  const accessibleClients = useMemo(() => {
    if (isAdmin) return clients;
    if (!assignedClientIds) return [];
    return clients.filter((client) => assignedClientIds.has(client.id));
  }, [isAdmin, clients, assignedClientIds]);

  const accessibleUsers = useMemo(() => {
    if (isAdmin) return users;
    if (!currentUserId) return [];
    return users.filter((user) => user.id === currentUserId);
  }, [isAdmin, users, currentUserId]);

  const accessibleSavedReports = useMemo(() => {
    if (isAdmin) return savedReports;
    if (!currentUserId) return [];
    return savedReports.filter((report) => report.generatedBy === currentUserId);
  }, [isAdmin, savedReports, currentUserId]);

  const hasClientFilter = selectedClientIds.length > 0;
  const reportClientScope = useMemo(() => {
    if (!isAdmin && assignedClientIds) {
      const scopedIds =
        selectedClientIds.length > 0
          ? selectedClientIds.filter((id) => assignedClientIds.has(id))
          : [...assignedClientIds];
      return resolveClientScope(scopedIds);
    }
    return resolveClientScope(selectedClientIds);
  }, [isAdmin, selectedClientIds, assignedClientIds]);

  const scopedActivities = useMemo(() => {
    if (invalidCustomRange) return [];
    const sourceActivities = isAdmin ? activities : operatorActivities;
    return sourceActivities.filter((activity) =>
      matchesClientScope(activity.clientId, reportClientScope),
    );
  }, [isAdmin, activities, operatorActivities, reportClientScope, invalidCustomRange]);

  const savedForPeriod = useMemo(
    () =>
      accessibleSavedReports.filter((report) => {
        if (!reportOverlapsRange(report, dateRange.from, dateRange.to)) return false;
        if (!hasClientFilter) return true;
        if (report.reportKind && WORKSPACE_REPORT_KINDS.includes(report.reportKind)) {
          return true;
        }
        return selectedClientIds.includes(report.clientId);
      }),
    [accessibleSavedReports, dateRange.from, dateRange.to, selectedClientIds, hasClientFilter],
  );

  const periodDocumentCountsByClientId = useMemo(() => {
    const counts = new Map<string, { deliveryNoteCount: number; invoiceCount: number }>();
    getPeriodDocuments(documents, dateRange.from, dateRange.to, reportClientScope).forEach(
      (doc) => {
        const current = counts.get(doc.clientId) ?? { deliveryNoteCount: 0, invoiceCount: 0 };
        if (doc.type === 'invoice') {
          current.invoiceCount += 1;
        } else {
          current.deliveryNoteCount += 1;
        }
        counts.set(doc.clientId, current);
      },
    );
    return counts;
  }, [documents, dateRange.from, dateRange.to, reportClientScope]);

  const allPeriodActivities = useMemo(
    () => monthlyData.flatMap((data) => data.activities),
    [monthlyData],
  );

  const activityClientIds = useMemo(
    () =>
      monthlyData
        .map((data) => data.client?.id)
        .filter((id): id is string => Boolean(id)),
    [monthlyData],
  );

  const reportsPeriodStats = useMemo(() => {
    if (invalidCustomRange) return null;
    return computeClientPeriodStats(
      operatorActivities,
      operatorDocuments,
      reportClientScope,
      dateRange.from,
      dateRange.to,
    );
  }, [
    operatorActivities,
    operatorDocuments,
    reportClientScope,
    dateRange.from,
    dateRange.to,
    invalidCustomRange,
  ]);

  const chartClients = useMemo(() => {
    const sourceClients = accessibleClients;
    if (!hasClientFilter) return sourceClients;
    const selected = new Set(selectedClientIds);
    return sourceClients.filter((client) => selected.has(client.id));
  }, [accessibleClients, hasClientFilter, selectedClientIds]);

  const chartActivities = useMemo(() => {
    if (invalidCustomRange) return [];
    return scopedActivities.filter((activity) =>
      isDateInRange(activity.date, dateRange.from, dateRange.to),
    );
  }, [scopedActivities, dateRange.from, dateRange.to, invalidCustomRange]);

  const clientsWithPeriodDataCount = useMemo(() => {
    if (invalidCustomRange) return 0;
    return countClientsWithPeriodData(
      chartActivities.map((activity) => activity.clientId),
      operatorDocuments,
      dateRange.from,
      dateRange.to,
      reportClientScope,
    );
  }, [
    chartActivities,
    operatorDocuments,
    dateRange.from,
    dateRange.to,
    reportClientScope,
    invalidCustomRange,
  ]);

  const reportsPeriodMetrics = useMemo((): PeriodMetricButtonConfig[] => {
    if (!reportsPeriodStats) return [];

    const metrics: PeriodMetricButtonConfig[] = [];

    if (isAdmin) {
      const extraSubLine = [
        !hasClientFilter
          ? `${clientsWithPeriodDataCount} clientes con datos`
          : null,
        `${savedForPeriod.length} informes en el periodo`,
      ]
        .filter(Boolean)
        .join(' · ');

      metrics.push(
        buildDocumentsPeriodMetric(
          {
            ...reportsPeriodStats,
            extraSubLine: extraSubLine || undefined,
          },
          metricComparison,
        ),
      );
    }

    metrics.push(
      buildWorkPeriodMetric(
        {
          activityCount: reportsPeriodStats.activityCount,
          activitiesChangePercent: reportsPeriodStats.activitiesChangePercent,
          periodHours: reportsPeriodStats.periodHours,
          hoursChangePercent: reportsPeriodStats.hoursChangePercent,
          avgHoursPerActivity: reportsPeriodStats.avgHoursPerActivity,
          avgRevenuePerHour: reportsPeriodStats.avgRevenuePerHour,
        },
        metricComparison,
      ),
    );

    return metrics;
  }, [
    reportsPeriodStats,
    metricComparison,
    clientsWithPeriodDataCount,
    savedForPeriod.length,
    hasClientFilter,
    isAdmin,
  ]);

  const periodLabel = formatPeriodDisplayLabel(period, dateRange.from, dateRange.to);

  const chartData = useMemo(
    () => toChartData(buildTypeBuckets(allPeriodActivities, activityTypes)),
    [allPeriodActivities, activityTypes, chartThemeVersion],
  );

  const clientScopeLabel = useMemo(() => {
    if (!hasClientFilter) return 'Todos los clientes';
    if (selectedClientIds.length === 1) {
      return clientsMap.get(selectedClientIds[0])?.name ?? 'Cliente seleccionado';
    }
    return `${selectedClientIds.length} clientes seleccionados`;
  }, [hasClientFilter, selectedClientIds, clientsMap]);

  const clientGroupsById = useMemo(
    () => new Map(clientGroups.map((group) => [group.id, group])),
    [clientGroups],
  );

  const clientsGlobalReportScopeName = useMemo(() => {
    if (!hasClientFilter) {
      const defaultGroup =
        clientGroups.find((group) => group.isDefault) ??
        clientGroups.find((group) => group.name === DEFAULT_CLIENT_GROUP_NAME);
      return defaultGroup?.name ?? DEFAULT_CLIENT_GROUP_NAME;
    }

    const scopedClients = selectedClientIds
      .map((id) => clientsMap.get(id))
      .filter((client): client is Client => Boolean(client));
    const groupIds = [...new Set(scopedClients.map((client) => client.groupId))];

    if (groupIds.length === 1) {
      return clientGroupsById.get(groupIds[0])?.name ?? DEFAULT_CLIENT_GROUP_NAME;
    }

    return 'Cliente';
  }, [hasClientFilter, selectedClientIds, clientsMap, clientGroups, clientGroupsById]);

  const periodRangeLabel = useMemo(() => {
    const from = format(parseISO(dateRange.from), 'd MMM yyyy', { locale: es });
    const to = format(parseISO(dateRange.to), 'd MMM yyyy', { locale: es });
    return dateRange.from === dateRange.to ? from : `${from} – ${to}`;
  }, [dateRange.from, dateRange.to]);

  const buildGlobalDownloadLabel = (prefix: string) => {
    if (invalidCustomRange) return 'Seleccione un periodo válido';
    if (generatingReport) return 'Generando informe…';
    return `${prefix} · ${periodRangeLabel}`;
  };

  const summaryDownloadLabel = buildGlobalDownloadLabel('Informe General');
  const contactsGlobalDownloadLabel = buildGlobalDownloadLabel(
    `Informe de ${clientsGlobalReportScopeName}`,
  );
  const workersGlobalDownloadLabel = buildGlobalDownloadLabel('Informe de Equipo');

  const buildMobileDownloadLabel = (shortLabel: string) => {
    if (invalidCustomRange) return 'Periodo inválido';
    if (generatingReport) return 'Generando…';
    return shortLabel;
  };

  const summaryMobileDownloadLabel = buildMobileDownloadLabel('Informe General');
  const contactsMobileDownloadLabel = buildMobileDownloadLabel(
    `Informe de ${clientsGlobalReportScopeName}`,
  );
  const workersMobileDownloadLabel = buildMobileDownloadLabel('Informe de Equipo');

  const clientReportRows = useMemo(() => {
    const monthlyByClientId = new Map(
      monthlyData
        .filter((data) => data.client)
        .map((data) => [data.client!.id, data]),
    );

    let sourceClients = accessibleClients;
    if (hasClientFilter) {
      sourceClients = accessibleClients.filter((client) => selectedClientIds.includes(client.id));
    }

    const term = clientSearchTerm.toLowerCase().trim();

    return sourceClients
      .filter((client) => !term || client.name.toLowerCase().includes(term))
      .map((client) => {
        const summary = monthlyByClientId.get(client.id);
        const documentCounts = periodDocumentCountsByClientId.get(client.id) ?? {
          deliveryNoteCount: 0,
          invoiceCount: 0,
        };
        return {
          client,
          activities: summary?.activities ?? [],
          totalHours: summary?.totalHours ?? 0,
          deliveryNoteCount: documentCounts.deliveryNoteCount,
          invoiceCount: documentCounts.invoiceCount,
        };
      })
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'es'));
  }, [
    accessibleClients,
    hasClientFilter,
    selectedClientIds,
    monthlyData,
    periodDocumentCountsByClientId,
    clientSearchTerm,
  ]);

  const {
    visibleItems: visibleClientRows,
    sentinelRef: clientRowsSentinelRef,
    hasMore: hasMoreClientRows,
  } = useInfiniteScrollList(clientReportRows, [
    clientSearchTerm,
    dateRange.from,
    dateRange.to,
    selectedClientIds,
    hasClientFilter,
    clients,
    monthlyData,
    savedForPeriod,
  ]);

  const canSearchClients = accessibleClients.length > 0 && !loading && !invalidCustomRange;
  const showClientSearchField = canSearchClients && clientSearchOpen;

  const workerPeriodStatsOptions = useMemo(
    () => ({
      activityTypes,
      workerSignaturesEnabled,
      shiftSchedulingEnabled,
    }),
    [activityTypes, workerSignaturesEnabled, shiftSchedulingEnabled],
  );

  const teamPeriodStats = useMemo(() => {
    if (invalidCustomRange) return null;
    return computeTeamPeriodStats(
      operatorActivities,
      events,
      dateRange.from,
      dateRange.to,
      reportClientScope,
      workerPeriodStatsOptions,
    );
  }, [
    operatorActivities,
    events,
    dateRange.from,
    dateRange.to,
    reportClientScope,
    workerPeriodStatsOptions,
    invalidCustomRange,
  ]);

  const teamShiftBreakdown = useMemo(
    () => (teamPeriodStats ? buildTeamShiftBreakdown(teamPeriodStats) : []),
    [teamPeriodStats],
  );

  const workerReportRows = useMemo(() => {
    if (invalidCustomRange) return [];
    return buildWorkerPeriodRows(
      accessibleUsers,
      operatorActivities,
      events,
      operatorDocuments,
      dateRange.from,
      dateRange.to,
      reportClientScope,
      workerSearchTerm,
      workerPeriodStatsOptions,
    );
  }, [
    accessibleUsers,
    operatorActivities,
    events,
    operatorDocuments,
    dateRange.from,
    dateRange.to,
    reportClientScope,
    workerSearchTerm,
    workerPeriodStatsOptions,
    invalidCustomRange,
  ]);

  const clientBreakdownChartRows = useMemo(
    (): ReportBreakdownRow[] =>
      clientReportRows
        .filter((row) =>
          clientHasPeriodData(
            documents,
            row.client.id,
            dateRange.from,
            dateRange.to,
            row.activities.length,
          ),
        )
        .map((row) => ({
          name: row.client.name,
          activities: row.activities.length,
          hours: row.totalHours,
          documents: row.deliveryNoteCount + row.invoiceCount,
          deliveryNoteCount: row.deliveryNoteCount,
          invoiceCount: row.invoiceCount,
          paidAmount: documentMetricsForRange(
            documents,
            dateRange.from,
            dateRange.to,
            row.client.id,
          ).paidAmount,
        }))
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es')),
    [clientReportRows, documents, dateRange.from, dateRange.to],
  );

  const workerBreakdownChartRows = useMemo(
    (): ReportBreakdownRow[] =>
      workerReportRows.map((row) => ({
        name: row.user.name,
        activities: row.activityCount,
        hours: workerPeriodDisplayHours(row, workerSignaturesEnabled),
        documents: row.deliveryNoteCount + row.invoiceCount,
        deliveryNoteCount: row.deliveryNoteCount,
        invoiceCount: row.invoiceCount,
        paidAmount: row.billedAmount,
        signedHours: workerSignaturesEnabled ? row.signedHours : undefined,
        pendingHours: workerSignaturesEnabled ? row.pendingHours : undefined,
        signedActivities: workerSignaturesEnabled ? row.signedActivityCount : undefined,
        unsignedActivities: workerSignaturesEnabled ? row.unsignedActivityCount : undefined,
      })),
    [workerReportRows, workerSignaturesEnabled],
  );

  const workerSignatureChartRows = useMemo((): ReportBreakdownRow[] => {
    if (!workerSignaturesEnabled || !teamPeriodStats) return [];
    const rows: ReportBreakdownRow[] = [];
    if (teamPeriodStats.signedActivityCount > 0) {
      rows.push({
        name: 'Firmadas',
        activities: teamPeriodStats.signedActivityCount,
        hours: teamPeriodStats.signedHours,
        documents: 0,
        paidAmount: 0,
        signedActivities: teamPeriodStats.signedActivityCount,
      });
    }
    if (teamPeriodStats.unsignedActivityCount > 0) {
      rows.push({
        name: 'Sin firma',
        activities: teamPeriodStats.unsignedActivityCount,
        hours: teamPeriodStats.pendingHours,
        documents: 0,
        paidAmount: 0,
        unsignedActivities: teamPeriodStats.unsignedActivityCount,
      });
    }
    return rows;
  }, [teamPeriodStats, workerSignaturesEnabled]);

  const workersChartRows =
    workersChartMeasure === 'signatures' ? workerSignatureChartRows : workerBreakdownChartRows;

  const hasClientsChartData =
    !invalidCustomRange && hasReportBreakdownChartData(clientBreakdownChartRows, clientsChartMeasure);
  const hasWorkersChartData =
    !invalidCustomRange &&
    (workersChartMeasure === 'signatures'
      ? workerSignatureChartRows.length > 0
      : hasReportBreakdownChartData(workerBreakdownChartRows, workersChartMeasure));
  const showClientsChart = hasClientsChartData && clientsChartExpanded;
  const showWorkersChart = hasWorkersChartData && workersChartExpanded;
  const showClientsChartToggle = hasClientsChartData;
  const showWorkersChartToggle = hasWorkersChartData;

  const hasGeneralPeriodData = useMemo(
    () => clientsWithPeriodDataCount > 0 || workerReportRows.length > 0,
    [clientsWithPeriodDataCount, workerReportRows.length],
  );

  const {
    visibleItems: visibleWorkerRows,
    sentinelRef: workerRowsSentinelRef,
    hasMore: hasMoreWorkerRows,
  } = useInfiniteScrollList(workerReportRows, [
    workerSearchTerm,
    dateRange.from,
    dateRange.to,
    selectedClientIds,
    hasClientFilter,
    users,
    activities,
    events,
    documents,
  ]);

  const canSearchWorkers = accessibleUsers.length > 0 && !loading && !invalidCustomRange;
  const showWorkerSearchField = canSearchWorkers && workerSearchOpen;

  useEffect(() => {
    if (!clientSearchOpen) return;
    clientSearchInputRef.current?.focus();
  }, [clientSearchOpen]);

  useEffect(() => {
    if (canSearchClients) return;
    setClientSearchOpen(false);
    setClientSearchTerm('');
  }, [canSearchClients]);

  useEffect(() => {
    if (!workerSearchOpen) return;
    workerSearchInputRef.current?.focus();
  }, [workerSearchOpen]);

  useEffect(() => {
    if (canSearchWorkers) return;
    setWorkerSearchOpen(false);
    setWorkerSearchTerm('');
  }, [canSearchWorkers]);

  const savedReportKindCounts = useMemo(() => {
    const counts = new Map<ReportKind, number>();
    savedForPeriod.forEach((report) => {
      const kind = resolveSavedReportKind(report);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    });
    return counts;
  }, [savedForPeriod]);

  const savedReportKindOptions = useMemo((): ReportsKindNavOption[] => {
    const kinds = SAVED_REPORT_KIND_ORDER.filter(
      (kind) => (savedReportKindCounts.get(kind) ?? 0) > 0,
    );
    if (kinds.length <= 1) return [];

    const options: ReportsKindNavOption[] = [{ id: 'all', label: 'Todos' }];
    for (const kind of kinds) {
      options.push({
        id: kind,
        label:
          kind === 'contacts_global'
            ? resolveWorkspaceReportLabel(kind, clientsGlobalReportScopeName)
            : REPORT_KIND_LABELS[kind],
      });
    }
    return options;
  }, [savedReportKindCounts, clientsGlobalReportScopeName]);

  useEffect(() => {
    if (savedReportKindFilter === 'all') return;
    if (!savedReportKindCounts.has(savedReportKindFilter)) {
      setSavedReportKindFilter('all');
    }
  }, [savedReportKindFilter, savedReportKindCounts]);

  const filteredSavedReports = useMemo(() => {
    return savedForPeriod
      .filter((report) => {
        if (
          savedReportKindFilter !== 'all' &&
          resolveSavedReportKind(report) !== savedReportKindFilter
        ) {
          return false;
        }
        const client = clientsMap.get(report.clientId);
        return matchesSavedReportSearch(report, client, activityTypes, savedSearchTerm);
      })
      .sort(
        (a, b) => parseISO(b.generatedAt).getTime() - parseISO(a.generatedAt).getTime(),
      );
  }, [savedForPeriod, savedSearchTerm, savedReportKindFilter, clientsMap, activityTypes]);

  const {
    visibleItems: visibleSavedReports,
    sentinelRef: savedReportsSentinelRef,
    hasMore: hasMoreSavedReports,
  } = useInfiniteScrollList(
    filteredSavedReports,
    [
      savedSearchTerm,
      savedReportKindFilter,
      dateRange.from,
      dateRange.to,
      selectedClientIds,
      hasClientFilter,
      savedReports,
    ],
    undefined,
    savedReportsSectionRef,
  );

  const groupedVisibleSavedReports = useMemo(
    () => groupReportsByDateSection(visibleSavedReports),
    [visibleSavedReports],
  );

  const selectedSavedReport = useMemo(
    () =>
      routeReportId
        ? accessibleSavedReports.find((report) => report.id === routeReportId) ?? null
        : null,
    [accessibleSavedReports, routeReportId],
  );

  const clearPreviewState = (nextView?: ReportsMainView) => {
    previewReportIdRef.current = null;
    setPreviewPdfUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
    setPreviewHeader(null);
    setMainView(nextView ?? (isMobile ? 'idle' : 'generate'));
    if (!isMobile) {
      setSecondaryNavCollapsed(false);
    }
  };

  const openMobileGenerateView = () => {
    setMainView('generate');
  };

  const handleBackToMobileList = () => {
    setMainView('idle');
  };

  const openReportRoute = (reportId: string, replace = false) => {
    navigate(`/reports/${reportId}`, { replace });
  };

  const buildReportExport = (options: {
    kind?: ReportKind;
    clientId?: string;
    workerUserId?: string;
  } = {}) => {
    const { clientId, workerUserId } = options;
    const reportKind = resolveReportKind({
      clientId,
      workerUserId,
      explicitKind: options.kind,
    });
    const exportScope = resolveClientScope(selectedClientIds, clientId);
    const workerUser = workerUserId ? usersById.get(workerUserId) : undefined;

    const exportActivities = workerUserId
      ? workerActivitiesInRange(
          activities,
          events,
          users,
          workerUserId,
          dateRange.from,
          dateRange.to,
          exportScope,
        )
      : clientId
        ? monthlyData
            .filter((data) => data.client?.id === clientId)
            .flatMap((data) => data.activities)
        : allPeriodActivities;

    const workerDocuments = workerUserId
      ? workerDocumentsInRange(
          activities,
          events,
          documents,
          users,
          workerUserId,
          dateRange.from,
          dateRange.to,
          exportScope,
        )
      : null;

    const exportDocMetrics = workerDocuments
      ? documentMetricsForRange(workerDocuments, dateRange.from, dateRange.to, 'all')
      : documentMetricsForRange(documents, dateRange.from, dateRange.to, exportScope);

    const exportDocTypeMetrics = workerDocuments
      ? documentTypeMetricsForDocuments(workerDocuments, 'all')
      : documentTypeMetricsForRange(documents, dateRange.from, dateRange.to, exportScope);

    const exportInvoiceConcepts = workerUserId
      ? workerInvoiceConceptsInRange(
          activities,
          events,
          documents,
          users,
          workerUserId,
          dateRange.from,
          dateRange.to,
          exportScope,
        )
      : aggregateInvoiceConcepts(documents, dateRange.from, dateRange.to, exportScope);

    const exportHours = workerUserId
      ? sumWorkerHoursForActivities(
          exportActivities,
          events,
          workerUserId,
          workerPeriodStatsOptions,
        )
      : reportKind === 'workers_global' && teamPeriodStats
        ? teamPeriodStats.assignedHours
        : exportActivities.reduce((sum, activity) => sum + activity.hours, 0);

    const exportActivityCount =
      reportKind === 'workers_global' && teamPeriodStats
        ? teamPeriodStats.activityCount
        : exportActivities.length;

    const exportChartData = toChartData(
      buildTypeBuckets(exportActivities, activityTypes),
    );

    const exportClientScope =
      reportKind === 'contacts_global'
        ? clientScopeLabel
        : reportKind === 'workers_global'
          ? 'Todos los operarios'
          : workerUser
            ? `${workerUser.name} (operario)`
            : clientId
              ? (clientsMap.get(clientId)?.name ?? 'Cliente')
              : clientScopeLabel;

    const exportClientsCount = workerUserId
      ? new Set(exportActivities.map((activity) => activity.clientId)).size
      : clientId
        ? 1
        : countClientsWithPeriodData(
            activityClientIds,
            documents,
            dateRange.from,
            dateRange.to,
            exportScope,
          );

    const activeWorkerCount = workerReportRows.length;

    const buildClientBreakdown = (): ReportBreakdownRow[] =>
      clientReportRows
        .filter((row) =>
          clientHasPeriodData(
            documents,
            row.client.id,
            dateRange.from,
            dateRange.to,
            row.activities.length,
          ),
        )
        .map((row) => ({
          name: row.client.name,
          activities: row.activities.length,
          hours: row.totalHours,
          documents: row.deliveryNoteCount + row.invoiceCount,
          deliveryNoteCount: row.deliveryNoteCount,
          invoiceCount: row.invoiceCount,
          paidAmount: documentMetricsForRange(
            documents,
            dateRange.from,
            dateRange.to,
            row.client.id,
          ).paidAmount,
        }))
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es'));

    const buildWorkerBreakdown = (): ReportBreakdownRow[] =>
      workerReportRows.map((row) => ({
        name: row.user.name,
        activities: row.activityCount,
        hours: workerPeriodDisplayHours(row, workerSignaturesEnabled),
        documents: row.deliveryNoteCount + row.invoiceCount,
        deliveryNoteCount: row.deliveryNoteCount,
        invoiceCount: row.invoiceCount,
        paidAmount: row.billedAmount,
        signedHours: workerSignaturesEnabled ? row.signedHours : undefined,
        pendingHours: workerSignaturesEnabled ? row.pendingHours : undefined,
        signedActivities: workerSignaturesEnabled ? row.signedActivityCount : undefined,
        unsignedActivities: workerSignaturesEnabled ? row.unsignedActivityCount : undefined,
      }));

    const teamStatsForReport =
      reportKind === 'workers_global' && teamPeriodStats ? teamPeriodStats : null;

    const buildClientBreakdownForWorker = (): ReportBreakdownRow[] => {
      if (!workerUserId) return [];
      const hoursByClient = new Map<string, { hours: number; activities: number }>();
      for (const activity of exportActivities) {
        const current = hoursByClient.get(activity.clientId) ?? { hours: 0, activities: 0 };
        hoursByClient.set(activity.clientId, {
          hours:
            current.hours +
            workerReportHoursOnActivity(activity, events, workerUserId, workerPeriodStatsOptions),
          activities: current.activities + 1,
        });
      }
      return [...hoursByClient.entries()]
        .map(([id, stats]) => {
          const docMetrics = documentMetricsForRange(documents, dateRange.from, dateRange.to, id);
          const docTypeMetrics = documentTypeMetricsForRange(
            documents,
            dateRange.from,
            dateRange.to,
            id,
          );
          return {
            name: clientsMap.get(id)?.name ?? 'Sin nombre',
            activities: stats.activities,
            hours: stats.hours,
            documents: docTypeMetrics.deliveryNoteCount + docTypeMetrics.invoiceCount,
            deliveryNoteCount: docTypeMetrics.deliveryNoteCount,
            invoiceCount: docTypeMetrics.invoiceCount,
            paidAmount: docMetrics.paidAmount,
          };
        })
        .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es'));
    };

    const clientBreakdown =
      reportKind === 'general' || reportKind === 'contacts_global'
        ? buildClientBreakdown()
        : reportKind === 'worker'
          ? buildClientBreakdownForWorker()
          : undefined;

    const workerBreakdown =
      reportKind === 'general' || reportKind === 'workers_global'
        ? buildWorkerBreakdown()
        : undefined;

    const scopedSummary =
      (reportKind === 'general' || reportKind === 'contacts_global') && exportScope === 'all';

    const metricsClientsLabel =
      reportKind === 'workers_global'
        ? 'Operarios con actividad'
        : scopedSummary
          ? 'Clientes con actividad o documentación'
          : 'Documentos';

    const metricsClientsValue =
      reportKind === 'workers_global'
        ? activeWorkerCount
        : scopedSummary
          ? exportClientsCount
          : exportDocMetrics.total;

    const resolvedChartData =
      clientId || workerUserId || reportKind === 'workers_global'
        ? exportChartData
        : chartData;

    const params: BuildSummaryReportPdfParams = {
      reportKind,
      periodLabel,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      companyName,
      metrics: {
        clientScope: exportClientScope,
        clientsOrDocumentsLabel: metricsClientsLabel,
        clientsOrDocumentsValue: metricsClientsValue,
        totalActivities: exportActivityCount,
        totalHours: exportHours,
        paidAmount: exportDocMetrics.paidAmount,
        paidCount: exportDocMetrics.paid,
        sentCount: exportDocMetrics.sent,
        sentAmount: exportDocMetrics.sentAmount,
        draftCount: exportDocMetrics.draft,
        draftAmount: exportDocMetrics.draftAmount,
        deliveryNoteCount: exportDocTypeMetrics.deliveryNoteCount,
        invoiceCount: exportDocTypeMetrics.invoiceCount,
        totalWorkers: reportKind === 'general' ? activeWorkerCount : undefined,
        contactsServed: reportKind === 'worker' ? exportClientsCount : undefined,
        teamAssignedHours: teamStatsForReport?.assignedHours,
        teamSignedHours: teamStatsForReport?.signedHours,
        teamPendingHours: teamStatsForReport?.pendingHours,
        teamSignedActivities: teamStatsForReport?.signedActivityCount,
        teamUnsignedActivities: teamStatsForReport?.unsignedActivityCount,
      },
      invoiceConcepts: exportInvoiceConcepts,
      chartMode,
      chartData: resolvedChartData,
      chartElement: null,
      clientBreakdown,
      workerBreakdown,
      teamShiftBreakdown:
        reportKind === 'workers_global' && shiftSchedulingEnabled
          ? teamShiftBreakdown
          : undefined,
      featureFlags: {
        workerSignaturesEnabled,
        shiftSchedulingEnabled,
      },
      narrative: {
        reportKind,
        companyName,
        periodLabel,
        clientScope: exportClientScope,
        totalClients: exportClientsCount,
        totalWorkers: activeWorkerCount,
        totalActivities: exportActivityCount,
        totalHours: exportHours,
        paidAmount: exportDocMetrics.paidAmount,
        paidCount: exportDocMetrics.paid,
        sentCount: exportDocMetrics.sent,
        sentAmount: exportDocMetrics.sentAmount,
        draftCount: exportDocMetrics.draft,
        draftAmount: exportDocMetrics.draftAmount,
        invoiceConcepts: exportInvoiceConcepts,
        chartMode,
        chartData: resolvedChartData,
        comparison: { period, from: dateRange.from, to: dateRange.to },
        activitiesChangePercent: reportsPeriodStats?.activitiesChangePercent ?? null,
        hoursChangePercent: reportsPeriodStats?.hoursChangePercent ?? null,
        clientBreakdown,
        workerBreakdown,
        teamAssignedHours: teamStatsForReport?.assignedHours,
        teamSignedHours: teamStatsForReport?.signedHours,
        teamPendingHours: teamStatsForReport?.pendingHours,
        teamSignedActivities: teamStatsForReport?.signedActivityCount,
        teamUnsignedActivities: teamStatsForReport?.unsignedActivityCount,
        teamShiftBreakdown:
          reportKind === 'workers_global' && shiftSchedulingEnabled
            ? teamShiftBreakdown
            : undefined,
        workerSignaturesEnabled,
        shiftSchedulingEnabled,
      },
    };

    if (reportKind === 'worker' && workerUserId) {
      params.workerActivityDetail = buildWorkerActivityDetailRows({
        activities,
        events,
        documents,
        clients,
        assignees: users,
        activityTypes,
        userId: workerUserId,
        from: dateRange.from,
        to: dateRange.to,
        clientScope: exportScope,
        workerSignaturesEnabled,
        shiftSchedulingEnabled,
      });
    }

    const saveScope: SaveReportScope = {
      from: dateRange.from,
      to: dateRange.to,
      reportKind,
      workerUserId,
      reportLabel:
        reportKind && WORKSPACE_REPORT_KINDS.includes(reportKind)
          ? resolveWorkspaceReportLabel(reportKind, clientsGlobalReportScopeName)
          : exportClientScope,
      clientIds: clientId ?? (hasClientFilter ? selectedClientIds : undefined),
    };

    return {
      params,
      saveScope,
      reportKind,
    };
  };

  const highlightSavedReport = (saved: MonthlyReport) => {
    highlightReport(saved.id);
    savedReportsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const setMainPdfPreview = (
    blob: Blob,
    header: ReportPreviewHeader,
    reportId: string,
    options?: { updateRoute?: boolean; replaceRoute?: boolean },
  ) => {
    previewReportIdRef.current = reportId;
    setPreviewPdfUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(blob);
    });
    setPreviewHeader(header);
    setMainView('preview');
    if (options?.updateRoute !== false) {
      openReportRoute(reportId, options?.replaceRoute ?? false);
    }
  };

  const openGenerateView = () => {
    clearPreviewState();
    if (routeReportId) {
      navigate('/reports');
    }
  };

  const loadReportPreview = async (
    report: MonthlyReport,
    options?: { updateRoute?: boolean; replaceRoute?: boolean },
  ) => {
    const client = clientsMap.get(report.clientId);
    if (!client) return;

    const fallbackParams = buildPdfParamsFromMonthlyReport(
      report,
      client,
      activityTypes,
      documents,
      companyName,
      chartMode,
    );
    const params = pdfParamsFromSavedReport(report, fallbackParams);
    const blob = await buildSummaryReportPdfBlob(params);
    setMainPdfPreview(
      blob,
      buildReportPreviewHeader({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        generatedAt: report.generatedAt,
        clientName: savedReportTitle(report, client, clientsGlobalReportScopeName),
        generatedBy: resolveReportAuthor(report, usersById),
      }),
      report.id,
      options,
    );
  };

  const handlePreviewSaved = async (report: MonthlyReport) => {
    try {
      await loadReportPreview(report);
    } catch (error) {
      console.error('Error al abrir informe PDF:', error);
      window.alert('No se pudo abrir el informe generado.');
    }
  };

  useEffect(() => {
    if (!routeReportId) {
      // Mantener vista previa en memoria mientras la ruta /reports/:id se sincroniza tras generar.
      if (mainView === 'preview' && previewPdfUrl) return;
      if (mainView !== 'preview' && !previewPdfUrl) return;
      clearPreviewState();
      routePreviewLoadRef.current = null;
      return;
    }

    if (previewReportIdRef.current === routeReportId) return;
    if (routePreviewLoadRef.current === routeReportId) return;
    if (clients.length === 0) return;

    let cancelled = false;
    routePreviewLoadRef.current = routeReportId;

    const openFromRoute = async () => {
      let report = savedReports.find((item) => item.id === routeReportId);
      if (!report) {
        try {
          report = await reportsService.getById(routeReportId);
          if (!cancelled) {
            setSavedReports((current) =>
              current.some((item) => item.id === report!.id) ? current : [...current, report!],
            );
          }
        } catch {
          if (!cancelled) {
            window.alert('Informe no encontrado.');
            navigate('/reports', { replace: true });
          }
          return;
        }
      }

      if (cancelled || !report) return;
      if (!clientsMap.get(report.clientId)) {
        routePreviewLoadRef.current = null;
        return;
      }

      try {
        await loadReportPreview(report, { updateRoute: false });
      } catch (error) {
        console.error('Error al abrir informe PDF:', error);
        if (!cancelled) {
          window.alert('No se pudo abrir el informe generado.');
          navigate('/reports', { replace: true });
        }
      } finally {
        if (routePreviewLoadRef.current === routeReportId) {
          routePreviewLoadRef.current = null;
        }
      }
    };

    void openFromRoute();

    return () => {
      cancelled = true;
      if (routePreviewLoadRef.current === routeReportId) {
        routePreviewLoadRef.current = null;
      }
    };
  }, [routeReportId, savedReports, clients, navigate]);

  const handleDownloadWorkerDetail = (workerUserId: string, workerName: string) => {
    if (invalidCustomRange) return;
    const rows = buildWorkerActivityDetailRows({
      activities,
      events,
      documents,
      clients,
      assignees: users,
      activityTypes,
      userId: workerUserId,
      from: dateRange.from,
      to: dateRange.to,
      clientScope: reportClientScope,
      workerSignaturesEnabled,
      shiftSchedulingEnabled,
    });
    if (rows.length === 0) return;
    downloadWorkerDetailedReportCsv(
      rows,
      buildWorkerDetailedReportFilename(workerName, dateRange.from, dateRange.to),
      { workerSignaturesEnabled, shiftSchedulingEnabled },
    );
  };

  const handleGenerateReport = async (
    options: { kind?: ReportKind; clientId?: string; workerUserId?: string },
    onComplete?: () => void,
  ) => {
    if (invalidCustomRange || generatingReport) return;

    if (!isAdmin) {
      const { kind, clientId, workerUserId } = options;
      if (kind === 'general' || kind === 'contacts_global' || kind === 'workers_global') {
        window.alert('No tienes permiso para generar este informe.');
        return;
      }
      if (workerUserId && workerUserId !== currentUserId) {
        window.alert('Solo puedes generar informes de tu propia cuenta.');
        return;
      }
      if (clientId && assignedClientIds && !assignedClientIds.has(clientId)) {
        window.alert('No tienes permiso para generar informes de este cliente.');
        return;
      }
    }

    setGeneratingReport(true);

    try {
      const { params, saveScope } = buildReportExport(options);
      const { saved, blob } = await generateAndSaveSummaryReport(
        params,
        saveScope,
        loadSavedReports,
      );
      highlightSavedReport(saved);

      const currentUser = authService.getCurrentUser();
      const savedClient = clientsMap.get(saved.clientId);
      const header = buildReportPreviewHeader({
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        generatedAt: saved.generatedAt,
        clientName: savedReportTitle(saved, savedClient, clientsGlobalReportScopeName),
        generatedBy: currentUser
          ? { name: currentUser.name, avatarUrl: currentUser.avatarUrl }
          : resolveReportAuthor(saved, usersById),
      });

      setMainPdfPreview(blob, header, saved.id);
      if (secondaryNavCollapsed) {
        toggleSecondaryNav();
      }
    } catch (error) {
      console.error('Error al generar informe PDF:', error);
      window.alert('No se pudo generar el informe. Inténtalo de nuevo.');
    } finally {
      setGeneratingReport(false);
      onComplete?.();
    }
  };

  const handleSummaryReportGenerate = () => {
    if (invalidCustomRange || generatingReport) return;
    void handleGenerateReport({ kind: 'general' });
  };

  const summaryGenerateDisabled =
    invalidCustomRange || generatingReport || !hasGeneralPeriodData;

  const contactsGlobalGenerateDisabled =
    invalidCustomRange || generatingReport || clientsWithPeriodDataCount === 0;

  const workersGlobalGenerateDisabled =
    invalidCustomRange || generatingReport || workerReportRows.length === 0;

  const globalContactsTooltip = getReportGenerateTooltip({
    invalidCustomRange,
    hasPeriodData: clientsWithPeriodDataCount > 0,
    generating: generatingReport,
    reportKind: 'contacts_global',
  });

  const globalOperatorsTooltip = getReportGenerateTooltip({
    invalidCustomRange,
    hasPeriodData: workerReportRows.length > 0,
    generating: generatingReport,
    entity: 'operario',
    reportKind: 'workers_global',
  });

  const generalGenerateTooltip = getReportGenerateTooltip({
    invalidCustomRange,
    hasPeriodData: hasGeneralPeriodData,
    generating: generatingReport,
    reportKind: 'general',
  });

  const handleDownloadSaved = async (report: MonthlyReport) => {
    const client = clientsMap.get(report.clientId);
    if (!client) return;

    try {
      await downloadMonthlyReportPdf(
        report,
        client,
        activityTypes,
        documents,
        companyName,
        chartMode,
        null,
      );
    } catch (error) {
      console.error('Error al generar informe PDF:', error);
      window.alert('No se pudo descargar el informe generado.');
    }
  };

  const handleDeleteSaved = async (id: string) => {
    if (!confirm('¿Eliminar este informe generado?')) return;
    await reportsService.delete(id);
    if (routeReportId === id) {
      clearPreviewState();
      navigate('/reports');
    }
    await loadSavedReports();
  };

  const renderSectionGenerateButton = (
    kind: 'general' | 'contacts' | 'workers',
    compact = isMobile,
  ) => {
    if (!isAdmin) return null;

    const configs = {
      general: {
        onClick: handleSummaryReportGenerate,
        label: compact ? summaryMobileDownloadLabel : summaryDownloadLabel,
        tooltip: generalGenerateTooltip,
        disabled: summaryGenerateDisabled,
      },
      contacts: {
        onClick: () => void handleGenerateReport({ kind: 'contacts_global' }),
        label: compact ? contactsMobileDownloadLabel : contactsGlobalDownloadLabel,
        tooltip: globalContactsTooltip,
        disabled: contactsGlobalGenerateDisabled,
      },
      workers: {
        onClick: () => void handleGenerateReport({ kind: 'workers_global' }),
        label: compact ? workersMobileDownloadLabel : workersGlobalDownloadLabel,
        tooltip: globalOperatorsTooltip,
        disabled: workersGlobalGenerateDisabled,
      },
    } as const;

    const config = configs[kind];

    return (
      <span className={styles.generateBtnWrap} title={config.tooltip}>
        <button
          type="button"
          onClick={config.onClick}
          className={cx(ui.toolbarBtnPrimary, styles.reportsSectionGenerateBtn)}
          aria-label={config.tooltip}
          title={config.tooltip}
          disabled={config.disabled}
        >
          <ArrowDownToLine size={14} strokeWidth={2} aria-hidden />
          <span className={styles.reportsGenerateBtnLabel}>{config.label}</span>
        </button>
      </span>
    );
  };

  return (
    <div className={styles.reportsPage}>
      <SecondarySidebarPortal renderOnMobile>
      <aside
        id="reports-secondary-nav"
        className={cx(
          styles.reportsSavedSidebar,
          secondaryNavCollapsed && styles.reportsSavedSidebarCollapsed,
          isMobile && styles.reportsSavedSidebarMobile,
          isMobile && mobileShowMain && styles.reportsSavedSidebarMobileHidden,
        )}
        aria-label="Informes generados"
        aria-hidden={secondaryNavCollapsed ? true : undefined}
      >
        {!isMobile ? (
          <div className={styles.reportsNavHeader}>
            <p className={styles.reportsNavTitle}>Reportes</p>
            <SecondaryNavToggle
              expanded
              onToggle={toggleSecondaryNav}
              controlsId="reports-secondary-nav"
              className={styles.reportsNavToggle}
            />
          </div>
        ) : null}
        <div className={styles.reportsSavedSidebarBody}>
        <div className={styles.reportsSavedSidebarSearch}>
          <SearchField
            wrapperClassName={styles.reportsSavedSidebarSearchField}
            placeholder={isMobile ? 'Buscar reportes' : 'Buscar'}
            value={savedSearchTerm}
            onChange={(e) => setSavedSearchTerm(e.target.value)}
            trailing={
              <ReportsKindNav
                compact
                options={savedReportKindOptions}
                activeKind={savedReportKindFilter}
                onSelect={setSavedReportKindFilter}
              />
            }
          />
        </div>
        <div
          className={styles.reportsSavedSidebarList}
          ref={savedReportsSectionRef}
          {...scrollRegionProps}
        >
          {savedForPeriod.length > 0 ? (
            visibleSavedReports.length > 0 ? (
              <>
                <nav className={styles.reportsSavedNavList} aria-label="Informes generados">
                  {groupedVisibleSavedReports.map((section) => (
                    <div key={section.key} className={styles.reportsSavedNavGroup}>
                      <p className={styles.reportsSavedNavGroupLabel}>{section.label}</p>
                      {section.items.map((report) => {
                        const client = clientsMap.get(report.clientId);
                        return (
                          <div key={report.id} className={styles.reportsSavedNavItemWrap}>
                            <button
                              type="button"
                              className={cx(
                                styles.reportsSavedNavItem,
                                report.id === highlightedReportId && styles.savedItemJustAdded,
                                report.id === routeReportId &&
                                  styles.reportsSavedNavItemActive,
                              )}
                              onClick={() => {
                                void handlePreviewSaved(report);
                              }}
                              title={savedReportTitle(report, client, clientsGlobalReportScopeName)}
                            >
                              {savedReportTitle(report, client, clientsGlobalReportScopeName)}
                            </button>
                            <div className={styles.reportsSavedNavItemActions}>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const rect = event.currentTarget.getBoundingClientRect();
                                  setReportActionMenu({
                                    x: rect.right,
                                    y: rect.bottom + 4,
                                    report,
                                  });
                                }}
                                className={styles.reportsSavedNavOptionsBtn}
                                title="Opciones"
                                aria-label={`Opciones de ${client?.name ?? 'informe'}`}
                                aria-haspopup="menu"
                                aria-expanded={reportActionMenu?.report.id === report.id}
                              >
                                <MoreVertical size={14} strokeWidth={1.75} aria-hidden />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </nav>
                <InfiniteScrollSentinel
                  sentinelRef={savedReportsSentinelRef}
                  hasMore={hasMoreSavedReports}
                />
              </>
            ) : (
              <div className={styles.savedSidebarEmpty}>
                <p className={styles.savedSidebarEmptyTitle}>Sin coincidencias</p>
                <p className={styles.savedSidebarEmptyText}>
                  {savedReportKindFilter !== 'all' && !savedSearchTerm.trim()
                    ? 'No hay informes de este tipo en el periodo.'
                    : savedReportKindFilter !== 'all'
                      ? 'No hay informes de este tipo que coincidan con la búsqueda.'
                      : 'No hay informes que coincidan con la búsqueda.'}
                </p>
              </div>
            )
          ) : (
            <div className={styles.savedSidebarEmpty}>
              <p className={styles.savedSidebarEmptyTitle}>Sin informes</p>
              <p className={styles.savedSidebarEmptyText}>
                Aún no hay informes generados en este periodo.
              </p>
            </div>
          )}
        </div>
        </div>
        {(isAdmin || isMobile) && (
          <SidebarFooter variant="secondary">
            {isAdmin ? (
              <SidebarFooterAction
                fullWidth
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setSidebarDownloadMenu({ x: rect.left, y: rect.top - 4 });
                }}
                aria-label="Descargar informe por tipo"
                title="Descargar informe por tipo"
                label="Descargar informe"
                disabled={invalidCustomRange || generatingReport}
                aria-haspopup="menu"
                aria-expanded={sidebarDownloadMenu != null}
              >
                <ArrowDownToLine size={14} strokeWidth={2.25} aria-hidden />
              </SidebarFooterAction>
            ) : null}
            {isMobile ? (
              <SidebarFooterAction
                fullWidth
                onClick={openMobileGenerateView}
                aria-label="Generar reporte"
                title="Generar reporte"
                label="Generar reporte"
              >
                <Plus size={14} strokeWidth={2.25} aria-hidden />
              </SidebarFooterAction>
            ) : null}
          </SidebarFooter>
        )}
      </aside>
      </SecondarySidebarPortal>

      <div
        className={cx(
          styles.reportsContent,
          mainView !== 'preview' && ui.page,
          mainView === 'preview' && documentDetailStyles.documentsDetailContent,
          isMobile && mobileShowMain && styles.reportsContentMobile,
          isMobile && !mobileShowMain && styles.reportsContentMobileHidden,
        )}
      >
        {mainView === 'generate' ? (
          <div className={cx(ui.tablePage, styles.reportsGeneratePage)}>
        <div className={styles.reportsHeaderBlock}>
          <DatePeriodFilters
            sectionLayout
            sectionPart="heading"
            abbreviated={isMobile}
            className={cx(
              dashboardStyles.filtersSection,
              styles.periodSection,
              styles.reportsPeriodHeading,
              isMobile && styles.reportsPeriodSection,
            )}
            headingStart={
              <>
                {isMobile ? (
                  <SecondaryNavToggle
                    expanded={false}
                    onToggle={handleBackToMobileList}
                    controlsId="reports-secondary-nav"
                    className={styles.secondaryNavExpandBtn}
                  />
                ) : secondaryNavCollapsed ? (
                  <SecondaryNavToggle
                    expanded={false}
                    onToggle={toggleSecondaryNav}
                    controlsId="reports-secondary-nav"
                    className={styles.secondaryNavExpandBtn}
                  />
                ) : null}
                {activeGenerateTab === 'summary' ? (
                  <ChartSectionToggle
                    expanded={chartsExpanded}
                    onToggle={handleChartsToggle}
                    controlsId="reports-charts-panel"
                    plural
                  />
                ) : null}
              </>
            }
            headingTrailing={
              isDesktop ? (
                <div
                  ref={setChartControlsHost}
                  className={cx(
                    dashboardStyles.chartControlsHost,
                    !(chartsExpanded && selectedPeriodMetricId) &&
                      dashboardStyles.chartControlsHostIdle,
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
          />
          <div className={styles.generateTabBar}>
            <nav
              className={styles.generateTabList}
              role="tablist"
              aria-label="Secciones del informe"
            >
              {REPORTS_GENERATE_TABS.map((tab) => {
                const active = activeGenerateTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`reports-generate-tab-${tab.id}`}
                    aria-selected={active}
                    aria-controls={`reports-generate-panel-${tab.id}`}
                    className={cx(styles.generateTab, active && styles.generateTabActive)}
                    onClick={() => setActiveGenerateTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className={cx(ui.tableBody, styles.reportsTableBody)} {...scrollPaneProps}>
        {dataError ? (
          <p className={cx(ui.alertError, styles.reportsDataError)} role="alert">
            {dataError}
          </p>
        ) : null}
        <div className={styles.generateSection}>
          {activeGenerateTab === 'contacts' ? (
          <div
            role="tabpanel"
            id="reports-generate-panel-contacts"
            aria-labelledby="reports-generate-tab-contacts"
            className={styles.generateTabPanel}
          >
          <section className={cx(ui.pageSection, styles.reportsMobileSection)}>
            <div className={ui.pageSectionTitleRow}>
              {showClientsChartToggle ? (
                <ChartSectionToggle
                  expanded={clientsChartExpanded}
                  onToggle={() => setClientsChartExpanded((expanded) => !expanded)}
                  controlsId="reports-clients-chart-panel"
                />
              ) : null}
              <h2 className={ui.pageSectionTitle}>Clientes del periodo</h2>
              <div className={styles.sectionTitleActions}>
                {isDesktop && showClientsChart ? (
                  <ReportBreakdownChartToggles
                    measure={clientsChartMeasure}
                    onMeasureChange={setClientsChartMeasure}
                    className={styles.headerChartToggles}
                  />
                ) : null}
                {canSearchClients ? (
                <button
                  type="button"
                  className={styles.clientSearchToggleBtn}
                  aria-label={clientSearchOpen ? 'Ocultar búsqueda' : 'Buscar clientes'}
                  aria-expanded={clientSearchOpen}
                  onClick={() => setClientSearchOpen((open) => !open)}
                >
                  <Search size={14} strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              </div>
            </div>
            {showClientSearchField ? (
              <div className={cx(ui.listPanelToolbar, styles.clientSectionSearch)}>
                <div className={ui.filtersRow}>
                  <SearchField
                    ref={clientSearchInputRef}
                    wrapperClassName={ui.searchWrapper}
                    placeholder="Buscar cliente..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <div
              className={cx(
                ui.card,
                styles.reportsSectionCard,
              )}
            >
            <div className={styles.reportsSectionCardBody}>
            {loading ? (
              <p className={cx(ui.textMuted, styles.emptySection)}>Cargando...</p>
            ) : invalidCustomRange ? (
              <p className={cx(ui.alertError, styles.emptySection)}>
                La fecha de inicio debe ser anterior o igual a la de fin.
              </p>
            ) : accessibleClients.length > 0 ? (
              <>
                {showClientsChart && (
                  <div
                    id="reports-clients-chart-panel"
                    className={styles.sectionChartPanel}
                  >
                    <ReportBreakdownDonutChart
                      rows={clientBreakdownChartRows}
                      measure={clientsChartMeasure}
                      ariaLabel="Distribución por cliente"
                    />
                    {!isDesktop && (
                      <ReportBreakdownChartToggles
                        measure={clientsChartMeasure}
                        onMeasureChange={setClientsChartMeasure}
                        className={styles.chartControlsBelow}
                      />
                    )}
                  </div>
                )}
                {visibleClientRows.length > 0 ? (
                  <div className={styles.clientReportList}>
                    {visibleClientRows.map((row) => {
                      const rowHasPeriodData = clientHasPeriodData(
                        documents,
                        row.client.id,
                        dateRange.from,
                        dateRange.to,
                        row.activities.length,
                      );
                      const rowGenerateTooltip = getReportGenerateTooltip({
                        invalidCustomRange,
                        hasPeriodData: rowHasPeriodData,
                        generating: generatingReport,
                        entity: 'cliente',
                        reportKind: 'contact',
                      });

                      return (
                        <div
                          key={row.client.id}
                          className={styles.clientReportItem}
                        >
                          {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => openClientReport(row.client.id)}
                            className={styles.clientReportLink}
                          >
                            <div className={ui.fontMedium}>{row.client.name}</div>
                            <div className={styles.savedMeta}>
                              {row.activities.length > 0 && (
                                <>
                                  {row.activities.length} actividades • {row.totalHours}h
                                </>
                              )}
                              <ClientPeriodDocumentMeta
                                deliveryNoteCount={row.deliveryNoteCount}
                                invoiceCount={row.invoiceCount}
                                hasLeadingContent={row.activities.length > 0}
                              />
                            </div>
                          </button>
                          ) : (
                          <div className={styles.clientReportLink}>
                            <div className={ui.fontMedium}>{row.client.name}</div>
                            <div className={styles.savedMeta}>
                              {row.activities.length > 0 && (
                                <>
                                  {row.activities.length} actividades • {row.totalHours}h
                                </>
                              )}
                              <ClientPeriodDocumentMeta
                                deliveryNoteCount={row.deliveryNoteCount}
                                invoiceCount={row.invoiceCount}
                                hasLeadingContent={row.activities.length > 0}
                              />
                            </div>
                          </div>
                          )}
                          <div className={styles.clientReportActions}>
                            <span className={styles.generateBtnWrap} title={rowGenerateTooltip}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleGenerateReport({
                                    clientId: row.client.id,
                                    kind: 'contact',
                                  });
                                }}
                                className={ui.btnIcon}
                                title={rowGenerateTooltip}
                                aria-label={rowGenerateTooltip}
                                disabled={
                                  invalidCustomRange || generatingReport || !rowHasPeriodData
                                }
                              >
                                <ArrowDownToLine size={16} />
                              </button>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <InfiniteScrollSentinel
                      sentinelRef={clientRowsSentinelRef}
                      hasMore={hasMoreClientRows}
                    />
                  </div>
                ) : (
                  <p className={cx(ui.textMuted, styles.emptySection)}>
                    No hay clientes que coincidan con la búsqueda.
                  </p>
                )}
              </>
            ) : (
              <div className={styles.emptySection}>
                <EmptyState
                  emoji="📊"
                  description="No hay clientes registrados."
                />
              </div>
            )}
            </div>
            </div>
          </section>
          {isAdmin ? (
            <div className={cx(styles.generateTabFooter, styles.periodCardGenerate)}>
              {renderSectionGenerateButton('contacts')}
            </div>
          ) : null}
          </div>
          ) : null}

          {activeGenerateTab === 'workers' ? (
          <div
            role="tabpanel"
            id="reports-generate-panel-workers"
            aria-labelledby="reports-generate-tab-workers"
            className={styles.generateTabPanel}
          >
          <section className={cx(ui.pageSection, styles.reportsMobileSection)}>
            <div className={ui.pageSectionTitleRow}>
              {showWorkersChartToggle ? (
                <ChartSectionToggle
                  expanded={workersChartExpanded}
                  onToggle={() => setWorkersChartExpanded((expanded) => !expanded)}
                  controlsId="reports-workers-chart-panel"
                />
              ) : null}
              <h2 className={ui.pageSectionTitle}>Operarios del periodo</h2>
              <div className={styles.sectionTitleActions}>
                {isDesktop && showWorkersChart ? (
                  <ReportBreakdownChartToggles
                    measure={workersChartMeasure}
                    onMeasureChange={setWorkersChartMeasure}
                    includeSignatures={workerSignaturesEnabled}
                    className={styles.headerChartToggles}
                  />
                ) : null}
                {canSearchWorkers ? (
                <button
                  type="button"
                  className={styles.clientSearchToggleBtn}
                  aria-label={workerSearchOpen ? 'Ocultar búsqueda' : 'Buscar operarios'}
                  aria-expanded={workerSearchOpen}
                  onClick={() => setWorkerSearchOpen((open) => !open)}
                >
                  <Search size={14} strokeWidth={1.75} aria-hidden />
                </button>
              ) : null}
              </div>
            </div>
            {showWorkerSearchField ? (
              <div className={cx(ui.listPanelToolbar, styles.clientSectionSearch)}>
                <div className={ui.filtersRow}>
                  <SearchField
                    ref={workerSearchInputRef}
                    wrapperClassName={ui.searchWrapper}
                    placeholder="Buscar operario..."
                    value={workerSearchTerm}
                    onChange={(e) => setWorkerSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <div
              className={cx(
                ui.card,
                styles.reportsSectionCard,
              )}
            >
            {!loading && !invalidCustomRange && accessibleUsers.length > 0 &&
            teamPeriodStats &&
            teamPeriodStats.activityCount > 0 ? (
              <TeamPeriodSummary
                stats={teamPeriodStats}
                workerSignaturesEnabled={workerSignaturesEnabled}
                shiftSchedulingEnabled={shiftSchedulingEnabled}
              />
            ) : null}
            <div className={styles.reportsSectionCardBody}>
            {loading ? (
              <p className={cx(ui.textMuted, styles.emptySection)}>Cargando...</p>
            ) : invalidCustomRange ? (
              <p className={cx(ui.alertError, styles.emptySection)}>
                La fecha de inicio debe ser anterior o igual a la de fin.
              </p>
            ) : accessibleUsers.length > 0 ? (
              <>
                {showWorkersChart && (
                  <div
                    id="reports-workers-chart-panel"
                    className={styles.sectionChartPanel}
                  >
                    <ReportBreakdownDonutChart
                      rows={workersChartRows}
                      measure={workersChartMeasure}
                      ariaLabel={
                        workersChartMeasure === 'signatures'
                          ? 'Actividades firmadas y sin firma en el periodo'
                          : 'Distribución por operario'
                      }
                    />
                    {!isDesktop && (
                      <ReportBreakdownChartToggles
                        measure={workersChartMeasure}
                        onMeasureChange={setWorkersChartMeasure}
                        includeSignatures={workerSignaturesEnabled}
                        className={styles.chartControlsBelow}
                      />
                    )}
                  </div>
                )}
                {visibleWorkerRows.length > 0 ? (
                  <div className={styles.clientReportList}>
                    {visibleWorkerRows.map((row) => {
                      const rowHasPeriodData = workerHasPeriodData(row);
                      const rowGenerateTooltip = getReportGenerateTooltip({
                        invalidCustomRange,
                        hasPeriodData: rowHasPeriodData,
                        generating: generatingReport,
                        entity: 'operario',
                        reportKind: 'worker',
                      });

                      return (
                        <div key={row.user.id} className={styles.clientReportItem}>
                          {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => openWorkerActivities(row.user.id)}
                            className={styles.clientReportLink}
                          >
                            <div className={ui.fontMedium}>{row.user.name}</div>
                            <div className={styles.savedMeta}>
                              {row.activityCount > 0 && (
                                <>
                                  {row.activityCount}{' '}
                                  {row.activityCount === 1 ? 'actividad' : 'actividades'}
                                  <WorkerPeriodActivityMeta
                                    row={row}
                                    workerSignaturesEnabled={workerSignaturesEnabled}
                                    shiftSchedulingEnabled={shiftSchedulingEnabled}
                                  />
                                </>
                              )}
                              <WorkerPeriodDocumentMeta
                                row={row}
                                hasLeadingContent={row.activityCount > 0}
                              />
                            </div>
                          </button>
                          ) : (
                          <div className={styles.clientReportLink}>
                            <div className={ui.fontMedium}>{row.user.name}</div>
                            <div className={styles.savedMeta}>
                              {row.activityCount > 0 && (
                                <>
                                  {row.activityCount}{' '}
                                  {row.activityCount === 1 ? 'actividad' : 'actividades'}
                                  <WorkerPeriodActivityMeta
                                    row={row}
                                    workerSignaturesEnabled={workerSignaturesEnabled}
                                    shiftSchedulingEnabled={shiftSchedulingEnabled}
                                  />
                                </>
                              )}
                              <WorkerPeriodDocumentMeta
                                row={row}
                                hasLeadingContent={row.activityCount > 0}
                              />
                            </div>
                          </div>
                          )}
                          <div className={styles.clientReportActions}>
                            <span
                              className={styles.generateBtnWrap}
                              title={
                                invalidCustomRange
                                  ? 'Seleccione un periodo válido'
                                  : row.activityCount > 0
                                    ? 'Descargar detalle CSV (actividades, zonas, albaranes)'
                                    : 'Sin actividades en el periodo'
                              }
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadWorkerDetail(row.user.id, row.user.name);
                                }}
                                className={ui.btnIcon}
                                aria-label="Descargar informe detallado CSV"
                                disabled={invalidCustomRange || row.activityCount === 0}
                              >
                                <FilePlus size={16} />
                              </button>
                            </span>
                            <span className={styles.generateBtnWrap} title={rowGenerateTooltip}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleGenerateReport({
                                    workerUserId: row.user.id,
                                    kind: 'worker',
                                  });
                                }}
                                className={ui.btnIcon}
                                title={rowGenerateTooltip}
                                aria-label={rowGenerateTooltip}
                                disabled={
                                  invalidCustomRange || generatingReport || !rowHasPeriodData
                                }
                              >
                                <ArrowDownToLine size={16} />
                              </button>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <InfiniteScrollSentinel
                      sentinelRef={workerRowsSentinelRef}
                      hasMore={hasMoreWorkerRows}
                    />
                  </div>
                ) : workerReportRows.length === 0 ? (
                  <div className={styles.emptySection}>
                    <EmptyState
                      emoji="📊"
                      description="No hay operarios con actividades ni documentos en el periodo."
                    />
                  </div>
                ) : (
                  <p className={cx(ui.textMuted, styles.emptySection)}>
                    No hay operarios que coincidan con la búsqueda.
                  </p>
                )}
              </>
            ) : (
              <div className={styles.emptySection}>
                <EmptyState
                  emoji="📊"
                  description="No hay operarios registrados."
                />
              </div>
            )}
            </div>
            </div>
          </section>
          {isAdmin ? (
            <div className={cx(styles.generateTabFooter, styles.periodCardGenerate)}>
              {renderSectionGenerateButton('workers')}
            </div>
          ) : null}
          </div>
          ) : null}

          {activeGenerateTab === 'summary' ? (
          <div
            role="tabpanel"
            id="reports-generate-panel-summary"
            aria-labelledby="reports-generate-tab-summary"
            className={styles.generateTabPanel}
          >
            <DatePeriodFilters
              sectionLayout
              sectionPart="panel"
              className={cx(
                dashboardStyles.filtersSection,
                styles.periodSection,
                isMobile && styles.reportsPeriodSection,
              )}
              panelClassName={cx(dashboardStyles.filtersCardAccent, styles.periodCard)}
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
                metrics={reportsPeriodMetrics}
                metricsStripClassName={periodMetricsStyles.periodMetricsStrip}
                selectedMetricId={selectedPeriodMetricId}
                chartsExpanded={chartsExpanded}
                onMetricSelect={handlePeriodMetricSelect}
                onChartDimensionChange={handleChartDimensionChange}
                defaultMetricId={reportsDefaultMetricId}
                chartsPanelId="reports-charts-panel"
                activities={chartActivities}
                events={events}
                activityTypes={activityTypes}
                clients={chartClients}
                documents={isAdmin ? documents : operatorDocuments}
                from={dateRange.from}
                to={dateRange.to}
                invalidCustomRange={invalidCustomRange}
                hideChartViewToggle
                isDesktop={isDesktop}
                chartControlsHost={chartControlsHost}
              />
            </DatePeriodFilters>
        <div className={styles.generateSummaryStack}>
          <section
            className={cx(
              ui.pageSectionFill,
              ui.pageSection,
              dashboardStyles.dashboardHoverSection,
              styles.reportsMobileSection,
            )}
          >
            <RecentActivitiesSection
              activities={scopedActivities}
              events={events}
              clients={accessibleClients}
              documents={documents}
              activityTypes={activityTypes}
              from={dateRange.from}
              to={dateRange.to}
              invalidCustomRange={invalidCustomRange}
              plainSectionHeader
              cardClassName={cx(
                dashboardStyles.dashboardSectionCard,
                styles.reportsSectionCard,
              )}
              cardBodyClassName={styles.reportsSectionCardBody}
              emptyStateClassName={dashboardStyles.dashboardSectionEmpty}
              collapsibleDonutChart
              donutChartExpanded={activitiesChartExpanded}
              onDonutChartToggle={() => setActivitiesChartExpanded((expanded) => !expanded)}
              donutChartGroupBy={activitiesChartGroupBy}
              donutChartValueMeasure={activitiesChartValueMeasure}
              onDonutChartGroupByChange={setActivitiesChartGroupBy}
              onDonutChartValueMeasureChange={setActivitiesChartValueMeasure}
            />
          </section>
          <section
            className={cx(
              ui.pageSectionFill,
              ui.pageSection,
              dashboardStyles.dashboardHoverSection,
              styles.reportsMobileSection,
            )}
          >
            <InvoiceConceptsSection
              documents={documents}
              clients={accessibleClients}
              from={dateRange.from}
              to={dateRange.to}
              clientId={reportClientScope}
              invalidCustomRange={invalidCustomRange}
              variant="card"
              pageSectionHeader
              plainSectionHeader
              cardClassName={cx(
                dashboardStyles.dashboardSectionCard,
                styles.reportsSectionCard,
              )}
              cardBodyClassName={styles.reportsSectionCardBody}
              emptyStateClassName={dashboardStyles.dashboardSectionEmpty}
              collapsibleDonutChart
              donutChartExpanded={conceptsChartExpanded}
              onDonutChartToggle={() => setConceptsChartExpanded((expanded) => !expanded)}
            />
          </section>
        </div>
          {isAdmin ? (
            <div className={cx(styles.generateTabFooter, styles.periodCardGenerate)}>
              {renderSectionGenerateButton('general')}
            </div>
          ) : null}
          </div>
          ) : null}
        </div>
        </div>

          </div>
        ) : mainView === 'preview' && previewPdfUrl && previewHeader ? (
          <>
            <div className={documentDetailStyles.pageHeaderRow}>
              <div className={cx(ui.pageTitleRow, documentDetailStyles.pageHeaderOuter)}>
                <SidebarToggle />
                <div className={documentDetailStyles.pageHeaderMain}>
                  <div className={cx(ui.pageTitleRow, documentDetailStyles.pageHeaderTitleRow)}>
                    <button
                      type="button"
                      onClick={openGenerateView}
                      className={ui.pageBackBtn}
                      aria-label="Volver"
                    >
                      <ArrowLeft size={20} />
                    </button>
                    {secondaryNavCollapsed ? (
                      <SecondaryNavToggle
                        expanded={false}
                        onToggle={toggleSecondaryNav}
                        controlsId="reports-secondary-nav"
                        className={cx(
                          headerStyles.headerSecondaryNavToggle,
                          styles.secondaryNavExpandBtn,
                        )}
                      />
                    ) : null}
                    <div className={cx(headerStyles.headerTitleGroup, headerStyles.headerTitleGroupGrow)}>
                      <h1 className={cx(ui.pageTitle, headerStyles.headerTitleText)}>
                        {previewHeader.title}
                      </h1>
                      {(previewHeader.generatedBy || previewHeader.generatedRelative) && (
                        <span className={headerStyles.headerTitleMeta}>
                          {previewHeader.generatedBy ? (
                            <span className={headerStyles.headerAuthor}>
                              <UserAvatar user={previewHeader.generatedBy} size="xs" />
                              <span className={headerStyles.headerAuthorName}>
                                {previewHeader.generatedBy.name}
                              </span>
                            </span>
                          ) : null}
                          {previewHeader.generatedBy && previewHeader.generatedRelative ? (
                            <span className={headerStyles.headerMetaSep} aria-hidden>
                              ·
                            </span>
                          ) : null}
                          {previewHeader.generatedRelative ? (
                            <span className={headerStyles.headerTitleRelative}>
                              {previewHeader.generatedRelative.charAt(0).toUpperCase() +
                                previewHeader.generatedRelative.slice(1)}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                    {selectedSavedReport ? (
                      <div className={documentDetailStyles.pageHeaderMetaAside}>
                        <div className={ui.toolbarBtnGroup}>
                          <button
                            type="button"
                            className={cx(ui.btnSecondary, ui.pageHeaderBtn)}
                            onClick={() => void handleDownloadSaved(selectedSavedReport)}
                          >
                            <ArrowDownToLine size={16} />
                            <span className={ui.pageHeaderBtnLabel}>Descargar</span>
                          </button>
                          <button
                            type="button"
                            className={cx(ui.btnSecondary, ui.pageHeaderBtn)}
                            onClick={() => void handleDeleteSaved(selectedSavedReport.id)}
                          >
                            <CircleMinus size={16} />
                            <span className={ui.pageHeaderBtnLabel}>Eliminar</span>
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className={documentDetailStyles.documentsDetailInner}>
              <PdfViewer
                className={documentDetailStyles.pdfFrame}
                src={previewPdfUrl}
                fileName={
                  previewHeader.title.endsWith('.pdf')
                    ? previewHeader.title
                    : `${previewHeader.title}.pdf`
                }
                title="Vista previa del informe"
              />
            </div>
          </>
        ) : (
          <div className={styles.reportsEmpty}>
          <EmptyState
            emoji="📊"
            title="Generar un informe"
            description="Elige el periodo y usa las pestañas Clientes, Operarios o Resumen para generar y descargar informes."
          />
          </div>
        )}
      </div>

      {sidebarDownloadMenu && (
        <ContextMenu
          x={sidebarDownloadMenu.x}
          y={sidebarDownloadMenu.y}
          ariaLabel="Tipo de informe"
          onClose={() => setSidebarDownloadMenu(null)}
          items={[
            {
              id: 'general',
              label: summaryDownloadLabel,
              icon: <ArrowDownToLine size={16} />,
              disabled: summaryGenerateDisabled,
              onSelect: () => {
                void handleGenerateReport({ kind: 'general' });
              },
            },
            {
              id: 'contacts',
              label: contactsGlobalDownloadLabel,
              icon: <ArrowDownToLine size={16} />,
              disabled: contactsGlobalGenerateDisabled,
              onSelect: () => {
                void handleGenerateReport({ kind: 'contacts_global' });
              },
            },
            {
              id: 'workers',
              label: workersGlobalDownloadLabel,
              icon: <ArrowDownToLine size={16} />,
              disabled: workersGlobalGenerateDisabled,
              onSelect: () => {
                void handleGenerateReport({ kind: 'workers_global' });
              },
            },
          ]}
        />
      )}

      {reportActionMenu && (
        <ContextMenu
          x={reportActionMenu.x}
          y={reportActionMenu.y}
          ariaLabel="Acciones del informe"
          onClose={() => setReportActionMenu(null)}
          items={[
            {
              id: 'open',
              label: 'Abrir',
              icon: <ExternalLink size={16} />,
              onSelect: () => {
                void handlePreviewSaved(reportActionMenu.report);
              },
            },
            {
              id: 'download',
              label: 'Descargar',
              icon: <ArrowDownToLine size={16} />,
              onSelect: () => {
                void handleDownloadSaved(reportActionMenu.report);
              },
            },
            {
              id: 'delete',
              label: 'Eliminar',
              icon: <CircleMinus size={16} />,
              danger: true,
              onSelect: () => {
                void handleDeleteSaved(reportActionMenu.report.id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
