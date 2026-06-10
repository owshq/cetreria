import type { ReactNode } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { DOCUMENT_TYPE_LABELS, SHIFT_META } from '@shared/types';
import ActivityTypeBadge from '@/components/ActivityTypeBadge';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import { cx } from '@/lib/cx';
import { getShiftPaletteColor } from '@/lib/shiftColorPalette';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import type { ScheduleJornadaRow } from '@/lib/scheduleJornadaRows';
import type { ScheduleJornadaTableContext } from '@/lib/scheduleJornadaTableView';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';
import summaryStyles from '@/components/UserScheduleSummary.module.css';

function ScheduleJornadaShiftCell({ row }: { row: ScheduleJornadaRow }) {
  const shiftColors = useShiftColorPalette();
  const meta = SHIFT_META[row.shift];
  const hasActivity = row.activity != null;

  if (!hasActivity) {
    return <ShiftStateBadge shift={row.shift} plain title={meta.tooltip} />;
  }

  return (
    <span
      className={summaryStyles.shiftCell}
      style={{ backgroundColor: getShiftPaletteColor(row.shift, shiftColors) }}
      title={meta.tooltip}
    >
      {meta.shortLabel} {meta.label}
    </span>
  );
}

type RenderScheduleJornadaCellArgs = {
  columnId: string;
  row: ScheduleJornadaRow;
  ctx: ScheduleJornadaTableContext;
  onOpenActivity: (row: ScheduleJornadaRow) => void;
  onOpenClient: (clientId: string) => void;
  onOpenDocument: (documentId: string) => void;
};

export function renderScheduleJornadaCell({
  columnId,
  row,
  ctx,
  onOpenActivity,
  onOpenClient,
  onOpenDocument,
}: RenderScheduleJornadaCellArgs): ReactNode {
  const { activity } = row;
  const client = activity ? ctx.clientsMap.get(activity.clientId) : undefined;

  switch (columnId) {
    case 'date': {
      const d = parseISO(row.date);
      return (
        <div className={ui.textSmall}>
          {isValid(d) ? format(d, 'dd/MM/yyyy', { locale: es }) : row.date}
        </div>
      );
    }
    case 'weekday':
      return (
        <div className={ui.textSmall}>
          {format(parseISO(row.date), 'EEE', { locale: es })}
        </div>
      );
    case 'shift':
      return <ScheduleJornadaShiftCell row={row} />;
    case 'hourRange':
      return <div className={ui.textSmall}>{row.hourRange ?? '?'}</div>;
    case 'hours':
      return (
        <div className={summaryStyles.hoursCell}>
          {row.hours > 0 ? `${row.hours} h` : 'Sin actividad'}
        </div>
      );
    case 'activityType':
      if (!activity) return <span className={ui.textMuted}>?</span>;
      return <ActivityTypeBadge typeRef={activity.type} activityTypes={ctx.activityTypes} />;
    case 'activityDescription':
      return (
        <div className={cx(ui.textSmall, summaryStyles.descriptionCell)} title={activity?.description}>
          {activity?.description?.trim() || '?'}
        </div>
      );
    case 'client':
      if (!activity || !client) return <span className={ui.textMuted}>?</span>;
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
    case 'documents':
      if (row.documents.length === 0) return <span className={ui.textMuted}>?</span>;
      return (
        <div className={summaryStyles.linkList}>
          {row.documents.map((doc, index) => (
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
    case 'documentType':
      if (row.documents.length === 0) return <span className={ui.textMuted}>?</span>;
      return (
        <div className={ui.textSmall}>
          {row.documents.map((doc) => DOCUMENT_TYPE_LABELS[doc.type]).join(', ')}
        </div>
      );
    case 'activity':
      if (!activity) return <span className={ui.textMuted}>?</span>;
      return (
        <button
          type="button"
          className={tableStyles.cellLinkBtn}
          onClick={(event) => {
            event.stopPropagation();
            onOpenActivity(row);
          }}
        >
          Ver actividad
        </button>
      );
    default:
      return null;
  }
}
