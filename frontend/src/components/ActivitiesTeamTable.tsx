import { useCallback, useEffect, useMemo, useState, type ReactNode, type Ref } from 'react';
import { useNavigate } from 'react-router';
import {
  CircleMinus,
  ExternalLink,
  Pencil,
  X,
} from 'lucide-react';
import type { Activity, CalendarEvent, Client, UserAssignee } from '@shared/types';
import {
  buildActivityEventTitle,
  findEventForActivity,
  resolveActivityType,
  SHIFT_META,
  workspaceHasWorkReportActivityTypes,
} from '@shared/types';
import { activitiesService, eventsService } from '@/api';
import BoardView from '@/components/BoardView';
import ConfigurableTable from '@/components/ConfigurableTable';
import ConfirmDialog from '@/components/ConfirmDialog';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import EmptyState from '@/components/EmptyState';
import TableGroupRow from '@/components/TableGroupRow';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useTableView } from '@/hooks/useTableView';
import { activityMatchesTeamUser } from '@/lib/activitiesTeamScope';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import {
  ACTIVITIES_TEAM_TABLE_PAGE_KEY,
  ACTIVITY_DISPLAY_COLUMNS,
  buildActivityTableColumns,
  filterActivityDisplayColumns,
  migrateActivityTeamTableConfig,
  type ActivityTableContext,
} from '@/lib/activityTableView';
import { getActivityAssigneeShifts } from '@/lib/activityTableFields';
import { renderActivityBoardCard, renderActivityCell } from '@/lib/activityViewCells';
import { getCalendarViewDateRange, type CalendarViewMode } from '@/lib/calendarViewMode';
import {
  resolveTableDataCellClassName,
  resolveTableDataCellStyle,
} from '@/lib/tableColumnLayout';
import { matchesTableSearch } from '@/lib/tableViews';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';
import styles from './ActivitiesTeamTable.module.css';

export function useActivitiesTeamTableView(
  assignees: UserAssignee[],
  activityTypes: ReturnType<typeof useActivityTypes>['activityTypes'],
  clients: Client[],
  tableCtx: ActivityTableContext,
) {
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const hasWorkReportActivityTypes = useMemo(
    () => workspaceHasWorkReportActivityTypes(activityTypes),
    [activityTypes],
  );
  const featureOptions = useMemo(
    () => ({ workerSignaturesEnabled, shiftSchedulingEnabled, hasWorkReportActivityTypes }),
    [workerSignaturesEnabled, shiftSchedulingEnabled, hasWorkReportActivityTypes],
  );
  const displayColumns = useMemo(
    () => filterActivityDisplayColumns(ACTIVITY_DISPLAY_COLUMNS, featureOptions),
    [featureOptions],
  );
  const dataColumns = useMemo(
    () => buildActivityTableColumns(assignees, activityTypes, clients, featureOptions),
    [assignees, activityTypes, clients, featureOptions],
  );

  return useTableView(
    ACTIVITIES_TEAM_TABLE_PAGE_KEY,
    displayColumns,
    dataColumns,
    tableCtx,
    'type',
    migrateActivityTeamTableConfig,
  );
}

export function useActivitiesTeamTableController(
  assignees: UserAssignee[],
  activityTypes: ReturnType<typeof useActivityTypes>['activityTypes'],
  clients: Client[],
  tableCtx: ActivityTableContext,
) {
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const hasWorkReportActivityTypes = useMemo(
    () => workspaceHasWorkReportActivityTypes(activityTypes),
    [activityTypes],
  );
  const featureOptions = useMemo(
    () => ({ workerSignaturesEnabled, shiftSchedulingEnabled, hasWorkReportActivityTypes }),
    [workerSignaturesEnabled, shiftSchedulingEnabled, hasWorkReportActivityTypes],
  );
  const displayColumns = useMemo(
    () => filterActivityDisplayColumns(ACTIVITY_DISPLAY_COLUMNS, featureOptions),
    [featureOptions],
  );
  const dataColumns = useMemo(
    () => buildActivityTableColumns(assignees, activityTypes, clients, featureOptions),
    [assignees, activityTypes, clients, featureOptions],
  );

  const tableView = useActivitiesTeamTableView(assignees, activityTypes, clients, tableCtx);

  const viewFilterProps = {
    open: tableView.modalOpen,
    onOpen: tableView.openModal,
    onClose: tableView.closeModal,
    onApply: tableView.applyDraft,
    draftConfig: tableView.draftConfig,
    onDraftChange: tableView.updateDraft,
    displayColumns,
    dataColumns,
    savedViews: tableView.savedViews,
    onSaveView: tableView.saveView,
    onLoadView: tableView.loadView,
    onDeleteView: tableView.requestDeleteView,
    onRestoreFilters: tableView.restoreFilters,
    activeFilterCount: tableView.activeFilterCount,
    hasViewChanges: tableView.hasViewChanges,
    hasDraftChanges: tableView.hasDraftChanges,
    showViewIndicator: tableView.showViewIndicator,
    canRestoreView: tableView.canRestoreView,
    defaultFilterColumnId: 'type' as const,
    activeSavedViewId: tableView.activeSavedViewId,
    panelPlacement: 'secondarySidebar' as const,
  };

  return { ...tableView, dataColumns, viewFilterProps };
}

export type ActivitiesTeamTableController = ReturnType<
  typeof useActivitiesTeamTableController
>;

type ActivitiesTeamTableProps = {
  currentDate: Date;
  viewMode: CalendarViewMode;
  teamUserId: string;
  activities: Activity[];
  events: CalendarEvent[];
  assignees: UserAssignee[];
  searchTerm: string;
  isAdmin: boolean;
  tableCtx: ActivityTableContext;
  tableController: ActivitiesTeamTableController;
  onDataChanged?: () => void | Promise<void>;
  scrollBodyRef?: Ref<HTMLDivElement>;
  scrollBodyClassName?: string;
};

export default function ActivitiesTeamTable({
  currentDate,
  viewMode,
  teamUserId,
  activities,
  events,
  assignees,
  searchTerm,
  isAdmin,
  tableCtx,
  tableController,
  onDataChanged,
  scrollBodyRef,
  scrollBodyClassName,
}: ActivitiesTeamTableProps) {
  const navigate = useNavigate();
  const { shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const { openEditByActivity } = useActivityModal();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionMenu, setActionMenu] = useState<{
    x: number;
    y: number;
    activity: Activity;
  } | null>(null);
  const [shiftMenu, setShiftMenu] = useState<{
    x: number;
    y: number;
    activity: Activity;
  } | null>(null);
  const [typeMenu, setTypeMenu] = useState<{
    x: number;
    y: number;
    activity: Activity;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { from, to } = useMemo(
    () => getCalendarViewDateRange(currentDate, viewMode),
    [currentDate, viewMode],
  );
  const teamAssigneeIds = useMemo(() => new Set(assignees.map((user) => user.id)), [assignees]);

  const { config, viewConfig, buildRows, buildBoard, updateColumnLayout, dataColumns } =
    tableController;

  const periodActivities = useMemo(() => {
    return activities.filter((activity) => {
      if (activity.date < from || activity.date > to) return false;
      return activityMatchesTeamUser(activity, events, teamUserId, teamAssigneeIds);
    });
  }, [activities, events, from, to, teamUserId, teamAssigneeIds]);

  const searchedActivities = useMemo(
    () =>
      periodActivities.filter((activity) =>
        matchesTableSearch(activity, searchTerm, dataColumns, tableCtx),
      ),
    [periodActivities, searchTerm, dataColumns, tableCtx],
  );

  const tableRows = useMemo(
    () => (viewConfig.layout === 'table' ? buildRows(searchedActivities) : []),
    [buildRows, searchedActivities, viewConfig.layout],
  );

  const boardGroups = useMemo(
    () => (viewConfig.layout === 'board' ? buildBoard(searchedActivities) : []),
    [buildBoard, searchedActivities, viewConfig.layout],
  );

  const visibleIds = useMemo(
    () =>
      tableRows
        .filter((row): row is { kind: 'item'; item: Activity } => row.kind === 'item')
        .map((row) => row.item.id),
    [tableRows],
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }, []);

  const toggleSelectVisible = useCallback(() => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }, [allVisibleSelected, visibleIds]);

  const toggleSelectGroup = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const allSelected = ids.every((id) => selectedIds.includes(id));
      if (allSelected) {
        setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
        return;
      }
      setSelectedIds((current) => [...new Set([...current, ...ids])]);
    },
    [selectedIds],
  );

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const selectedActivities = useMemo(
    () => periodActivities.filter((activity) => selectedIds.includes(activity.id)),
    [periodActivities, selectedIds],
  );

  useEffect(() => {
    const validIds = new Set(periodActivities.map((activity) => activity.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [periodActivities]);

  const emptyDescription = useMemo(() => {
    if (periodActivities.length === 0) {
      return 'No hay actividades en este periodo.';
    }
    if (searchedActivities.length === 0) {
      return 'No hay actividades que coincidan con la búsqueda.';
    }
    return 'No hay actividades que coincidan con los filtros activos.';
  }, [periodActivities.length, searchedActivities.length]);

  const handleOpenActivity = useCallback(
    (activity: Activity) => {
      openEditByActivity(activity, events);
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

  const handleTypeChange = useCallback(
    async (activity: Activity, typeId: string) => {
      const currentTypeId = resolveActivityType(activity.type, tableCtx.activityTypes)?.id;
      if (!typeId || currentTypeId === typeId) return;

      try {
        const saved = await activitiesService.update(activity.id, { type: typeId });
        const event = findEventForActivity(saved, events);
        if (event) {
          const clientName = tableCtx.clientsMap.get(saved.clientId)?.name;
          const title = buildActivityEventTitle(typeId, tableCtx.activityTypes, clientName);
          await eventsService.update(event.id, {
            title,
            activityId: saved.id,
          });
        }
        setTypeMenu(null);
        await onDataChanged?.();
      } catch (error) {
        console.error('Error al cambiar tipo de actividad:', error);
        alert('No se pudo guardar el tipo de la actividad.');
      }
    },
    [events, onDataChanged, tableCtx.activityTypes, tableCtx.clientsMap],
  );

  const deleteActivities = useCallback(
    async (activityIds: string[]) => {
      await Promise.all(
        activityIds.map(async (activityId) => {
          const activity = periodActivities.find((item) => item.id === activityId);
          if (!activity) return;
          const event = findEventForActivity(activity, events);
          if (event) {
            await eventsService.delete(event.id);
            return;
          }
          await activitiesService.delete(activityId);
        }),
      );
    },
    [periodActivities, events],
  );

  const handleBulkEdit = useCallback(() => {
    if (selectedActivities.length !== 1) return;
    handleOpenActivity(selectedActivities[0]);
  }, [selectedActivities, handleOpenActivity]);

  const handleBulkOpenClient = useCallback(() => {
    if (selectedActivities.length !== 1) return;
    const clientId = selectedActivities[0].clientId;
    if (clientId) handleOpenClient(clientId);
  }, [selectedActivities, handleOpenClient]);

  const handleBulkDelete = useCallback(() => {
    if (!isAdmin || selectedActivities.length === 0) return;
    setDeleteConfirm(selectedActivities.map((activity) => activity.id));
  }, [isAdmin, selectedActivities]);

  const handleDelete = useCallback(
    (activityId: string) => {
      if (!isAdmin) return;
      setDeleteConfirm([activityId]);
    },
    [isAdmin],
  );

  const executeDelete = useCallback(async () => {
    if (!deleteConfirm || deleting || !isAdmin) return;
    setDeleting(true);
    try {
      await deleteActivities(deleteConfirm);
      setSelectedIds((current) => current.filter((id) => !deleteConfirm.includes(id)));
      setDeleteConfirm(null);
      await onDataChanged?.();
    } catch {
      alert('No se pudieron eliminar las actividades.');
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, deleting, isAdmin, deleteActivities, onDataChanged]);

  const deleteConfirmMessage = useMemo(() => {
    if (!deleteConfirm) return '';
    const count = deleteConfirm.length;
    if (count === 1) {
      const activity = periodActivities.find((item) => item.id === deleteConfirm[0]);
      const description = activity?.description?.trim();
      if (description) {
        return `¿Eliminar la actividad «${description}»? Esta acción no se puede deshacer.`;
      }
      return '¿Eliminar esta actividad? Esta acción no se puede deshacer.';
    }
    return `¿Eliminar ${count} actividades? Esta acción no se puede deshacer.`;
  }, [deleteConfirm, periodActivities]);

  const deleteConfirmTitle =
    deleteConfirm && deleteConfirm.length > 1 ? 'Eliminar actividades' : 'Eliminar actividad';

  const bulkActionCountLabel = `${selectedIds.length} seleccionado${selectedIds.length === 1 ? '' : 's'}`;

  const bulkActionToolbar =
    selectedIds.length > 0 ? (
      <div className={styles.bulkActionBar} role="toolbar" aria-label="Acciones masivas">
        <span className={styles.bulkActionCount}>{bulkActionCountLabel}</span>
        <div className={styles.bulkActionButtons}>
          {selectedIds.length === 1 && (
            <>
              <button
                type="button"
                onClick={handleBulkEdit}
                className={ui.btnIcon}
                title="Editar actividad"
                aria-label="Editar actividad"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={handleBulkOpenClient}
                className={ui.btnIcon}
                title="Ver contacto"
                aria-label="Ver contacto"
              >
                <ExternalLink size={16} />
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className={ui.btnIconDanger}
              title="Eliminar"
              aria-label="Eliminar"
            >
              <CircleMinus size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className={styles.bulkActionClear}
            title="Quitar selección"
            aria-label="Quitar selección"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    ) : null;

  const actionMenuItems: ContextMenuItem[] = actionMenu
    ? [
        {
          id: 'edit',
          label: 'Editar actividad',
          icon: <Pencil size={16} />,
          onSelect: () => handleOpenActivity(actionMenu.activity),
        },
      ]
    : [];

  const shiftMenuItems: ContextMenuItem[] = shiftMenu
    ? getActivityAssigneeShifts(shiftMenu.activity, tableCtx).map((shift) => {
        const meta = SHIFT_META[shift];
        return {
          id: shift,
          label: `${meta.shortLabel} — ${meta.label}`,
          dotColor: meta.color,
          onSelect: () => setShiftMenu(null),
        };
      })
    : [];

  const typeMenuCurrentId = typeMenu
    ? resolveActivityType(typeMenu.activity.type, tableCtx.activityTypes)?.id
    : undefined;

  const typeMenuItems: ContextMenuItem[] = typeMenu
    ? tableCtx.activityTypes.map((activityType) => ({
        id: activityType.id,
        label: activityType.name,
        dotColor: activityType.color,
        selected: typeMenuCurrentId === activityType.id,
        disabled: typeMenuCurrentId === activityType.id,
        onSelect: () => void handleTypeChange(typeMenu.activity, activityType.id),
      }))
    : [];

  const tableOverlays = (
    <>
      {actionMenu && (
        <ContextMenu
          x={actionMenu.x}
          y={actionMenu.y}
          ariaLabel="Acciones de actividad"
          onClose={() => setActionMenu(null)}
          items={actionMenuItems}
        />
      )}

      {shiftSchedulingEnabled && shiftMenu && shiftMenuItems.length > 0 && (
        <ContextMenu
          x={shiftMenu.x}
          y={shiftMenu.y}
          anchorX="center"
          ariaLabel="Turnos de la actividad"
          onClose={() => setShiftMenu(null)}
          items={shiftMenuItems}
        />
      )}

      {typeMenu && typeMenuItems.length > 0 && (
        <ContextMenu
          x={typeMenu.x}
          y={typeMenu.y}
          anchorX="center"
          ariaLabel="Cambiar tipo de actividad"
          onClose={() => setTypeMenu(null)}
          items={typeMenuItems}
        />
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirmTitle}
        message={deleteConfirmMessage}
        loading={deleting}
        onConfirm={() => void executeDelete()}
        onCancel={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
      />
    </>
  );

  const wrapScrollBody = (content: ReactNode) => {
    const body = scrollBodyClassName ? (
      <div ref={scrollBodyRef} className={scrollBodyClassName}>
        {content}
      </div>
    ) : (
      content
    );

    return (
      <>
        {bulkActionToolbar}
        {body}
        {tableOverlays}
      </>
    );
  };

  if (viewConfig.layout === 'board') {
    return wrapScrollBody(
      <div className={styles.boardWrap}>
        <BoardView
          groups={boardGroups}
          getItemKey={(activity) => activity.id}
          renderCard={(activity) => renderActivityBoardCard(activity, tableCtx)}
          onCardClick={handleOpenActivity}
          emptyDescription={emptyDescription}
        />
      </div>,
    );
  }

  return wrapScrollBody(
    <div className={styles.tableShell}>
        <div className={styles.tableScroll}>
          <div className={styles.activitiesTablePanel}>
            <ConfigurableTable
              displayColumns={ACTIVITY_DISPLAY_COLUMNS}
              config={viewConfig}
              onConfigChange={updateColumnLayout}
              headerRenderers={{
                select: (
                  <div className={tableStyles.selectCellInner}>
                    <div className={tableStyles.selectCheckboxSlot}>
                      <input
                        type="checkbox"
                        className={tableStyles.rowCheckbox}
                        checked={allVisibleSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={toggleSelectVisible}
                        aria-label="Seleccionar visibles"
                      />
                    </div>
                    <span className={tableStyles.selectActionsSlot} aria-hidden />
                  </div>
                ),
              }}
            >
              {(visibleColumns) =>
                tableRows.length > 0 ? (
                  tableRows.map((row) => {
                    if (row.kind === 'group') {
                      return (
                        <tr key={`group-${row.key}`} className={ui.tableGroupRow}>
                          <TableGroupRow
                            label={row.label}
                            count={row.count}
                            dotColor={row.dotColor}
                            badgeClassName={row.badgeClassName}
                            itemIds={row.itemIds}
                            colSpan={visibleColumns.length}
                            selectedIds={selectedIds}
                            onToggleSelect={() => toggleSelectGroup(row.itemIds)}
                          />
                        </tr>
                      );
                    }

                    const activity = row.item;
                    const openActivity = (
                      event:
                        | React.MouseEvent<HTMLTableRowElement>
                        | React.KeyboardEvent<HTMLTableRowElement>,
                    ) => {
                      if (
                        event.target instanceof Element &&
                        event.target.closest('a, button, input, label, textarea, select')
                      ) {
                        return;
                      }
                      handleOpenActivity(activity);
                    };

                    return (
                      <tr
                        key={activity.id}
                        className={cx(ui.tableRow, styles.activityRow)}
                        onClick={openActivity}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openActivity(event);
                          }
                        }}
                        title="Abrir actividad"
                        aria-selected={selectedIds.includes(activity.id)}
                      >
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
                            onClick={
                              column.id === 'select' ||
                              column.id === 'client' ||
                              column.id === 'documents' ||
                              column.id === 'shifts' ||
                              column.id === 'type'
                                ? (event) => event.stopPropagation()
                                : undefined
                            }
                          >
                            {renderActivityCell({
                              columnId: column.id,
                              activity,
                              ctx: tableCtx,
                              selectedIds,
                              isAdmin,
                              toggleSelect,
                              setActionMenu,
                              setShiftMenu,
                              setTypeMenu,
                              actionMenuActivityId: actionMenu?.activity.id,
                              shiftMenuActivityId: shiftMenu?.activity.id,
                              typeMenuActivityId: typeMenu?.activity.id,
                              onOpenActivity: handleOpenActivity,
                              onOpenClient: handleOpenClient,
                              onOpenDocument: handleOpenDocument,
                            })}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={visibleColumns.length} className={ui.emptyCell}>
                      <EmptyState emoji={'\uD83D\uDCC5'} description={emptyDescription} compact />
                    </td>
                  </tr>
                )
              }
            </ConfigurableTable>
          </div>
        </div>
      </div>,
  );
}
