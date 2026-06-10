import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Activity, CalendarEvent, Client, Document } from '@shared/types';
import {
  SCHEDULE_MONTHLY_HOURS_WARNING,
  computeSchedulePeriodSummary,
  listUserSignedHoursOnDate,
} from '@shared/types';
import { documentsService } from '@/api';
import ConfigurableTable from '@/components/ConfigurableTable';
import TableGroupRow from '@/components/TableGroupRow';
import ViewFilterModal from '@/components/ViewFilterModal';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useTableView } from '@/hooks/useTableView';
import { getScheduleSummaryDays, formatScheduleJornadasLabel } from '@/lib/schedulePeriod';
import { buildScheduleJornadaRows } from '@/lib/scheduleJornadaRows';
import {
  SCHEDULE_JORNADA_DISPLAY_COLUMNS,
  SCHEDULE_JORNADAS_VIEW_PAGE_KEY,
  buildScheduleJornadaTableColumns,
} from '@/lib/scheduleJornadaTableView';
import { renderScheduleJornadaCell } from '@/lib/scheduleJornadaViewCells';
import {
  resolveTableDataCellClassName,
  resolveTableDataCellStyle,
} from '@/lib/tableColumnLayout';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './UserScheduleSummary.module.css';

type UserScheduleSummaryProps = {
  userName?: string;
  userId: string;
  currentDate: Date;
  entriesByDate: Map<string, import('@shared/types').ShiftCode>;
  activities: Activity[];
  events: CalendarEvent[];
  maxVacationDays?: number;
  className?: string;
};

const DATA_COLUMNS = buildScheduleJornadaTableColumns();

export default function UserScheduleSummary({
  userName,
  userId,
  currentDate,
  entriesByDate,
  activities,
  events,
  maxVacationDays = 0,
  className,
}: UserScheduleSummaryProps) {
  const navigate = useNavigate();
  const { openEditByActivity } = useActivityModal();
  const { activityTypes } = useActivityTypes();
  const { boundaries, shiftEventTimes } = useWorkspaceScheduleSettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);

  const tableCtx = useMemo(
    () => ({
      clientsMap: new Map(clients.map((client) => [client.id, client])),
      activityTypes,
    }),
    [clients, activityTypes],
  );

  const {
    config,
    viewConfig,
    draftConfig,
    modalOpen,
    openModal,
    closeModal: closeViewModal,
    applyDraft,
    updateDraft,
    activeFilterCount,
    hasViewChanges,
    hasDraftChanges,
    showViewIndicator,
    canRestoreView,
    savedViews,
    saveView,
    loadView,
    requestDeleteView,
    restoreFilters,
    buildRows,
    updateColumnLayout,
    activeSavedViewId,
  } = useTableView(
    SCHEDULE_JORNADAS_VIEW_PAGE_KEY,
    SCHEDULE_JORNADA_DISPLAY_COLUMNS,
    DATA_COLUMNS,
    tableCtx,
    'date',
  );

  const viewFilterProps = {
    open: modalOpen,
    onOpen: openModal,
    onClose: closeViewModal,
    onApply: applyDraft,
    draftConfig,
    onDraftChange: updateDraft,
    displayColumns: SCHEDULE_JORNADA_DISPLAY_COLUMNS,
    dataColumns: DATA_COLUMNS,
    savedViews,
    onSaveView: saveView,
    onLoadView: loadView,
    onDeleteView: requestDeleteView,
    onRestoreFilters: restoreFilters,
    activeFilterCount,
    hasViewChanges,
    hasDraftChanges,
    showViewIndicator,
    canRestoreView,
    defaultFilterColumnId: 'date' as const,
    activeSavedViewId,
    panelPlacement: 'secondarySidebar' as const,
  };

  useEffect(() => {
    let cancelled = false;
    documentsService
      .getBootstrap()
      .then((data) => {
        if (cancelled) return;
        setClients(data.clients);
        setDocuments(data.documents);
      })
      .catch(() => {
        if (!cancelled) {
          setClients([]);
          setDocuments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedHoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of getScheduleSummaryDays(currentDate)) {
      if (day.inScope === false) continue;
      const signed = listUserSignedHoursOnDate(
        activities,
        events,
        userId,
        day.date,
        boundaries,
      );
      if (signed > 0) map.set(day.date, signed);
    }
    return map;
  }, [activities, events, userId, currentDate, boundaries]);

  const summary = useMemo(() => {
    const periodDays = getScheduleSummaryDays(currentDate);
    return computeSchedulePeriodSummary(periodDays, entriesByDate, {
      hoursCap: SCHEDULE_MONTHLY_HOURS_WARNING,
      signedHoursByDate,
    });
  }, [currentDate, entriesByDate, signedHoursByDate]);

  const jornadaItems = useMemo(
    () =>
      buildScheduleJornadaRows(
        summary.assignedDays,
        activities,
        events,
        documents,
        userId,
        shiftEventTimes,
        boundaries,
      ),
    [
      summary.assignedDays,
      activities,
      events,
      documents,
      userId,
      shiftEventTimes,
      boundaries,
    ],
  );

  const tableRows = useMemo(
    () => buildRows(jornadaItems),
    [buildRows, jornadaItems],
  );

  const title = formatScheduleJornadasLabel(userName);
  const dayCount = summary.assignedDays.length;

  const handleOpenActivity = useCallback(
    (row: (typeof jornadaItems)[number]) => {
      if (!row.activity) return;
      openEditByActivity(row.activity, events);
    },
    [openEditByActivity, events],
  );

  const handleOpenClient = useCallback(
    (clientId: string) => {
      navigate(`/clients/${clientId}`);
    },
    [navigate],
  );

  const handleOpenDocument = useCallback(
    (documentId: string) => {
      navigate(`/docs/${documentId}`);
    },
    [navigate],
  );

  return (
    <section className={cx(styles.wrap, className)} aria-label={title}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        <div className={styles.headerActions}>
          <span className={styles.meta}>
            {dayCount === 0 ? (
              'Ningún día con turno este mes'
            ) : (
              <>
                {summary.coverageLabel}
                {maxVacationDays > 0 && summary.vacationDaysInScope > 0 && (
                  <>
                    {' · '}
                    {summary.vacationDaysInScope} vacaciones en el mes
                  </>
                )}
                {' · '}
                <strong>{summary.workingHours} h</strong> firmadas
              </>
            )}
          </span>
          {dayCount > 0 && <ViewFilterModal {...viewFilterProps} part="trigger" embedded />}
        </div>
      </div>

      {dayCount > 0 ? (
        <div className={styles.tableScroll}>
          <ConfigurableTable
            displayColumns={SCHEDULE_JORNADA_DISPLAY_COLUMNS}
            config={viewConfig}
            onConfigChange={updateColumnLayout}
          >
            {(visibleColumns) =>
              tableRows.length > 0 ? (
                <>
                  {tableRows.map((row) => {
                    if (row.kind === 'group') {
                      return (
                        <tr key={`group-${row.key}`} className={ui.tableGroupRow}>
                          <TableGroupRow
                            label={row.label}
                            count={row.count}
                            dotColor={row.dotColor}
                            itemIds={row.itemIds}
                            colSpan={visibleColumns.length}
                          />
                        </tr>
                      );
                    }

                    const item = row.item;
                    return (
                      <tr key={item.id} className={ui.tableRow}>
                        {visibleColumns.map((column, columnIndex) => (
                          <td
                            key={column.id}
                            className={resolveTableDataCellClassName(
                              column,
                              columnIndex,
                              visibleColumns,
                              config,
                            )}
                            style={resolveTableDataCellStyle(column, visibleColumns, config)}
                          >
                            {renderScheduleJornadaCell({
                              columnId: column.id,
                              row: item,
                              ctx: tableCtx,
                              onOpenActivity: handleOpenActivity,
                              onOpenClient: handleOpenClient,
                              onOpenDocument: handleOpenDocument,
                            })}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  <tr className={styles.totalRow}>
                    {(() => {
                      const hoursVisible = visibleColumns.some((column) => column.id === 'hours');
                      const labelColSpan = hoursVisible
                        ? Math.max(visibleColumns.length - 1, 1)
                        : visibleColumns.length;
                      return (
                        <>
                          <td colSpan={labelColSpan}>
                            Total ({dayCount} {dayCount === 1 ? 'día' : 'días'})
                          </td>
                          {hoursVisible && (
                            <td className={styles.hoursCell}>{summary.workingHours} h</td>
                          )}
                        </>
                      );
                    })()}
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length} className={ui.emptyCell}>
                    Ningún día coincide con los filtros actuales.
                  </td>
                </tr>
              )
            }
          </ConfigurableTable>
        </div>
      ) : (
        <p className={styles.empty}>
          Solo aparecen los días con turno planificado. Las horas corresponden a actividades asignadas ese día.
        </p>
      )}

      {summary.isOverload && (
        <p className={cx(styles.alert, styles.alertWarn)}>
          Muchas horas de trabajo este mes ({summary.workingHours} h). Revisa la planificación.
        </p>
      )}
    </section>
  );
}
