import { useMemo, useState, type ReactNode } from 'react';
import { Pin } from 'lucide-react';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import type { DisplayColumnDef, TableViewConfig } from '@/lib/viewConfig';
import { getOrderedVisibleColumns, MAX_PINNED_COLUMNS, pinLockedColumns } from '@/lib/viewConfig';
import {
  getPinnedColumnIndexClass,
  getPinnedColumnStickyStyle,
  isLastPinnedColumn,
  isPinnedColumn,
} from '@/lib/tableColumnLayout';
import styles from './ConfigurableTable.module.css';

type ConfigurableTableProps = {
  displayColumns: DisplayColumnDef[];
  config: TableViewConfig;
  onConfigChange: (patch: Partial<TableViewConfig>) => void;
  headerRenderers?: Record<string, ReactNode>;
  afterHeader?: ReactNode;
  children: (visibleColumns: DisplayColumnDef[]) => ReactNode;
};

export default function ConfigurableTable({
  displayColumns,
  config,
  onConfigChange,
  headerRenderers,
  afterHeader,
  children,
}: ConfigurableTableProps) {
  const visibleColumns = useMemo(
    () => getOrderedVisibleColumns(displayColumns, config),
    [displayColumns, config],
  );

  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const reorderColumns = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    const sourceColumn = displayColumns.find((entry) => entry.id === sourceId);
    const targetColumn = displayColumns.find((entry) => entry.id === targetId);
    if (!sourceColumn || !targetColumn || sourceColumn.locked || targetColumn.locked) return;

    const order = pinLockedColumns(displayColumns, config.columnOrder, config.pinnedColumnIds);
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    order.splice(sourceIndex, 1);
    order.splice(targetIndex, 0, sourceId);
    onConfigChange({
      columnOrder: pinLockedColumns(displayColumns, order, config.pinnedColumnIds),
    });
  };

  const togglePinColumn = (columnId: string) => {
    const current = config.pinnedColumnIds;
    let next: string[];

    if (current.includes(columnId)) {
      next = current.filter((id) => id !== columnId);
    } else if (current.length >= MAX_PINNED_COLUMNS) {
      return;
    } else {
      next = [...current, columnId];
    }

    onConfigChange({
      pinnedColumnIds: next,
      columnOrder: pinLockedColumns(displayColumns, config.columnOrder, next),
    });
  };

  const resizeColumn = (columnId: string, nextWidth: number) => {
    const column = displayColumns.find((entry) => entry.id === columnId);
    if (!column || column.locked) return;
    onConfigChange({
      columnWidths: {
        ...config.columnWidths,
        [columnId]: Math.max(column.minWidth, nextWidth),
      },
    });
  };

  const lastExpandableColumnId = useMemo(() => {
    const expandable = visibleColumns.filter(
      (column) => !column.locked && column.id !== 'select',
    );
    return expandable[expandable.length - 1]?.id ?? null;
  }, [visibleColumns]);

  return (
    <table className={cx(ui.table, styles.table)}>
      <thead className={styles.tableHead}>
        <tr>
          {visibleColumns.map((column, columnIndex) => {
            const width = column.locked
              ? column.defaultWidth
              : (config.columnWidths[column.id] ?? column.defaultWidth);
            const isSelectColumn = column.id === 'select';
            const isLastExpandable = column.id === lastExpandableColumnId;
            const isPinned = isPinnedColumn(column.id, config);
            const isPinnedEdge = isLastPinnedColumn(column.id, config);
            const canDrag = !column.locked && !isPinned;
            const canResize = !column.locked;
            const canPin = !column.locked && !isSelectColumn;
            const pinAtMax = !isPinned && config.pinnedColumnIds.length >= MAX_PINNED_COLUMNS;
            const customHeader = headerRenderers?.[column.id];
            const isFirstDataColumn =
              columnIndex > 0 && visibleColumns[columnIndex - 1]?.id === 'select';
            const pinnedStickyStyle = getPinnedColumnStickyStyle(
              column.id,
              visibleColumns,
              config,
            );
            const pinnedIndexClass = getPinnedColumnIndexClass(column.id, config, 'head');
            const isStickyColumn = isSelectColumn || isPinned;

            return (
              <th
                key={column.id}
                className={cx(
                  !isStickyColumn && styles.th,
                  isFirstDataColumn && styles.thAfterSelect,
                  canDrag && styles.thDraggable,
                  !isStickyColumn && column.align === 'right' && styles.thRight,
                  isSelectColumn && styles.selectTh,
                  isPinned && styles.pinnedTh,
                  pinnedIndexClass,
                  isPinnedEdge && styles.pinnedThEdge,
                  dragColumnId === column.id && styles.thDragging,
                  dragOverColumnId === column.id && styles.thDragOver,
                )}
                style={
                  isSelectColumn
                    ? undefined
                    : {
                        ...(isLastExpandable ? { minWidth: width } : { width }),
                        ...pinnedStickyStyle,
                      }
                }
                onDragOver={(event) => {
                  if (!canDrag || !dragColumnId) return;
                  event.preventDefault();
                  setDragOverColumnId(column.id);
                }}
                onDrop={() => {
                  if (dragColumnId && canDrag) reorderColumns(dragColumnId, column.id);
                  setDragColumnId(null);
                  setDragOverColumnId(null);
                }}
                onDragLeave={() => {
                  if (dragOverColumnId === column.id) setDragOverColumnId(null);
                }}
                aria-label={column.label}
              >
                {customHeader ?? (
                  <>
                    <div
                      className={cx(
                        styles.headerContent,
                        column.headerStretch && styles.headerContentStretch,
                      )}
                    >
                      {canDrag && (
                        <span
                          className={styles.dragHandle}
                          draggable
                          aria-hidden
                          onDragStart={(event) => {
                            setDragColumnId(column.id);
                            event.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDragColumnId(null);
                            setDragOverColumnId(null);
                          }}
                        >
                          <span className={styles.dragGrip} aria-hidden />
                        </span>
                      )}
                      {config.showHeaderEmojis && column.emoji && (
                        <span className={styles.headerEmoji} aria-hidden>
                          {column.emoji}
                        </span>
                      )}
                      {column.label}
                      {canPin && (
                        <button
                          type="button"
                          className={cx(styles.pinBtn, isPinned && styles.pinBtnActive)}
                          aria-label={isPinned ? 'Desfijar columna' : 'Fijar columna'}
                          title={
                            isPinned
                              ? 'Desfijar columna'
                              : pinAtMax
                                ? `Máximo ${MAX_PINNED_COLUMNS} columnas fijadas`
                                : 'Fijar columna'
                          }
                          aria-pressed={isPinned}
                          disabled={pinAtMax}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            togglePinColumn(column.id);
                          }}
                        >
                          <Pin size={12} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                    </div>
                    {canResize && (
                      <span
                        className={styles.resizeHandle}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const startX = event.clientX;
                          const startWidth = width;
                          const onMove = (moveEvent: MouseEvent) => {
                            resizeColumn(column.id, startWidth + moveEvent.clientX - startX);
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                      />
                    )}
                  </>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {afterHeader && (
          <tr className={styles.afterHeaderRow}>
            <td colSpan={visibleColumns.length} className={styles.afterHeaderCell}>
              {afterHeader}
            </td>
          </tr>
        )}
        {children(visibleColumns)}
      </tbody>
    </table>
  );
}
