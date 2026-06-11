import {
  compareDateGroupKeys,
  getDateGroupKey,
  getDateGroupLabel,
  type DateGroupGranularity,
} from '@/lib/dateGroupGranularity';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';

export type LogicOperator = 'and' | 'or' | 'nor' | 'nand';

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'empty'
  | 'not_empty';

export type ColumnValueType = 'text' | 'enum' | 'number' | 'date';

export type FilterCondition = {
  id: string;
  kind: 'condition';
  columnId: string;
  operator: FilterOperator;
  value: string;
};

export type FilterGroup = {
  id: string;
  kind: 'group';
  logic: LogicOperator;
  children: FilterNode[];
};

export type FilterNode = FilterCondition | FilterGroup;

export type SavedTableView = {
  id: string;
  name: string;
  groupBy: string | null;
  filterRoot: FilterGroup;
};

export type TableViewColumnDef<T, Ctx = undefined> = {
  id: string;
  label: string;
  emoji: string;
  valueType: ColumnValueType;
  groupable: boolean;
  filterable: boolean;
  boardable?: boolean;
  sortable?: boolean;
  /** Incluye la columna en el buscador rápido de la tabla (toolbar). */
  searchable?: boolean;
  getGroupKey: (item: T, ctx: Ctx) => string;
  getGroupLabel: (key: string, ctx: Ctx) => string;
  getFilterValue: (item: T, ctx: Ctx) => string;
  /** Evaluacion custom de filtros (p. ej. varios operarios por contacto). */
  matchesFilter?: (
    item: T,
    operator: FilterOperator,
    value: string,
    ctx: Ctx,
  ) => boolean;
  filterOptions?: {
    value: string;
    label: string;
    dotColor?: string;
    badgeClassName?: string;
    emoji?: string;
  }[];
};

export type TableViewGroup<T> = {
  key: string;
  label: string;
  items: T[];
  dotColor?: string;
  badgeClassName?: string;
};

export type TableViewRow<T> =
  | {
      kind: 'group';
      key: string;
      label: string;
      count: number;
      itemIds: string[];
      dotColor?: string;
      badgeClassName?: string;
    }
  | { kind: 'item'; item: T };

export const LOGIC_OPERATOR_LABELS: Record<LogicOperator, string> = {
  and: 'AND',
  or: 'OR',
  nor: 'NOR',
  nand: 'NAND',
};

export const LOGIC_OPERATOR_DESCRIPTIONS: Record<LogicOperator, string> = {
  and: 'Todas las condiciones deben cumplirse',
  or: 'Al menos una condición debe cumplirse',
  nor: 'Ninguna condición debe cumplirse',
  nand: 'No pueden cumplirse todas a la vez',
};

export const FILTER_OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'es',
  neq: 'no es',
  contains: 'contiene',
  not_contains: 'no contiene',
  starts_with: 'empieza por',
  ends_with: 'termina en',
  gt: 'mayor que',
  gte: 'mayor o igual',
  lt: 'menor que',
  lte: 'menor o igual',
  empty: 'está vacío',
  not_empty: 'no está vacío',
};

export const FILTER_OPERATOR_SYMBOLS: Record<FilterOperator, string> = {
  eq: '=',
  neq: '≠',
  contains: '~',
  not_contains: '!~',
  starts_with: '^',
  ends_with: '$',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  empty: '∅',
  not_empty: '≠∅',
};

const STORAGE_PREFIX = storageKeys.tableViewsV2;

export function createId() {
  return crypto.randomUUID();
}

export function createEmptyCondition(columnId = ''): FilterCondition {
  return {
    id: createId(),
    kind: 'condition',
    columnId,
    operator: 'contains',
    value: '',
  };
}

export function createEmptyFilterGroup(logic: LogicOperator = 'and'): FilterGroup {
  return {
    id: createId(),
    kind: 'group',
    logic,
    children: [],
  };
}

export function getOperatorsForValueType(valueType: ColumnValueType): FilterOperator[] {
  switch (valueType) {
    case 'enum':
      return ['eq', 'neq', 'empty', 'not_empty'];
    case 'number':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];
    case 'date':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];
    case 'text':
    default:
      return [
        'eq',
        'neq',
        'contains',
        'not_contains',
        'starts_with',
        'ends_with',
        'empty',
        'not_empty',
      ];
  }
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('es');
}

function getColumnSearchHaystacks<T, Ctx>(
  item: T,
  column: TableViewColumnDef<T, Ctx>,
  ctx: Ctx,
): string[] {
  const haystacks: string[] = [];
  const raw = (column.getFilterValue(item, ctx) ?? '').trim();
  if (raw) haystacks.push(raw);

  const groupKey = column.getGroupKey(item, ctx);
  const groupLabel = (column.getGroupLabel(groupKey, ctx) ?? '').trim();
  if (groupLabel && groupLabel !== raw) haystacks.push(groupLabel);

  if (column.filterOptions) {
    const option = column.filterOptions.find(
      (entry) => entry.value === raw || entry.value === groupKey,
    );
    if (option?.label?.trim()) haystacks.push(option.label.trim());
  }

  return haystacks;
}

/** Coincidencia del buscador rápido según columnas con `searchable: true`. */
export function matchesTableSearch<T, Ctx>(
  item: T,
  searchTerm: string,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  const term = searchTerm.trim();
  if (!term) return true;

  const searchableColumns = columns.filter((column) => column.searchable);
  if (searchableColumns.length === 0) return true;

  const normalizedTerm = normalize(term);
  return searchableColumns.some((column) =>
    getColumnSearchHaystacks(item, column, ctx).some((haystack) => {
      if (haystack.includes(term)) return true;
      return normalize(haystack).includes(normalizedTerm);
    }),
  );
}

function operatorNeedsValue(operator: FilterOperator) {
  return operator !== 'empty' && operator !== 'not_empty';
}

function compareValues(
  rawValue: string,
  operator: FilterOperator,
  compareValue: string,
  valueType: ColumnValueType,
): boolean {
  const value = rawValue ?? '';

  if (operator === 'empty') {
    return value.trim() === '';
  }
  if (operator === 'not_empty') {
    return value.trim() !== '';
  }

  if (valueType === 'number') {
    const left = Number(value);
    const right = Number(compareValue);
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    switch (operator) {
      case 'eq':
        return left === right;
      case 'neq':
        return left !== right;
      case 'gt':
        return left > right;
      case 'gte':
        return left >= right;
      case 'lt':
        return left < right;
      case 'lte':
        return left <= right;
      default:
        return false;
    }
  }

  if (valueType === 'date') {
    const left = Date.parse(value);
    const right = Date.parse(compareValue);
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    switch (operator) {
      case 'eq':
        return left === right;
      case 'neq':
        return left !== right;
      case 'gt':
        return left > right;
      case 'gte':
        return left >= right;
      case 'lt':
        return left < right;
      case 'lte':
        return left <= right;
      default:
        return false;
    }
  }

  const left = normalize(value);
  const right = normalize(compareValue);

  switch (operator) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'contains':
      return left.includes(right);
    case 'not_contains':
      return !left.includes(right);
    case 'starts_with':
      return left.startsWith(right);
    case 'ends_with':
      return left.endsWith(right);
    default:
      return false;
  }
}

function evaluateCondition<T, Ctx>(
  item: T,
  condition: FilterCondition,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  const column = columns.find((entry) => entry.id === condition.columnId);
  if (!column) return true;

  const compareValue = condition.value.trim();
  if (column.matchesFilter) {
    if (!operatorNeedsValue(condition.operator)) {
      return column.matchesFilter(item, condition.operator, '', ctx);
    }
    if (compareValue === '') return true;
    return column.matchesFilter(item, condition.operator, compareValue, ctx);
  }

  const rawValue = column.getFilterValue(item, ctx) ?? '';
  if (!operatorNeedsValue(condition.operator)) {
    return compareValues(rawValue, condition.operator, '', column.valueType);
  }

  if (compareValue === '') return true;

  return compareValues(rawValue, condition.operator, compareValue, column.valueType);
}

export function matchesFilterRule<T, Ctx>(
  item: T,
  rule: Pick<FilterCondition, 'columnId' | 'operator' | 'value'>,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  return evaluateCondition(
    item,
    {
      id: 'match',
      kind: 'condition',
      columnId: rule.columnId,
      operator: rule.operator,
      value: rule.value,
    },
    columns,
    ctx,
  );
}

export function evaluateFilterGroup<T, Ctx>(
  item: T,
  group: FilterGroup,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  if (group.children.length === 0) return true;

  const results = group.children.map((child) =>
    child.kind === 'condition'
      ? evaluateCondition(item, child, columns, ctx)
      : evaluateFilterGroup(item, child, columns, ctx),
  );

  switch (group.logic) {
    case 'and':
      return results.every(Boolean);
    case 'or':
      return results.some(Boolean);
    case 'nor':
      return !results.some(Boolean);
    case 'nand':
      return !results.every(Boolean);
    default:
      return true;
  }
}

export function applyViewFilters<T, Ctx>(
  items: T[],
  filterRoot: FilterGroup,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): T[] {
  if (filterRoot.children.length === 0) return items;
  return items.filter((item) => evaluateFilterGroup(item, filterRoot, columns, ctx));
}

export type GroupTableItemsOptions = {
  dateGroupGranularity?: DateGroupGranularity;
};

export function groupTableItems<T, Ctx>(
  items: T[],
  groupBy: string | null,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
  options?: GroupTableItemsOptions,
): TableViewGroup<T>[] | null {
  if (!groupBy) return null;

  const column = columns.find((entry) => entry.id === groupBy && entry.groupable);
  if (!column) return null;

  const dateGranularity =
    column.valueType === 'date' ? (options?.dateGroupGranularity ?? 'day') : null;

  const groups = new Map<string, T[]>();
  for (const item of items) {
    const rawKey = column.getGroupKey(item, ctx);
    const key =
      dateGranularity != null ? getDateGroupKey(rawKey, dateGranularity) : rawKey;
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }

  return Array.from(groups.entries())
    .map(([key, groupItems]) => {
      const option = column.filterOptions?.find((entry) => entry.value === key);
      return {
        key,
        label:
          dateGranularity != null
            ? getDateGroupLabel(key, dateGranularity)
            : column.getGroupLabel(key, ctx),
        items: groupItems,
        dotColor: option?.dotColor,
        badgeClassName: option?.badgeClassName,
      };
    })
    .sort((a, b) =>
      dateGranularity != null
        ? compareDateGroupKeys(b.key, a.key)
        : a.label.localeCompare(b.label, 'es'),
    );
}

export function flattenTableViewRows<T>(
  groups: TableViewGroup<T>[] | null,
  items: T[],
  getItemId: (item: T) => string,
): TableViewRow<T>[] {
  if (!groups) {
    return items.map((item) => ({ kind: 'item', item }));
  }

  const rows: TableViewRow<T>[] = [];
  for (const group of groups) {
    rows.push({
      kind: 'group',
      key: group.key,
      label: group.label,
      count: group.items.length,
      itemIds: group.items.map(getItemId),
      dotColor: group.dotColor,
      badgeClassName: group.badgeClassName,
    });
    for (const item of group.items) {
      rows.push({ kind: 'item', item });
    }
  }
  return rows;
}

export function countFilterNodes(group: FilterGroup): number {
  return group.children.reduce((sum, child) => {
    if (child.kind === 'condition') return sum + 1;
    return sum + countFilterNodes(child);
  }, 0);
}

export function updateFilterGroup(
  root: FilterGroup,
  groupId: string,
  updater: (group: FilterGroup) => FilterGroup,
): FilterGroup {
  if (root.id === groupId) return updater(root);
  return {
    ...root,
    children: root.children.map((child) =>
      child.kind === 'group' ? updateFilterGroup(child, groupId, updater) : child,
    ),
  };
}

export function removeFilterNode(root: FilterGroup, nodeId: string): FilterGroup {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== nodeId)
      .map((child) => (child.kind === 'group' ? removeFilterNode(child, nodeId) : child)),
  };
}

type LegacyColumnFilter = { columnId: string; values: string[] };

function migrateLegacyFilters(filters: LegacyColumnFilter[]): FilterGroup {
  const children: FilterCondition[] = filters.flatMap((filter) =>
    filter.values.map((value) => ({
      id: createId(),
      kind: 'condition' as const,
      columnId: filter.columnId,
      operator: 'eq' as const,
      value,
    })),
  );

  return {
    id: createId(),
    kind: 'group',
    logic: 'and',
    children,
  };
}

function normalizeFilterRoot(raw: unknown): FilterGroup {
  if (!raw || typeof raw !== 'object') return createEmptyFilterGroup();

  const group = raw as Partial<FilterGroup>;
  if (group.kind !== 'group' || !Array.isArray(group.children)) {
    return createEmptyFilterGroup();
  }

  return {
    id: typeof group.id === 'string' ? group.id : createId(),
    kind: 'group',
    logic: (group.logic as LogicOperator) ?? 'and',
    children: group.children
      .map((child) => {
        if (!child || typeof child !== 'object') return null;
        if ((child as FilterGroup).kind === 'group') {
          return normalizeFilterRoot(child);
        }
        const condition = child as Partial<FilterCondition>;
        if (condition.kind !== 'condition' || typeof condition.columnId !== 'string') return null;
        return {
          id: typeof condition.id === 'string' ? condition.id : createId(),
          kind: 'condition' as const,
          columnId: condition.columnId,
          operator: (condition.operator as FilterOperator) ?? 'contains',
          value: typeof condition.value === 'string' ? condition.value : '',
        };
      })
      .filter(Boolean) as FilterNode[],
  };
}

export function loadSavedViews(pageKey: string): SavedTableView[] {
  try {
    const raw = readWorkspaceScopedStorage(STORAGE_PREFIX, pageKey, 'saved');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Partial<SavedTableView> & { filters?: LegacyColumnFilter[] }>;
    if (!Array.isArray(parsed)) return [];

    return parsed.map((view) => ({
      id: view.id ?? createId(),
      name: view.name ?? 'Vista',
      groupBy: view.groupBy ?? null,
      filterRoot:
        view.filterRoot != null
          ? normalizeFilterRoot(view.filterRoot)
          : migrateLegacyFilters(view.filters ?? []),
    }));
  } catch {
    return [];
  }
}

export function persistSavedViews(pageKey: string, views: SavedTableView[]) {
  writeWorkspaceScopedStorage(JSON.stringify(views), STORAGE_PREFIX, pageKey, 'saved');
}

export function loadViewState(pageKey: string): { groupBy: string | null; filterRoot: FilterGroup } {
  try {
    const raw = readWorkspaceScopedStorage(STORAGE_PREFIX, pageKey, 'state');
    if (!raw) return { groupBy: null, filterRoot: createEmptyFilterGroup() };

    const parsed = JSON.parse(raw) as {
      groupBy?: string | null;
      filterRoot?: unknown;
      filters?: LegacyColumnFilter[];
    };

    return {
      groupBy: parsed.groupBy ?? null,
      filterRoot:
        parsed.filterRoot != null
          ? normalizeFilterRoot(parsed.filterRoot)
          : migrateLegacyFilters(parsed.filters ?? []),
    };
  } catch {
    return { groupBy: null, filterRoot: createEmptyFilterGroup() };
  }
}

export function persistViewState(
  pageKey: string,
  state: { groupBy: string | null; filterRoot: FilterGroup },
) {
  writeWorkspaceScopedStorage(JSON.stringify(state), STORAGE_PREFIX, pageKey, 'state');
}

export function describeFilterCondition<T, Ctx>(
  condition: FilterCondition,
  columns: TableViewColumnDef<T, Ctx>[],
): string {
  const column = columns.find((entry) => entry.id === condition.columnId);
  const columnLabel = column?.label ?? condition.columnId;
  const operatorLabel = FILTER_OPERATOR_LABELS[condition.operator] ?? condition.operator;

  if (!operatorNeedsValue(condition.operator)) {
    return `${columnLabel} ${operatorLabel}`;
  }

  let valueLabel = condition.value;
  if (column?.filterOptions) {
    valueLabel = column.filterOptions.find((option) => option.value === condition.value)?.label ?? valueLabel;
  }

  return `${columnLabel} ${operatorLabel} ${valueLabel}`.trim();
}

export function describeFilterRoot<T, Ctx>(
  filterRoot: FilterGroup,
  columns: TableViewColumnDef<T, Ctx>[],
): string {
  if (filterRoot.children.length === 0) return 'Sin filtros';

  const parts = filterRoot.children.map((child) => {
    if (child.kind === 'group') {
      return `(${describeFilterRoot(child, columns)})`;
    }
    return describeFilterCondition(child, columns);
  });

  return parts.join(` ${LOGIC_OPERATOR_LABELS[filterRoot.logic]} `);
}
