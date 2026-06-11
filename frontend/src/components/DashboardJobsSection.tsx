import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownToLine, ChevronDown, Search } from 'lucide-react';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
  WorkerHoursStatus,
} from '@shared/types';
import { SHIFT_META } from '@shared/types';
import { authService, usersService } from '@/api';
import ActivityWorkerHoursStatus from '@/components/ActivityWorkerHoursStatus';
import CalendarEventButton from '@/components/CalendarEventButton';
import EmptyState from '@/components/EmptyState';
import { SearchField } from '@/components/forms';
import WorkShiftsBarChart, { WorkShiftsChartToggles } from '@/components/WorkShiftsBarChart';
import { useActivityModal } from '@/context/ActivityModalContext';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ActivityAssociationGapBanner from '@/components/ActivityAssociationGapBanner';
import {
  countActivityAssociationGaps,
  countActivityDocumentGaps,
  formatActivityDocumentGapBanner,
  formatActivityDocumentGapCellLabel,
  formatMissingDocumentSummary,
  getActivityDocumentGaps,
  listActivityAssociationGapsFromActivities,
  resolveActivitySignatureUserId,
  type ActivityDocumentGapInfo,
} from '@/lib/activityAssociationGaps';
import { ACTIVITIES_ALL_USERS_ID } from '@/lib/activitiesTeamFilter';
import {
  buildDashboardJobsMatrix,
  formatDashboardJobsHours,
  getPeriodPendingSignatureActivitiesForUser,
  sortDashboardJobsWorkerRows,
  type DashboardJobsActivityEntry,
  type DashboardJobsDayCell,
} from '@/lib/dashboardJobsMatrix';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { downloadDashboardJobsCsv } from '@/lib/dashboardJobsCsv';
import { buildDocumentsByActivity } from '@/lib/documentsByActivity';
import {
  hasAnyWorkShiftsChartData,
  type WorkShiftsGroupBy,
  type WorkShiftsValueMeasure,
} from '@/lib/workShiftsChartUtils';
import { cx } from '@/lib/cx';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import { getShiftPaletteColor, type ShiftColorMap } from '@/lib/shiftColorPalette';
import ui from '@/styles/shared.module.css';
import styles from './DashboardJobsSection.module.css';

function getDateColumnFlags(date: string) {
  const parsed = parseISO(date);
  const day = startOfDay(parsed);

  return {
    parsed,
    isToday: isSameDay(day, startOfDay(new Date())),
    isPast: isBefore(day, startOfDay(new Date())),
  };
}

function cellHasPendingSignature(cell: DashboardJobsDayCell | undefined): boolean {
  if (!cell) return false;
  return cell.entries.some((entry) => entry.needsSignature && !entry.awaitingSlotEnd);
}

function cellDocumentGapSummary(
  cell: DashboardJobsDayCell,
  activityDocumentGapsById: Map<string, ActivityDocumentGapInfo>,
  viewerIsAdmin: boolean,
) {
  let gapCount = 0;
  let primaryLabel: string | null = null;

  for (const entry of cell.entries) {
    const gaps = activityDocumentGapsById.get(entry.activity.id);
    if (!gaps?.lacksDocuments) continue;
    gapCount += 1;
    if (entry.activity.id === cell.primaryEntry.activity.id) {
      primaryLabel = formatActivityDocumentGapCellLabel(gaps, viewerIsAdmin);
    }
  }

  if (!primaryLabel && gapCount > 0) {
    const gaps = activityDocumentGapsById.get(cell.primaryEntry.activity.id);
    if (gaps) {
      primaryLabel = formatActivityDocumentGapCellLabel(gaps, viewerIsAdmin);
    }
  }

  return { hasGap: gapCount > 0, gapCount, primaryLabel };
}

function countRowDocumentGaps(
  row: { cellsByDate: Record<string, DashboardJobsDayCell | undefined> },
  dates: string[],
  activityDocumentGapsById: Map<string, ActivityDocumentGapInfo>,
): number {
  const seen = new Set<string>();
  let count = 0;

  for (const date of dates) {
    const cell = row.cellsByDate[date];
    if (!cell) continue;
    for (const entry of cell.entries) {
      if (seen.has(entry.activity.id)) continue;
      seen.add(entry.activity.id);
      if (activityDocumentGapsById.get(entry.activity.id)?.lacksDocuments) {
        count += 1;
      }
    }
  }

  return count;
}

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
  collapsibleChart?: boolean;
  chartExpanded?: boolean;
  onChartToggle?: () => void;
  chartGroupBy?: WorkShiftsGroupBy;
  chartValueMeasure?: WorkShiftsValueMeasure;
  onChartGroupByChange?: (groupBy: WorkShiftsGroupBy) => void;
  onChartValueMeasureChange?: (valueMeasure: WorkShiftsValueMeasure) => void;
};

function entryToHoursStatus(entry: DashboardJobsActivityEntry): WorkerHoursStatus {
  return {
    assignedHours: entry.assignedHours,
    signedHours: entry.signedHours,
    pendingHours: Math.max(0, entry.assignedHours - entry.signedHours),
    isSigned: entry.signedHours > 0,
    needsSignature: entry.needsSignature,
    awaitingSlotEnd: entry.awaitingSlotEnd,
    canSignNow: entry.canSignNow,
  };
}

type ShiftCellProps = {
  cell: DashboardJobsDayCell;
  workerUserId: string;
  workerName: string;
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
  documentsByActivity: Map<string, Document[]>;
  assigneesById: Map<string, UserAssignee>;
  events: CalendarEvent[];
  onOpenActivity: (activity: Activity) => void;
  onSignActivity: (activity: Activity) => void;
  viewerUserId?: string;
  isAdmin: boolean;
  isPastColumn?: boolean;
  shiftSchedulingEnabled: boolean;
  workerSignaturesEnabled: boolean;
  documentGapLabel: string | null;
  documentGapCount: number;
};

function DashboardJobsShiftCell({
  cell,
  workerUserId,
  workerName,
  clientsMap,
  activityTypes,
  documentsByActivity,
  assigneesById,
  events,
  onOpenActivity,
  onSignActivity,
  viewerUserId,
  isAdmin,
  shiftColors,
  isPastColumn = false,
  shiftSchedulingEnabled,
  workerSignaturesEnabled,
  documentGapLabel,
  documentGapCount,
}: ShiftCellProps & { shiftColors: ShiftColorMap }) {
  const meta = SHIFT_META[cell.shift];
  const { activity, event } = cell.primaryEntry;
  const multipleActivities = cell.entries.length > 1;
  const status = entryToHoursStatus(cell.primaryEntry);
  const fadeShiftContent =
    workerSignaturesEnabled && isPastColumn && cellHasPendingSignature(cell);
  const hasDocumentGap = documentGapCount > 0;

  return (
    <CalendarEventButton
      event={event}
      activity={activity}
      clientsMap={clientsMap}
      activityTypes={activityTypes}
      documentsByActivity={documentsByActivity}
      assigneesById={assigneesById}
      events={events}
      className={cx(
        styles.shiftCellButton,
        hasDocumentGap && styles.shiftCellButtonDocumentGap,
      )}
      onClick={() => onOpenActivity(activity)}
    >
      <div className={styles.shiftCell}>
        {shiftSchedulingEnabled ? (
          <span
            className={cx(styles.shiftBadge, fadeShiftContent && styles.shiftPastContent)}
            style={{ backgroundColor: getShiftPaletteColor(cell.shift, shiftColors) }}
          >
            {meta.shortLabel}
          </span>
        ) : null}
        <span className={cx(styles.hourRange, fadeShiftContent && styles.shiftPastContent)}>
          {cell.hourRange}
        </span>
        {workerSignaturesEnabled ? (
          <ActivityWorkerHoursStatus
            status={status}
            compact
            workerUserId={workerUserId}
            workerName={workerName}
            viewerUserId={viewerUserId}
            isAdmin={isAdmin}
            onSignClick={() => onSignActivity(activity)}
          />
        ) : null}
        {documentGapLabel ? (
          <span
            className={cx(styles.documentGapBadge, fadeShiftContent && styles.shiftPastContent)}
            title={
              documentGapCount > 1
                ? `${documentGapCount} actividades con documento pendiente`
                : 'Actividad con documento pendiente'
            }
          >
            {documentGapLabel}
          </span>
        ) : null}
        {multipleActivities ? (
          <span
            className={cx(styles.multipleActivitiesHint, fadeShiftContent && styles.shiftPastContent)}
          >
            +{cell.entries.length - 1}
            {workerSignaturesEnabled && cell.pendingCount > 0
              ? ` · ${cell.pendingCount} sin firma`
              : ''}
            {hasDocumentGap && documentGapCount > 1
              ? ` · ${documentGapCount} sin doc.`
              : ''}
          </span>
        ) : null}
      </div>
    </CalendarEventButton>
  );
}

export default function DashboardJobsSection({
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
  collapsibleChart = false,
  chartExpanded = false,
  onChartToggle,
  chartGroupBy = 'team',
  chartValueMeasure = 'hours',
  onChartGroupByChange,
  onChartValueMeasureChange,
}: Props) {
  const { openEditByActivity } = useActivityModal();
  const { boundaries } = useWorkspaceScheduleSettings();
  const { shiftSchedulingEnabled, workerSignaturesEnabled } = useWorkspaceFeatureSettings();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const viewerUserId = currentUser?.id;
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const [operarioSearchTerm, setOperarioSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const shiftColors = useShiftColorPalette();

  useEffect(() => {
    let cancelled = false;
    void usersService.getAssignees().then((users) => {
      if (!cancelled) setAssignees(users);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clientsMap = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const assigneesById = useMemo(
    () => new Map(assignees.map((user) => [user.id, user])),
    [assignees],
  );
  const documentsByActivity = useMemo(
    () => buildDocumentsByActivity(documents),
    [documents],
  );

  const matrix = useMemo(
    () => buildDashboardJobsMatrix(activities, events, assignees, from, to),
    [activities, events, assignees, from, to],
  );

  const pendingSignatureActivities = useMemo(() => {
    if (!workerSignaturesEnabled || !viewerUserId) return [];
    return getPeriodPendingSignatureActivitiesForUser(
      activities,
      events,
      viewerUserId,
      from,
      to,
    );
  }, [activities, events, viewerUserId, from, to, workerSignaturesEnabled]);

  const filteredRows = useMemo(() => {
    const term = operarioSearchTerm.toLowerCase().trim();
    let rows = matrix.rows;

    if (term) {
      const tokens = term.split(/\s+/).filter(Boolean);
      rows = rows.filter((row) => {
        const haystack = row.userName.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }

    return sortDashboardJobsWorkerRows(rows, matrix.dates, viewerUserId);
  }, [matrix.rows, matrix.dates, operarioSearchTerm, viewerUserId]);

  const tableDates = useMemo(
    () =>
      matrix.dates.filter((date) =>
        filteredRows.some((row) => row.cellsByDate[date] != null),
      ),
    [matrix.dates, filteredRows],
  );

  const handleOpenActivity = useCallback(
    (activity: Activity) => {
      openEditByActivity(activity, events, { navigate: false });
    },
    [openEditByActivity, events],
  );

  const matrixActivities = useMemo(() => {
    const byId = new Map<string, Activity>();
    for (const row of filteredRows) {
      for (const date of tableDates) {
        const cell = row.cellsByDate[date];
        if (!cell) continue;
        for (const entry of cell.entries) {
          byId.set(entry.activity.id, entry.activity);
        }
      }
    }
    return [...byId.values()];
  }, [filteredRows, tableDates]);

  const documentGapOptions = useMemo(
    () => ({
      viewerIsAdmin: isAdmin,
      activityTypes,
      operatorUserId: viewerUserId,
    }),
    [isAdmin, activityTypes, viewerUserId],
  );

  const periodHoursSummary = useMemo(() => {
    let assigned = 0;
    let signed = 0;
    let pendingActivities = 0;
    for (const row of filteredRows) {
      assigned += row.totalAssignedHours;
      signed += row.totalSignedHours;
      pendingActivities += row.pendingSignatureCount;
    }
    return {
      assignedHours: Math.round(assigned * 10) / 10,
      signedHours: Math.round(signed * 10) / 10,
      pendingActivities,
    };
  }, [filteredRows]);

  const activityDocumentGapsById = useMemo(() => {
    const map = new Map<string, ActivityDocumentGapInfo>();
    for (const activity of matrixActivities) {
      map.set(
        activity.id,
        getActivityDocumentGaps(activity, documentsByActivity, documentGapOptions),
      );
    }
    return map;
  }, [matrixActivities, documentsByActivity, documentGapOptions]);

  const periodDocumentSummary = useMemo(() => {
    const counts = countActivityDocumentGaps(
      matrixActivities,
      documentsByActivity,
      documentGapOptions,
    );
    return {
      counts,
      summaryLabel: formatMissingDocumentSummary(counts, isAdmin),
    };
  }, [matrixActivities, documentsByActivity, documentGapOptions, isAdmin]);

  const teamAssigneeIds = useMemo(
    () => new Set(assignees.map((user) => user.id)),
    [assignees],
  );

  const documentGapBanner = useMemo(() => {
    const counts = countActivityAssociationGaps(
      activities,
      events,
      documentsByActivity,
      isAdmin ? ACTIVITIES_ALL_USERS_ID : viewerUserId ?? '',
      teamAssigneeIds,
      viewerUserId,
      boundaries,
      documentGapOptions,
    );
    return formatActivityDocumentGapBanner(
      {
        withoutInvoice: counts.withoutInvoice,
        withoutDeliveryNote: counts.withoutDeliveryNote,
        withoutWorkReport: counts.withoutWorkReport,
      },
      from,
      to,
      isAdmin,
    );
  }, [
    activities,
    events,
    documentsByActivity,
    isAdmin,
    viewerUserId,
    teamAssigneeIds,
    boundaries,
    documentGapOptions,
    from,
    to,
  ]);

  const documentGapItems = useMemo(
    () =>
      listActivityAssociationGapsFromActivities(
        activities,
        events,
        documentsByActivity,
        resolveActivitySignatureUserId(
          isAdmin ? ACTIVITIES_ALL_USERS_ID : viewerUserId ?? '',
          viewerUserId,
        ),
        boundaries,
        documentGapOptions,
      ).filter((item) => item.lacksDocuments),
    [activities, events, documentsByActivity, documentGapOptions, viewerUserId, boundaries, isAdmin],
  );

  const hasChartData =
    !invalidCustomRange &&
    hasAnyWorkShiftsChartData(
      activities,
      events,
      assignees,
      documents,
      activityTypes,
      from,
      to,
    );

  const showChart = hasChartData && (!collapsibleChart || chartExpanded);
  const showChartToggle = collapsibleChart && hasChartData && onChartToggle != null;

  const showChartToggles =
    (onChartGroupByChange != null || onChartValueMeasureChange != null) && showChart;

  const chartToggles = showChartToggles ? (
    isDesktop ? (
      <WorkShiftsChartToggles
        groupBy={chartGroupBy}
        valueMeasure={chartValueMeasure}
        onGroupByChange={onChartGroupByChange ?? (() => {})}
        onValueMeasureChange={onChartValueMeasureChange ?? (() => {})}
        workerSignaturesEnabled={workerSignaturesEnabled}
        shiftSchedulingEnabled={shiftSchedulingEnabled}
        className={styles.headerChartToggles}
      />
    ) : (
      <div className={styles.chartControlsBelow} {...scrollRegionProps}>
        <WorkShiftsChartToggles
          groupBy={chartGroupBy}
          valueMeasure={chartValueMeasure}
          onGroupByChange={onChartGroupByChange ?? (() => {})}
          onValueMeasureChange={onChartValueMeasureChange ?? (() => {})}
          workerSignaturesEnabled={workerSignaturesEnabled}
          shiftSchedulingEnabled={shiftSchedulingEnabled}
        />
      </div>
    )
  ) : null;

  useEffect(() => {
    if (
      !workerSignaturesEnabled &&
      onChartValueMeasureChange &&
      (chartValueMeasure === 'hoursSigned' || chartValueMeasure === 'hoursAssigned')
    ) {
      onChartValueMeasureChange('hours');
    }
  }, [workerSignaturesEnabled, chartValueMeasure, onChartValueMeasureChange]);

  useEffect(() => {
    if (!shiftSchedulingEnabled && onChartGroupByChange && chartGroupBy === 'shift') {
      onChartGroupByChange('team');
    }
  }, [shiftSchedulingEnabled, chartGroupBy, onChartGroupByChange]);

  const hasMatrixData = matrix.dates.length > 0 && matrix.rows.length > 0;
  const hasFilteredTableData = tableDates.length > 0 && filteredRows.length > 0;
  const canSearch = hasMatrixData && !invalidCustomRange;
  const canDownload = hasMatrixData && !invalidCustomRange;
  const showSearchField = canSearch && searchOpen;

  const handleDownloadCsv = useCallback(() => {
    if (!canDownload) return;
    const filename = `horas-actividad-${from}_${to}.csv`;
    downloadDashboardJobsCsv(matrix, filename, {
      rows: filteredRows,
      dates: tableDates,
      includeShifts: shiftSchedulingEnabled,
      includeSignatures: workerSignaturesEnabled,
    });
  }, [
    canDownload,
    from,
    to,
    matrix,
    filteredRows,
    tableDates,
    shiftSchedulingEnabled,
    workerSignaturesEnabled,
  ]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (canSearch) return;
    setSearchOpen(false);
    setOperarioSearchTerm('');
  }, [canSearch]);

  const matrixGrandTotals = useMemo(() => {
    const assigned = filteredRows.reduce((acc, row) => acc + row.totalAssignedHours, 0);
    const signed = filteredRows.reduce((acc, row) => acc + row.totalSignedHours, 0);
    return {
      assigned: Math.round(assigned * 10) / 10,
      signed: Math.round(signed * 10) / 10,
    };
  }, [filteredRows]);

  const downloadToggle = canDownload ? (
    <button
      type="button"
      className={styles.sectionDownloadBtn}
      aria-label="Descargar horas de actividad"
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
      aria-label={searchOpen ? 'Ocultar búsqueda' : 'Buscar operarios'}
      aria-expanded={searchOpen}
      onClick={() => setSearchOpen((open) => !open)}
    >
      <Search size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const pendingSignaturesAreTodayOnly =
    pendingSignatureActivities.length > 0 &&
    pendingSignatureActivities.every((activity) => activity.date === todayKey);

  const pendingSignatureBanner =
    workerSignaturesEnabled && pendingSignatureActivities.length > 0 ? (
      <div className={styles.todaySignatureBanner} role="status">
        <p className={styles.todaySignatureBannerText}>
          {pendingSignaturesAreTodayOnly ? 'Hoy tienes ' : 'Tienes '}
          {pendingSignatureActivities.length === 1 ? (
            <>
              <strong>1 actividad</strong> con horas pendientes de firma.
            </>
          ) : (
            <>
              <strong>{pendingSignatureActivities.length} actividades</strong> con horas pendientes
              de firma.
            </>
          )}
        </p>
        {pendingSignatureActivities.length === 1 ? (
          <button
            type="button"
            className={styles.todaySignatureSignBtn}
            onClick={() => handleOpenActivity(pendingSignatureActivities[0]!)}
          >
            Firmar horas
          </button>
        ) : (
          <span className={styles.hoursSummaryHint}>
            Pulsa la celda correspondiente en la tabla para firmar cada tramo.
          </span>
        )}
      </div>
    ) : null;

  const searchField = showSearchField ? (
    <div className={cx(ui.listPanelToolbar, styles.sectionSearch)}>
      <div className={ui.filtersRow}>
        <SearchField
          ref={searchInputRef}
          wrapperClassName={ui.searchWrapper}
          placeholder="Buscar operario"
          value={operarioSearchTerm}
          onChange={(e) => setOperarioSearchTerm(e.target.value)}
        />
      </div>
    </div>
  ) : null;

  const hoursSummaryBar =
    hasFilteredTableData && !invalidCustomRange ? (
      <div className={styles.hoursSummaryBar} role="status">
        <span>
          <strong>{formatDashboardJobsHours(periodHoursSummary.assignedHours)}h</strong> de
          actividad
        </span>
        {workerSignaturesEnabled ? (
          <>
            <span className={styles.hoursSummarySep}>·</span>
            <span className={styles.hoursSummarySigned}>
              <strong>{formatDashboardJobsHours(periodHoursSummary.signedHours)}h</strong> firmadas
            </span>
            {periodHoursSummary.pendingActivities > 0 ? (
              <>
                <span className={styles.hoursSummarySep}>·</span>
                <span className={styles.hoursSummaryPending}>
                  {periodHoursSummary.pendingActivities}{' '}
                  {periodHoursSummary.pendingActivities === 1
                    ? 'actividad sin firma'
                    : 'actividades sin firma'}
                </span>
              </>
            ) : null}
            {!isAdmin && viewerUserId ? (
              <span className={styles.hoursSummaryHint}>
                Pulsa una celda para registrar tu tramo y firmar.
              </span>
            ) : null}
          </>
        ) : null}
        {periodDocumentSummary.summaryLabel ? (
          <>
            <span className={styles.hoursSummarySep}>·</span>
            <span className={styles.hoursSummaryPending}>{periodDocumentSummary.summaryLabel}</span>
          </>
        ) : null}
      </div>
    ) : null;

  const tableContent = hasMatrixData ? (
    hasFilteredTableData ? (
      <>
        {hoursSummaryBar}
        <div className={styles.tableScroll} {...scrollRegionProps}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.workerHeader}>
                  Operarios
                </th>
                {tableDates.map((date) => {
                  const { parsed, isToday, isPast } = getDateColumnFlags(date);
                  return (
                    <th
                      key={date}
                      scope="col"
                      aria-current={isToday ? 'date' : undefined}
                      className={cx(
                        styles.dateHeader,
                        isPast && !isToday && styles.dateHeaderPast,
                        isToday && styles.dateHeaderToday,
                      )}
                    >
                      <span
                        className={cx(styles.dateHeaderDay, isToday && styles.dateHeaderDayToday)}
                      >
                        {format(parsed, 'd MMM', { locale: es })}
                      </span>
                      <span
                        className={cx(
                          styles.dateHeaderWeekday,
                          isToday && styles.dateHeaderWeekdayToday,
                        )}
                      >
                        {format(parsed, 'EEE', { locale: es })}
                      </span>
                    </th>
                  );
                })}
                <th
                  scope="col"
                  className={cx(
                    styles.hoursAssignedHeader,
                    !workerSignaturesEnabled && styles.hoursAssignedOnly,
                  )}
                >
                  Horas
                </th>
                {workerSignaturesEnabled ? (
                  <th scope="col" className={styles.hoursSignedHeader}>
                    Firm.
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowDocumentGapCount = countRowDocumentGaps(
                  row,
                  tableDates,
                  activityDocumentGapsById,
                );

                return (
                <tr
                  key={row.userId}
                  className={cx(
                    workerSignaturesEnabled && row.pendingSignatureCount > 0 && styles.rowPending,
                    rowDocumentGapCount > 0 && styles.rowDocumentGap,
                  )}
                >
                  <th scope="row" className={styles.workerCell}>
                    <span className={styles.workerName}>{row.userName}</span>
                    {workerSignaturesEnabled && row.pendingSignatureCount > 0 ? (
                      <span className={styles.workerPendingBadge}>
                        {row.pendingSignatureCount} sin firma
                      </span>
                    ) : null}
                    {rowDocumentGapCount > 0 ? (
                      <span className={styles.workerDocumentGapBadge}>
                        {rowDocumentGapCount} sin doc.
                      </span>
                    ) : null}
                  </th>
                  {tableDates.map((date) => {
                    const cell = row.cellsByDate[date];
                    const { isToday, isPast } = getDateColumnFlags(date);
                    const isPastColumn = isPast && !isToday;
                    const documentGapSummary = cell
                      ? cellDocumentGapSummary(cell, activityDocumentGapsById, isAdmin)
                      : null;

                    return (
                      <td
                        key={date}
                        className={cx(
                          cell && styles.dateCellInteractive,
                          documentGapSummary?.hasGap && styles.dateCellDocumentGap,
                          isPastColumn &&
                            (!workerSignaturesEnabled || !cellHasPendingSignature(cell)) &&
                            styles.dateCellPast,
                          isToday && styles.dateCellToday,
                        )}
                      >
                        {cell ? (
                          <DashboardJobsShiftCell
                            cell={cell}
                            workerUserId={row.userId}
                            workerName={row.userName}
                            clientsMap={clientsMap}
                            activityTypes={activityTypes}
                            documentsByActivity={documentsByActivity}
                            assigneesById={assigneesById}
                            events={events}
                            onOpenActivity={handleOpenActivity}
                            onSignActivity={handleOpenActivity}
                            viewerUserId={viewerUserId}
                            isAdmin={isAdmin}
                            shiftColors={shiftColors}
                            isPastColumn={isPastColumn}
                            shiftSchedulingEnabled={shiftSchedulingEnabled}
                            workerSignaturesEnabled={workerSignaturesEnabled}
                            documentGapLabel={documentGapSummary?.primaryLabel ?? null}
                            documentGapCount={documentGapSummary?.gapCount ?? 0}
                          />
                        ) : (
                          <span className={styles.emptyCell} aria-hidden />
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={cx(
                      styles.hoursAssignedCell,
                      !workerSignaturesEnabled && styles.hoursAssignedOnly,
                    )}
                  >
                    {formatDashboardJobsHours(row.totalAssignedHours)}
                  </td>
                  {workerSignaturesEnabled ? (
                    <td
                      className={cx(
                        styles.hoursSignedCell,
                        row.totalSignedHours < row.totalAssignedHours &&
                          styles.hoursSignedCellPending,
                      )}
                    >
                      {formatDashboardJobsHours(row.totalSignedHours)}
                    </td>
                  ) : null}
                </tr>
              );
              })}
              <tr className={styles.totalRow}>
                <th
                  scope="row"
                  colSpan={tableDates.length + 1}
                  className={styles.workerCell}
                >
                  <span className={styles.totalLabel}>Total</span>
                  <span className={styles.totalCount}>({filteredRows.length})</span>
                </th>
                <td
                  className={cx(
                    styles.hoursAssignedCell,
                    !workerSignaturesEnabled && styles.hoursAssignedOnly,
                  )}
                >
                  <span className={styles.totalHoursValue}>
                    {formatDashboardJobsHours(matrixGrandTotals.assigned)}
                  </span>
                </td>
                {workerSignaturesEnabled ? (
                  <td className={styles.hoursSignedCell}>
                    <span className={styles.totalHoursValue}>
                      {formatDashboardJobsHours(matrixGrandTotals.signed)}
                    </span>
                  </td>
                ) : null}
              </tr>
            </tbody>
          </table>
        </div>
      </>
    ) : (
      <div className={cx(styles.emptyStateCardBody, emptyStateClassName)}>
        <EmptyState
          emoji="🔍"
          description="No hay operarios que coincidan con la búsqueda."
          compact
        />
      </div>
    )
  ) : (
    <div className={cx(styles.emptyStateCardBody, emptyStateClassName)}>
      <EmptyState
        emoji="📅"
        description="No hay actividades con horas asignadas en el periodo seleccionado."
        compact
      />
    </div>
  );

  const bodyContent = invalidCustomRange ? (
    <p className={cx(ui.alertError, emptyStateClassName)}>
      La fecha de inicio debe ser anterior o igual a la de fin.
    </p>
  ) : (
    <>
      {showChart && (
        <div id={collapsibleChart ? 'dashboard-work-shifts-chart-panel' : undefined}>
          <WorkShiftsBarChart
            activities={activities}
            events={events}
            assignees={assignees}
            documents={documents}
            activityTypes={activityTypes}
            from={from}
            to={to}
            groupBy={chartGroupBy}
            valueMeasure={chartValueMeasure}
          />
          {!isDesktop && chartToggles}
        </div>
      )}
      {tableContent}
    </>
  );

  return (
    <>
      <div className={plainSectionHeader ? ui.pageSectionTitleRow : ui.pageSectionHeading}>
        <h2 className={ui.pageSectionTitle}>Horas de actividad</h2>
        <div className={styles.sectionTitleActions}>
          {isDesktop ? chartToggles : null}
          {downloadToggle}
          {searchToggle}
        </div>
      </div>
      {pendingSignatureBanner}
      {documentGapBanner && documentGapItems.length > 0 ? (
        <ActivityAssociationGapBanner
          content={documentGapBanner}
          items={documentGapItems}
          events={events}
          clientsMap={clientsMap}
          activityTypes={activityTypes}
          documentsByActivity={documentsByActivity}
          assigneesById={assigneesById}
        />
      ) : null}
      {searchField}
      <div
        className={cx(
          ui.card,
          cardClassName,
          styles.cardShell,
          showChartToggle && styles.cardShellCollapsible,
        )}
      >
        <div className={cx(styles.cardBody, cardBodyClassName)}>{bodyContent}</div>
        {showChartToggle ? (
          <div className={styles.chartToggleRow}>
            <button
              type="button"
              className={styles.chartToggleBtn}
              onClick={onChartToggle}
              aria-expanded={chartExpanded}
              aria-controls="dashboard-work-shifts-chart-panel"
              aria-label={chartExpanded ? 'Ocultar gráfico' : 'Mostrar gráfico'}
              title={chartExpanded ? 'Ocultar gráfico' : 'Mostrar gráfico'}
            >
              <ChevronDown
                size={18}
                strokeWidth={2.25}
                className={cx(
                  styles.chartToggleChevron,
                  chartExpanded && styles.chartToggleChevronOpen,
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
