import type { MouseEvent, ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreVertical } from 'lucide-react';
import type { Activity, UserAssignee } from '@shared/types';
import { activityUsesWorkReport, getActivityTypeLabel, SHIFT_META } from '@shared/types';
import {
  findEventForActivity,
  formatHoursMinutes,
  getActivityAssigneeIds,
  getWorkerHoursStatus,
  isActivitySigned,
  getActivityWorkReportSurfaceStatus,
  normalizeActivityAssigneeSlots,
} from '@shared/types';
import ActivityAssigneeAvatars from '@/components/ActivityAssigneeAvatars';
import ActivityTypeBadge from '@/components/ActivityTypeBadge';
import DocumentStatusBadge from '@/components/DocumentStatusBadge';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import {
  formatActivityDocumentConcepts,
  formatActivityDocumentStatuses,
  formatActivityDocumentTotals,
  getActivityAssigneeShifts,
  getActivityDocumentStatuses,
  getActivityDocuments,
  getActivityHoursTotals,
  getActivityReportedHoursForTable,
  getActivityWorkReportStatusLabel,
} from '@/lib/activityTableFields';
import { cx } from '@/lib/cx';
import type { ActivityTableContext } from '@/lib/activityTableView';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';
import cellStyles from './activityViewCells.module.css';

type RenderActivityCellArgs = {
  columnId: string;
  activity: Activity;
  ctx: ActivityTableContext;
  selectedIds: string[];
  isAdmin: boolean;
  toggleSelect: (id: string) => void;
  setActionMenu: (value: { x: number; y: number; activity: Activity }) => void;
  setShiftMenu: (value: { x: number; y: number; activity: Activity }) => void;
  setTypeMenu?: (value: { x: number; y: number; activity: Activity }) => void;
  actionMenuActivityId?: string;
  shiftMenuActivityId?: string;
  typeMenuActivityId?: string;
  onOpenActivity: (activity: Activity) => void;
  onOpenClient: (clientId: string) => void;
  onOpenDocument: (documentId: string) => void;
};

export function renderActivityCell({
  columnId,
  activity,
  ctx,
  selectedIds,
  isAdmin,
  toggleSelect,
  setActionMenu,
  setShiftMenu,
  setTypeMenu,
  actionMenuActivityId,
  shiftMenuActivityId,
  typeMenuActivityId,
  onOpenActivity,
  onOpenClient,
  onOpenDocument,
}: RenderActivityCellArgs): ReactNode {
  const client = ctx.clientsMap.get(activity.clientId);
  const documents = getActivityDocuments(activity, ctx);
  const event = findEventForActivity(activity, ctx.events);
  const assigneeIds = getActivityAssigneeIds(activity, event);

  switch (columnId) {
    case 'select':
      return (
        <div className={tableStyles.selectCellInner}>
          <div className={tableStyles.selectCheckboxSlot}>
            <input
              type="checkbox"
              className={tableStyles.rowCheckbox}
              checked={selectedIds.includes(activity.id)}
              onChange={() => toggleSelect(activity.id)}
              aria-label={`Seleccionar actividad`}
            />
          </div>
          <div className={tableStyles.selectActionsSlot}>
            <div
              className={cx(
                tableStyles.rowActions,
                actionMenuActivityId === activity.id && tableStyles.rowActionsVisible,
              )}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setActionMenu({
                    x: rect.right,
                    y: rect.bottom + 4,
                    activity,
                  });
                }}
                className={tableStyles.rowActionBtn}
                title="Acciones"
                aria-label="Acciones de actividad"
                aria-haspopup="menu"
                aria-expanded={actionMenuActivityId === activity.id}
              >
                <MoreVertical size={14} />
              </button>
            </div>
          </div>
        </div>
      );
    case 'type': {
      const typeLabel = getActivityTypeLabel(activity.type, ctx.activityTypes);
      const openTypeMenu = (event: MouseEvent<HTMLElement>) => {
        if (!setTypeMenu) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setTypeMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4, activity });
      };

      if (setTypeMenu) {
        return (
          <ActivityTypeBadge
            as="button"
            typeRef={activity.type}
            activityTypes={ctx.activityTypes}
            onClick={openTypeMenu}
            title="Cambiar tipo"
            aria-label={`Tipo: ${typeLabel}. Clic para cambiar.`}
            aria-haspopup="menu"
            aria-expanded={typeMenuActivityId === activity.id}
          />
        );
      }

      return (
        <ActivityTypeBadge typeRef={activity.type} activityTypes={ctx.activityTypes} />
      );
    }
    case 'description':
      return (
        <span
          className={cx(ui.textSmall, tableStyles.cellTruncate)}
          title={activity.description?.trim() || undefined}
        >
          {activity.description?.trim() || '\u2014'}
        </span>
      );
    case 'date':
      return (
        <div className={ui.textSmall}>
          {format(parseISO(activity.date), 'dd/MM/yyyy', { locale: es })}
        </div>
      );
    case 'client':
      if (!client) return <span className={ui.textMuted}>{'\u2014'}</span>;
      return (
        <button
          type="button"
          className={tableStyles.cellLinkBtn}
          onClick={(event) => {
            event.stopPropagation();
            onOpenClient(client.id);
          }}
        >
          {client.name}
        </button>
      );
    case 'assignee': {
      const assignedUsers = assigneeIds
        .map((id) => ctx.assigneesMap.get(id))
        .filter((user): user is UserAssignee => user != null);
      if (assignedUsers.length === 0) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const assigneeSlots = normalizeActivityAssigneeSlots(activity, event, ctx.boundaries);
      return (
        <ActivityAssigneeAvatars
          users={assignedUsers}
          assigneeSlots={assigneeSlots}
          variant="table"
        />
      );
    }
    case 'hoursAssigned': {
      const { assignedHours } = getActivityHoursTotals(activity, ctx);
      const label = formatHoursMinutes(assignedHours);
      return <div className={ui.fontMedium}>{label ?? '\u2014'}</div>;
    }
    case 'hoursSigned': {
      if (ctx.workerSignaturesEnabled === false) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const { assignedHours, signedHours } = getActivityHoursTotals(activity, ctx);
      const label = formatHoursMinutes(signedHours);
      const pending = assignedHours > signedHours;
      return (
        <div
          className={cx(ui.fontMedium, pending && assignedHours > 0 && ui.textMuted)}
          title={
            pending && assignedHours > 0
              ? `${formatHoursMinutes(signedHours) ?? '0m'} firmadas de ${formatHoursMinutes(assignedHours) ?? '0m'} asignadas`
              : undefined
          }
        >
          {label ?? '\u2014'}
        </div>
      );
    }
    case 'documents':
      if (documents.length === 0) return <span className={ui.textMuted}>{'\u2014'}</span>;
      return (
        <div className={tableStyles.cellLinkList}>
          {documents.map((doc, index) => (
            <span key={doc.id}>
              {index > 0 && ', '}
              <button
                type="button"
                className={tableStyles.cellLinkBtn}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDocument(doc.id);
                }}
              >
                {doc.number}
              </button>
            </span>
          ))}
        </div>
      );
    case 'signed': {
      if (ctx.workerSignaturesEnabled === false) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const event = findEventForActivity(activity, ctx.events);
      const assigneeIds = getActivityAssigneeIds(activity, event);
      if (assigneeIds.length === 0) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }

      const statuses = assigneeIds.map((userId) =>
        getWorkerHoursStatus(activity, event, userId),
      );
      const signedCount = statuses.filter((status) => status.isSigned).length;
      const assignedTotal = Math.round(
        statuses.reduce((sum, status) => sum + status.assignedHours, 0) * 10,
      ) / 10;
      const signedTotal = Math.round(
        statuses.reduce((sum, status) => sum + status.signedHours, 0) * 10,
      ) / 10;
      const pendingCount = statuses.filter((status) => status.needsSignature).length;
      const allSigned = pendingCount === 0 && signedCount === assigneeIds.length;

      return (
        <span
          className={cx(ui.textSmall, allSigned ? ui.fontMedium : ui.textMuted)}
          title={`${signedTotal}h firmadas de ${assignedTotal}h asignadas · ${signedCount}/${assigneeIds.length} operarios con firma${pendingCount > 0 ? ` · ${pendingCount} pendiente(s)` : ''}`}
        >
          {signedTotal}/{assignedTotal}h
          {pendingCount > 0 ? ` · ${pendingCount} pend.` : ''}
        </span>
      );
    }
    case 'workReportHours': {
      if (!activityUsesWorkReport(activity, ctx.activityTypes)) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const hours = getActivityReportedHoursForTable(activity, ctx);
      const label = formatHoursMinutes(hours);
      return <div className={ui.fontMedium}>{label ?? '\u2014'}</div>;
    }
    case 'workReportStatus': {
      if (!activityUsesWorkReport(activity, ctx.activityTypes)) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const status = getActivityWorkReportSurfaceStatus(activity);
      const label = getActivityWorkReportStatusLabel(status);
      return (
        <span
          className={cx(
            ui.textSmall,
            status === 'submitted' && ui.fontMedium,
            status === 'none' && ui.textMuted,
          )}
        >
          {label}
        </span>
      );
    }
    case 'shifts': {
      if (ctx.shiftSchedulingEnabled === false) {
        return <span className={ui.textMuted}>{'\u2014'}</span>;
      }
      const shifts = getActivityAssigneeShifts(activity, ctx);
      if (shifts.length === 0) return <span className={ui.textMuted}>{'\u2014'}</span>;
      const shiftSummary = shifts
        .map((shift) => SHIFT_META[shift].label)
        .join(', ');
      const openShiftMenu = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        setShiftMenu({
          x: rect.left + rect.width / 2,
          y: rect.bottom + 4,
          activity,
        });
      };

      return (
        <button
          type="button"
          className={cellStyles.shiftCellBtn}
          onClick={openShiftMenu}
          title={shiftSummary}
          aria-label={`Turnos: ${shiftSummary}. Clic para ver detalle.`}
          aria-haspopup="menu"
          aria-expanded={shiftMenuActivityId === activity.id}
        >
          <span className={cellStyles.shiftCellList}>
            {shifts.map((shift) => (
              <ShiftStateBadge key={shift} shift={shift} compact />
            ))}
          </span>
        </button>
      );
    }
    case 'documentTotal': {
      const label = formatActivityDocumentTotals(documents);
      if (!label) return <span className={ui.textMuted}>{'\u2014'}</span>;
      return <div className={ui.fontMedium}>{label}</div>;
    }
    case 'documentStatus': {
      const statuses = getActivityDocumentStatuses(documents);
      if (statuses.length === 0) return <span className={ui.textMuted}>{'\u2014'}</span>;
      const label = formatActivityDocumentStatuses(documents);
      return (
        <div className={cellStyles.documentStatusList} title={label}>
          {statuses.map((status) => (
            <DocumentStatusBadge key={status} status={status} />
          ))}
        </div>
      );
    }
    case 'documentConcepts': {
      const label = formatActivityDocumentConcepts(documents);
      if (!label) return <span className={ui.textMuted}>{'\u2014'}</span>;
      return (
        <span className={cx(ui.textSmall, tableStyles.cellTruncate)} title={label}>
          {label}
        </span>
      );
    }
    default:
      return null;
  }
}

export function renderActivityBoardCard(activity: Activity, ctx: ActivityTableContext) {
  const client = ctx.clientsMap.get(activity.clientId);
  const event = findEventForActivity(activity, ctx.events);
  const assigneeNames = getActivityAssigneeIds(activity, event)
    .map((id) => ctx.assigneesMap.get(id)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <p className={ui.listPanelItemTitle}>
        <ActivityTypeBadge typeRef={activity.type} activityTypes={ctx.activityTypes} />
      </p>
      <p className={ui.listPanelItemMessage}>
        {format(parseISO(activity.date), 'd MMM yyyy', { locale: es })}
        {activity.description?.trim() ? ` \u00b7 ${activity.description.trim()}` : ''}
      </p>
      {client && <p className={ui.listPanelItemMessage}>{client.name}</p>}
      {assigneeNames && <p className={ui.listPanelItemMessage}>{assigneeNames}</p>}
      {(() => {
        const { assignedHours, signedHours } = getActivityHoursTotals(activity, ctx);
        const assigned = formatHoursMinutes(assignedHours);
        const signed = formatHoursMinutes(signedHours);
        if (!assigned && !signed) return null;
        if (ctx.workerSignaturesEnabled === false) {
          if (!assigned) return null;
          return <p className={ui.listPanelItemMessage}>{assigned}</p>;
        }
        return (
          <p className={ui.listPanelItemMessage}>
            {assigned ? `${assigned} asignadas` : ''}
            {assigned && signed ? ' \u00b7 ' : ''}
            {signed ? `${signed} firmadas` : ''}
          </p>
        );
      })()}
    </>
  );
}
