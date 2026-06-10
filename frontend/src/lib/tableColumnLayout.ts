import type { CSSProperties } from 'react';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import tableStyles from '@/components/ConfigurableTable.module.css';
import type { DisplayColumnDef, TableViewConfig } from '@/lib/viewConfig';
import { getColumnWidth } from '@/lib/viewConfig';

const SELECT_COL_WIDTH_PX = 64;

const PINNED_HEAD_INDEX_CLASS = [
  tableStyles.pinnedThIndex0,
  tableStyles.pinnedThIndex1,
  tableStyles.pinnedThIndex2,
] as const;

const PINNED_BODY_INDEX_CLASS = [
  tableStyles.pinnedTdIndex0,
  tableStyles.pinnedTdIndex1,
  tableStyles.pinnedTdIndex2,
] as const;

function getPinnedIndex(columnId: string, config: TableViewConfig): number {
  return config.pinnedColumnIds.indexOf(columnId);
}

export function isPinnedColumn(columnId: string, config: TableViewConfig): boolean {
  return getPinnedIndex(columnId, config) >= 0;
}

export function isLastPinnedColumn(columnId: string, config: TableViewConfig): boolean {
  const ids = config.pinnedColumnIds;
  return ids.length > 0 && ids[ids.length - 1] === columnId;
}

export function getPinnedColumnIndexClass(
  columnId: string,
  config: TableViewConfig,
  kind: 'head' | 'body',
): string | undefined {
  const pinIndex = getPinnedIndex(columnId, config);
  if (pinIndex < 0) return undefined;
  const classes = kind === 'head' ? PINNED_HEAD_INDEX_CLASS : PINNED_BODY_INDEX_CLASS;
  return classes[pinIndex];
}

export function getPinnedColumnStickyLeft(
  columnId: string,
  visibleColumns: DisplayColumnDef[],
  config: TableViewConfig,
): number | undefined {
  const pinIndex = getPinnedIndex(columnId, config);
  if (pinIndex < 0) return undefined;

  let left = SELECT_COL_WIDTH_PX;
  for (let index = 0; index < pinIndex; index += 1) {
    const pinnedId = config.pinnedColumnIds[index];
    const column = visibleColumns.find((entry) => entry.id === pinnedId);
    if (column) {
      left += getColumnWidth(config, column);
    }
  }

  return left;
}

export function getPinnedColumnStickyStyle(
  columnId: string,
  visibleColumns: DisplayColumnDef[],
  config: TableViewConfig,
): CSSProperties | undefined {
  const left = getPinnedColumnStickyLeft(columnId, visibleColumns, config);
  if (left === undefined) return undefined;
  return { left: `${left}px` };
}

export function resolveTableDataCellClassName(
  column: DisplayColumnDef,
  columnIndex: number,
  visibleColumns: DisplayColumnDef[],
  config: TableViewConfig,
): string {
  if (column.id === 'select') {
    return tableStyles.selectTd;
  }

  if (isPinnedColumn(column.id, config)) {
    return cx(
      ui.td,
      tableStyles.pinnedTd,
      getPinnedColumnIndexClass(column.id, config, 'body'),
      isLastPinnedColumn(column.id, config) && tableStyles.pinnedTdEdge,
      ui.pinnedColumnCell,
      columnIndex > 0 &&
        visibleColumns[columnIndex - 1]?.id === 'select' &&
        tableStyles.dataTdAfterSelect,
    );
  }

  if (columnIndex > 0 && visibleColumns[columnIndex - 1]?.id === 'select') {
    return tableStyles.dataTdAfterSelect;
  }

  return ui.td;
}

export function resolveTableDataCellStyle(
  column: DisplayColumnDef,
  visibleColumns: DisplayColumnDef[],
  config: TableViewConfig,
): CSSProperties | undefined {
  return getPinnedColumnStickyStyle(column.id, visibleColumns, config);
}
