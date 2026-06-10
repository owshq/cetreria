import {
  createId,
  getOperatorsForValueType,
  groupTableItems,
  matchesFilterRule,
  type FilterGroup,
  type FilterOperator,
  type LogicOperator,
  type TableViewColumnDef,
  type TableViewGroup,
  type TableViewRow,
} from '@/lib/tableViews';
import {
  normalizeDateGroupGranularity,
  type DateGroupGranularity,
} from '@/lib/dateGroupGranularity';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import { authService } from '@/api/auth';

export type { FilterOperator, LogicOperator, TableViewColumnDef, TableViewGroup, TableViewRow };

export type ViewLayout = 'table' | 'board';
export type SortDirection = 'asc' | 'desc';

export type LinearFilterRule = {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string;
  joinWithPrevious: LogicOperator | null;
};

export type DisplayColumnDef = {
  id: string;
  label: string;
  emoji?: string;
  defaultWidth: number;
  minWidth: number;
  locked?: boolean;
  align?: 'left' | 'right';
  /** @deprecated Ya no oculta columnas; se conserva solo por compatibilidad con datos antiguos. */
  defaultHidden?: boolean;
  /** El contenido del encabezado ocupa todo el ancho de la columna. */
  headerStretch?: boolean;
};

export type { DateGroupGranularity };

export type TableViewConfig = {
  layout: ViewLayout;
  groupBy: string | null;
  /** Granularidad al agrupar por una columna de tipo fecha (día, semana, mes, trimestre, año). */
  dateGroupGranularity: DateGroupGranularity;
  boardGroupBy: string | null;
  sortBy: string | null;
  sortDirection: SortDirection;
  filterRules: LinearFilterRule[];
  visibleColumnIds: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  /** Columnas fijadas a la izquierda (tras selección), en orden de fijado (máx. 3). */
  pinnedColumnIds: string[];
  /** Muestra el emoji de cada variable a la izquierda del título en el encabezado de la tabla. */
  showHeaderEmojis: boolean;
  /** Versión interna para migrar ajustes de vista por defecto en almacenamiento local. */
  viewDefaultsVersion?: number;
  /** Migraciones de layout de la tabla de actividades del equipo. */
  activityTeamTableVersion?: number;
};

export type SavedTableView = {
  id: string;
  name: string;
  description: string;
  icon: string;
  config: TableViewConfig;
  /** Vista privada: solo visible para el usuario que la creó. */
  isPrivate?: boolean;
  /** Propietario de la vista privada. */
  userId?: string;
  /** Usuario que creó la vista (pública o privada). */
  createdBy?: string;
};

export function canDeleteSavedTableView(
  view: SavedTableView,
  user: { id: string; role: 'admin' | 'user' } | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (view.isPrivate) return view.userId === user.id;
  if (view.createdBy) return view.createdBy === user.id;
  return false;
}

export function formatDeleteSavedViewConfirmMessage(name: string, isPrivate: boolean): string {
  if (isPrivate) {
    return `¿Eliminar la vista «${name}»? Solo se quitará de tu cuenta.`;
  }
  return `¿Eliminar la vista «${name}»? Se quitará para todos los usuarios del espacio de trabajo.`;
}

export type PersistedTableViewState = {
  config: TableViewConfig;
  activeSavedViewId: string | null;
};

const STORAGE_PREFIX = storageKeys.tableViewsV3;
const VIEW_DEFAULTS_VERSION = 3;

/** Todas las columnas de la tabla visibles en la vista por defecto («Todos»). */
export function getDefaultVisibleColumnIds(displayColumns: DisplayColumnDef[]): string[] {
  return displayColumns.map((column) => column.id);
}

function applyViewDefaultsMigration(
  config: TableViewConfig,
  displayColumns: DisplayColumnDef[],
  storedVersion: number,
): TableViewConfig {
  if (storedVersion >= VIEW_DEFAULTS_VERSION) return config;

  let next = config;

  if (storedVersion < 2) {
    const defaults = createDefaultViewConfig(displayColumns);
    next = {
      ...next,
      layout: 'table',
      groupBy: null,
      boardGroupBy: null,
      sortBy: null,
      sortDirection: 'asc',
      filterRules: [],
      visibleColumnIds: defaults.visibleColumnIds,
      viewDefaultsVersion: 2,
    };
  }

  if (storedVersion < VIEW_DEFAULTS_VERSION) {
    next = {
      ...next,
      visibleColumnIds: sanitizeVisibleColumnIds(
        displayColumns,
        getDefaultVisibleColumnIds(displayColumns),
      ),
      viewDefaultsVersion: VIEW_DEFAULTS_VERSION,
    };
  }

  return next;
}

export function createEmptyFilterRule(columnId = ''): LinearFilterRule {
  return {
    id: createId(),
    columnId,
    operator: 'contains',
    value: '',
    joinWithPrevious: null,
  };
}

export function createDefaultViewConfig(
  displayColumns: DisplayColumnDef[],
  _defaultFilterColumnId = '',
): TableViewConfig {
  const columnOrder = pinLockedColumns(
    displayColumns,
    displayColumns.map((column) => column.id),
  );
  const visibleColumnIds = getDefaultVisibleColumnIds(displayColumns);
  const columnWidths = Object.fromEntries(
    displayColumns.map((column) => [column.id, column.defaultWidth]),
  );

  return {
    layout: 'table',
    groupBy: null,
    dateGroupGranularity: 'day',
    boardGroupBy: null,
    sortBy: null,
    sortDirection: 'asc',
    filterRules: [],
    visibleColumnIds,
    columnOrder,
    columnWidths,
    pinnedColumnIds: [],
    showHeaderEmojis: false,
    viewDefaultsVersion: VIEW_DEFAULTS_VERSION,
  };
}

function operatorNeedsValue(operator: FilterOperator) {
  return operator !== 'empty' && operator !== 'not_empty';
}

export function isActiveFilterRule(rule: LinearFilterRule): boolean {
  if (!rule.columnId) return false;
  if (!operatorNeedsValue(rule.operator)) return true;
  return rule.value.trim() !== '';
}

export function sanitizeFilterRules<T, Ctx>(
  rules: LinearFilterRule[],
  columns: TableViewColumnDef<T, Ctx>[],
  defaultFilterColumnId = '',
): LinearFilterRule[] {
  const filterable = columns.filter((column) => column.filterable);
  if (filterable.length === 0) return [];

  const fallbackColumnId =
    filterable.find((column) => column.id === defaultFilterColumnId)?.id ?? filterable[0].id;

  if (rules.length === 0) return [];

  return rules.map((rule, index) => {
    if (!rule.columnId) {
      return {
        ...rule,
        joinWithPrevious: index === 0 ? null : rule.joinWithPrevious ?? 'and',
      };
    }

    const column =
      filterable.find((entry) => entry.id === rule.columnId) ??
      filterable.find((entry) => entry.id === fallbackColumnId) ??
      filterable[0];
    const operators = getOperatorsForValueType(column.valueType);
    const operator = operators.includes(rule.operator) ? rule.operator : operators[0];

    return {
      ...rule,
      columnId: column.id,
      operator,
      joinWithPrevious: index === 0 ? null : rule.joinWithPrevious ?? 'and',
    };
  });
}

export function ensureFilterRules<T, Ctx>(
  rules: LinearFilterRule[],
  _defaultColumnId: string,
  columns?: TableViewColumnDef<T, Ctx>[],
): LinearFilterRule[] {
  if (rules.length === 0) return [];
  if (!columns || columns.length === 0) return rules;
  return sanitizeFilterRules(rules, columns, _defaultColumnId);
}

function evaluateLinearRule<T, Ctx>(
  item: T,
  rule: LinearFilterRule,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  if (!rule.columnId) return true;
  return matchesFilterRule(item, rule, columns, ctx);
}

export function evaluateLinearFilters<T, Ctx>(
  item: T,
  rules: LinearFilterRule[],
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): boolean {
  const activeRules = rules.filter(isActiveFilterRule);
  if (activeRules.length === 0) return true;

  let result = evaluateLinearRule(item, activeRules[0], columns, ctx);
  for (let index = 1; index < activeRules.length; index += 1) {
    const current = evaluateLinearRule(item, activeRules[index], columns, ctx);
    switch (activeRules[index].joinWithPrevious ?? 'and') {
      case 'and':
        result = result && current;
        break;
      case 'or':
        result = result || current;
        break;
      case 'nor':
        result = !(result || current);
        break;
      case 'nand':
        result = !(result && current);
        break;
      default:
        result = result && current;
    }
  }
  return result;
}

export function applyViewFilters<T, Ctx>(
  items: T[],
  config: TableViewConfig,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): T[] {
  return items.filter((item) => evaluateLinearFilters(item, config.filterRules, columns, ctx));
}

function flattenTableViewRows<T>(groups: TableViewGroup<T>[] | null, items: T[]): TableViewRow<T>[] {
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
      itemIds: group.items.map((item) => (item as { id: string }).id),
      dotColor: group.dotColor,
      badgeClassName: group.badgeClassName,
    });
    for (const item of group.items) {
      rows.push({ kind: 'item', item });
    }
  }
  return rows;
}

export function sortViewItems<T, Ctx>(
  items: T[],
  config: TableViewConfig,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): T[] {
  if (!config.sortBy) return items;
  const column = columns.find((entry) => entry.id === config.sortBy);
  if (!column) return items;

  const direction = config.sortDirection === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = column.getFilterValue(a, ctx);
    const right = column.getFilterValue(b, ctx);

    if (column.valueType === 'number') {
      return (Number(left) - Number(right)) * direction;
    }
    if (column.valueType === 'date') {
      return (Date.parse(left) - Date.parse(right)) * direction;
    }
    return left.localeCompare(right, 'es') * direction;
  });
}

export function buildViewRows<T, Ctx>(
  items: T[],
  config: TableViewConfig,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): TableViewRow<T>[] {
  const filtered = applyViewFilters(items, config, columns, ctx);
  const sorted = sortViewItems(filtered, config, columns, ctx);
  const groups = groupTableItems(sorted, config.groupBy, columns, ctx, {
    dateGroupGranularity: config.dateGroupGranularity,
  });
  return flattenTableViewRows(groups, sorted);
}

export function buildBoardGroups<T, Ctx>(
  items: T[],
  config: TableViewConfig,
  columns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
): TableViewGroup<T>[] {
  const filtered = applyViewFilters(items, config, columns, ctx);
  const sorted = sortViewItems(filtered, config, columns, ctx);
  const boardColumnId = config.boardGroupBy ?? config.groupBy;
  return (
    groupTableItems(sorted, boardColumnId, columns, ctx, {
      dateGroupGranularity: config.dateGroupGranularity,
    }) ?? []
  );
}

export function countActiveFilterRules(rules: LinearFilterRule[]) {
  return rules.filter((rule) => {
    if (!rule.columnId) return false;
    if (!operatorNeedsValue(rule.operator)) return true;
    return rule.value.trim() !== '';
  }).length;
}

export function createDefaultFilterRules(_defaultFilterColumnId = ''): LinearFilterRule[] {
  return [];
}

export function stripInactiveFilterRules(rules: LinearFilterRule[]): LinearFilterRule[] {
  return rules.filter(isActiveFilterRule);
}

export function areFilterRulesEqual(a: LinearFilterRule[], b: LinearFilterRule[]) {
  const normalize = (rules: LinearFilterRule[]) =>
    rules.map((rule) => ({
      columnId: rule.columnId,
      operator: rule.operator,
      value: rule.value.trim(),
      joinWithPrevious: rule.joinWithPrevious,
    }));

  const left = normalize(a);
  const right = normalize(b);
  if (left.length !== right.length) return false;

  return left.every(
    (rule, index) =>
      rule.columnId === right[index].columnId &&
      rule.operator === right[index].operator &&
      rule.value === right[index].value &&
      rule.joinWithPrevious === right[index].joinWithPrevious,
  );
}

export function filtersDifferFromDefault(
  rules: LinearFilterRule[],
  _defaultFilterColumnId = '',
) {
  return stripInactiveFilterRules(rules).length > 0;
}

export function viewDiffersFromDefault(
  config: TableViewConfig,
  displayColumns: DisplayColumnDef[],
): boolean {
  const defaults = createDefaultViewConfig(displayColumns);
  return !areViewConfigsEqual(config, defaults, displayColumns);
}

export function createPreparedDefaultViewConfig(
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  return createDefaultViewConfig(displayColumns);
}

export function buildViewStatePayload(
  config: TableViewConfig,
  activeSavedViewId: string | null = null,
): PersistedTableViewState {
  return {
    config: {
      ...config,
      viewDefaultsVersion: VIEW_DEFAULTS_VERSION,
    },
    activeSavedViewId,
  };
}

/** Solo migración desde localStorage; el estado activo vive en el servidor. */
export function loadLegacyViewStateFromStorage(
  pageKey: string,
  displayColumns: DisplayColumnDef[],
  _defaultFilterColumnId = '',
): PersistedTableViewState | null {
  try {
    const raw = readWorkspaceScopedStorage(STORAGE_PREFIX, pageKey, 'state');
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'config' in parsed) {
      const value = parsed as Partial<PersistedTableViewState>;
      return {
        config: normalizeConfig(value.config, displayColumns),
        activeSavedViewId:
          typeof value.activeSavedViewId === 'string' ? value.activeSavedViewId : null,
      };
    }

    return {
      config: normalizeConfig(parsed, displayColumns),
      activeSavedViewId: null,
    };
  } catch {
    return null;
  }
}

export function normalizeViewConfigForCompare(
  config: TableViewConfig,
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  return {
    layout: config.layout,
    groupBy: config.groupBy,
    dateGroupGranularity: config.dateGroupGranularity,
    boardGroupBy: config.boardGroupBy,
    sortBy: config.sortBy,
    sortDirection: config.sortDirection,
    filterRules: config.filterRules.map((rule) => ({
      columnId: rule.columnId,
      operator: rule.operator,
      value: rule.value,
      joinWithPrevious: rule.joinWithPrevious,
    })),
    visibleColumnIds: sanitizeVisibleColumnIds(displayColumns, config.visibleColumnIds),
    columnOrder: pinLockedColumns(displayColumns, config.columnOrder, null),
    columnWidths: sanitizeColumnWidths(displayColumns, config.columnWidths),
    pinnedColumnIds: [],
    showHeaderEmojis: config.showHeaderEmojis,
  };
}

export function areViewConfigsEqual(
  left: TableViewConfig,
  right: TableViewConfig,
  displayColumns: DisplayColumnDef[],
): boolean {
  const a = normalizeViewConfigForCompare(left, displayColumns);
  const b = normalizeViewConfigForCompare(right, displayColumns);
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getOrderedVisibleColumns(
  displayColumns: DisplayColumnDef[],
  config: TableViewConfig,
) {
  const byId = new Map(displayColumns.map((column) => [column.id, column]));
  const ordered = pinLockedColumns(displayColumns, config.columnOrder, config.pinnedColumnIds)
    .map((id) => byId.get(id))
    .filter((column): column is DisplayColumnDef => Boolean(column));

  for (const column of displayColumns) {
    if (!ordered.some((entry) => entry.id === column.id)) {
      ordered.push(column);
    }
  }

  const pinnedSet = new Set(config.pinnedColumnIds);

  return pinLockedColumns(
    displayColumns,
    ordered.map((column) => column.id),
    config.pinnedColumnIds,
  )
    .map((id) => byId.get(id))
    .filter((column): column is DisplayColumnDef => Boolean(column))
    .filter(
      (column) =>
        column.locked ||
        config.visibleColumnIds.includes(column.id) ||
        pinnedSet.has(column.id),
    );
}

export function getBoardableColumns<T, Ctx>(columns: TableViewColumnDef<T, Ctx>[]) {
  return columns.filter(
    (column) =>
      column.boardable &&
      (column.valueType === 'enum' ||
        column.valueType === 'date' ||
        column.valueType === 'text'),
  );
}

export function getSortableColumns<T, Ctx>(columns: TableViewColumnDef<T, Ctx>[]) {
  return columns.filter((column) => column.sortable !== false);
}

function flattenFilterGroup(group: FilterGroup): LinearFilterRule[] {
  const rules: LinearFilterRule[] = [];

  for (const child of group.children) {
    if (child.kind === 'condition') {
      rules.push({
        id: child.id,
        columnId: child.columnId,
        operator: child.operator,
        value: child.value,
        joinWithPrevious: rules.length === 0 ? null : group.logic,
      });
      continue;
    }

    const nested = flattenFilterGroup(child);
    nested.forEach((rule, index) => {
      rules.push({
        ...rule,
        joinWithPrevious:
          rules.length === 0 && index === 0
            ? null
            : index === 0
              ? group.logic
              : rule.joinWithPrevious,
      });
    });
  }

  return rules;
}

function mergeColumnOrder(saved: string[] | undefined, defaults: string[]): string[] {
  const validIds = new Set(defaults);
  const merged = Array.isArray(saved) ? saved.filter((id) => validIds.has(id)) : [];

  for (const id of defaults) {
    if (merged.includes(id)) continue;
    const defaultIndex = defaults.indexOf(id);
    let insertAt = merged.length;
    for (let index = defaultIndex - 1; index >= 0; index -= 1) {
      const anchorIndex = merged.indexOf(defaults[index]);
      if (anchorIndex >= 0) {
        insertAt = anchorIndex + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, id);
  }

  return merged.length > 0 ? merged : [...defaults];
}

export function getLockedColumnIds(displayColumns: DisplayColumnDef[]) {
  return displayColumns.filter((column) => column.locked).map((column) => column.id);
}

export function sanitizeVisibleColumnIds(
  displayColumns: DisplayColumnDef[],
  visibleIds: string[],
) {
  const validIds = new Set(displayColumns.map((column) => column.id));
  const lockedIds = getLockedColumnIds(displayColumns);
  const visible = visibleIds.filter((id) => validIds.has(id));
  return [...new Set([...lockedIds, ...visible])];
}

export function sanitizeColumnWidths(
  displayColumns: DisplayColumnDef[],
  widths: Record<string, number>,
) {
  const defaults = createDefaultViewConfig(displayColumns).columnWidths;
  return Object.fromEntries(
    displayColumns.map((column) => [
      column.id,
      column.locked
        ? column.defaultWidth
        : Math.max(column.minWidth, widths[column.id] ?? defaults[column.id] ?? column.defaultWidth),
    ]),
  ) as Record<string, number>;
}

export const MAX_PINNED_COLUMNS = 3;

export function getColumnWidth(config: TableViewConfig, column: DisplayColumnDef) {
  return column.locked
    ? column.defaultWidth
    : (config.columnWidths[column.id] ?? column.defaultWidth);
}

export function sanitizePinnedColumnIds(
  displayColumns: DisplayColumnDef[],
  pinnedColumnIds: string[] | null | undefined,
): string[] {
  if (!Array.isArray(pinnedColumnIds)) return [];
  const byId = new Map(displayColumns.map((column) => [column.id, column]));
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of pinnedColumnIds) {
    if (!id || id === 'select' || seen.has(id)) continue;
    const column = byId.get(id);
    if (!column || column.locked) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_PINNED_COLUMNS) break;
  }

  return result;
}

/** Pin es independiente de las vistas guardadas; se aplica sobre cualquier config activa. */
export function applyPinnedColumnLayout(
  config: TableViewConfig,
  pinnedColumnIds: string[] | null | undefined,
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  const pinned =
    pinnedColumnIds === null
      ? []
      : sanitizePinnedColumnIds(
          displayColumns,
          pinnedColumnIds ?? config.pinnedColumnIds,
        );
  return {
    ...config,
    pinnedColumnIds: pinned,
    columnOrder: pinLockedColumns(displayColumns, config.columnOrder, pinned),
  };
}

/** Locked columns stay fixed: `select` first, pinned columns next (orden de fijado), locked al final. */
export function pinLockedColumns(
  displayColumns: DisplayColumnDef[],
  order: string[],
  pinnedColumnIds: string[] = [],
): string[] {
  const byId = new Map(displayColumns.map((column) => [column.id, column]));
  const allIds = displayColumns.map((column) => column.id);
  const merged = mergeColumnOrder(order, allIds);
  const pinnedIds = sanitizePinnedColumnIds(displayColumns, pinnedColumnIds);
  const pinnedSet = new Set(pinnedIds);

  const startLocked = allIds.filter((id) => byId.get(id)?.locked && id === 'select');
  const endLocked = allIds.filter((id) => byId.get(id)?.locked && id !== 'select');
  let movable = merged.filter((id) => !byId.get(id)?.locked);

  if (pinnedIds.length > 0) {
    const pinnedInOrder = pinnedIds.filter((id) => movable.includes(id));
    const unpinnedMovable = movable.filter((id) => !pinnedSet.has(id));
    movable = [...pinnedInOrder, ...unpinnedMovable];
  }

  return [...startLocked, ...movable, ...endLocked];
}

function resolveStoredPinnedColumnIds(
  value: Partial<TableViewConfig> & { pinnedColumnId?: string | null },
  displayColumns: DisplayColumnDef[],
): string[] {
  if (Array.isArray(value.pinnedColumnIds)) {
    return sanitizePinnedColumnIds(displayColumns, value.pinnedColumnIds);
  }

  const legacyId = value.pinnedColumnId;
  if (!legacyId || legacyId === 'select') return [];
  const column = displayColumns.find((entry) => entry.id === legacyId);
  if (!column || column.locked) return [];
  return [legacyId];
}

function normalizeConfig(raw: unknown, displayColumns: DisplayColumnDef[]): TableViewConfig {
  const defaults = createDefaultViewConfig(
    displayColumns,
    '',
  );

  if (!raw || typeof raw !== 'object') return defaults;
  const value = raw as Partial<TableViewConfig> & {
    filterRoot?: FilterGroup;
    groupBy?: string | null;
  };

  let filterRules = Array.isArray(value.filterRules)
    ? value.filterRules.map((rule) => ({
        id: rule.id ?? createId(),
        columnId: rule.columnId ?? '',
        operator: rule.operator ?? 'contains',
        value: rule.value ?? '',
        joinWithPrevious: rule.joinWithPrevious ?? null,
      }))
    : defaults.filterRules;

  if (filterRules.length === 0 && value.filterRoot) {
    filterRules = flattenFilterGroup(value.filterRoot);
  }

  const storedVersion =
    typeof value.viewDefaultsVersion === 'number' ? value.viewDefaultsVersion : 0;

  const normalized: TableViewConfig = {
    layout: value.layout === 'board' ? 'board' : 'table',
    groupBy: value.groupBy ?? null,
    dateGroupGranularity: normalizeDateGroupGranularity(value.dateGroupGranularity),
    boardGroupBy: value.boardGroupBy ?? value.groupBy ?? null,
    sortBy: value.sortBy ?? null,
    sortDirection: value.sortDirection === 'desc' ? 'desc' : 'asc',
    filterRules: stripInactiveFilterRules(filterRules),
    visibleColumnIds: sanitizeVisibleColumnIds(
      displayColumns,
      Array.isArray(value.visibleColumnIds)
        ? value.visibleColumnIds.filter((id) => defaults.columnOrder.includes(id))
        : defaults.visibleColumnIds,
    ),
    columnOrder: pinLockedColumns(
      displayColumns,
      mergeColumnOrder(value.columnOrder, defaults.columnOrder),
      resolveStoredPinnedColumnIds(value, displayColumns),
    ),
    pinnedColumnIds: resolveStoredPinnedColumnIds(value, displayColumns),
    columnWidths: sanitizeColumnWidths(
      displayColumns,
      value.columnWidths && typeof value.columnWidths === 'object'
        ? { ...defaults.columnWidths, ...value.columnWidths }
        : defaults.columnWidths,
    ),
    showHeaderEmojis: value.showHeaderEmojis === true,
    viewDefaultsVersion: storedVersion,
  };

  return ensureDefaultVisibleColumns(
    applyViewDefaultsMigration(normalized, displayColumns, storedVersion),
    displayColumns,
  );
}

function ensureDefaultVisibleColumns(
  config: TableViewConfig,
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  const defaults = createDefaultViewConfig(displayColumns);
  const missingVisibleIds = getDefaultVisibleColumnIds(displayColumns).filter(
    (id) => !config.visibleColumnIds.includes(id),
  );
  if (missingVisibleIds.length === 0) return config;

  return {
    ...config,
    visibleColumnIds: [...config.visibleColumnIds, ...missingVisibleIds],
    columnOrder: mergeColumnOrder(config.columnOrder, defaults.columnOrder),
    columnWidths: sanitizeColumnWidths(displayColumns, {
      ...config.columnWidths,
      ...Object.fromEntries(
        missingVisibleIds.map((id) => {
          const column = displayColumns.find((entry) => entry.id === id);
          return [id, column?.defaultWidth ?? defaults.columnWidths[id]];
        }),
      ),
    }),
  };
}

function normalizeSavedView(raw: unknown, displayColumns: DisplayColumnDef[]): SavedTableView | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<SavedTableView> & {
    groupBy?: string | null;
    filterRoot?: FilterGroup;
  };

  const config =
    value.config != null
      ? normalizeConfig(value.config, displayColumns)
      : normalizeConfig(
          {
            groupBy: value.groupBy ?? null,
            filterRoot: value.filterRoot,
          },
          displayColumns,
        );

  return {
    id: value.id ?? createId(),
    name: value.name?.trim() || 'Vista',
    description: value.description ?? '',
    icon: value.icon ?? '🔎',
    config,
    ...(value.isPrivate ? { isPrivate: true } : null),
    ...(typeof value.userId === 'string' && value.userId ? { userId: value.userId } : null),
    ...(typeof value.createdBy === 'string' && value.createdBy ? { createdBy: value.createdBy } : null),
  };
}

export function normalizeSavedViewsList(
  raw: unknown,
  displayColumns: DisplayColumnDef[],
): SavedTableView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeSavedView(entry, displayColumns))
    .filter((entry): entry is SavedTableView => Boolean(entry));
}

function getCurrentUserId(): string | null {
  return authService.getCurrentUser()?.id ?? null;
}

function loadStoredViews(
  pageKey: string,
  displayColumns: DisplayColumnDef[],
  scope: string,
  userId?: string,
): SavedTableView[] {
  try {
    const scopeParts = userId ? [scope, userId] : [scope];
    let raw = readWorkspaceScopedStorage(STORAGE_PREFIX, pageKey, 'saved', ...scopeParts);

    if (!raw && scope === 'shared') {
      raw = readWorkspaceScopedStorage(STORAGE_PREFIX, pageKey, 'saved');
      if (raw) {
        const legacy = normalizeSavedViewsList(JSON.parse(raw), displayColumns);
        const publicViews = legacy.filter((view) => !view.isPrivate);
        const privateViews = legacy.filter((view) => view.isPrivate);
        writeWorkspaceScopedStorage(
          JSON.stringify(publicViews),
          STORAGE_PREFIX,
          pageKey,
          'saved',
          'shared',
        );
        const currentUserId = getCurrentUserId();
        if (currentUserId && privateViews.length > 0) {
          writeWorkspaceScopedStorage(
            JSON.stringify(privateViews),
            STORAGE_PREFIX,
            pageKey,
            'saved',
            'private',
            currentUserId,
          );
        }
        return scope === 'shared' ? publicViews : [];
      }
    }

    if (!raw) return [];
    return normalizeSavedViewsList(JSON.parse(raw), displayColumns);
  } catch {
    return [];
  }
}

export function loadSavedViews(pageKey: string, displayColumns: DisplayColumnDef[]): SavedTableView[] {
  const publicViews = loadStoredViews(pageKey, displayColumns, 'shared');
  const userId = getCurrentUserId();
  const privateViews = userId ? loadStoredViews(pageKey, displayColumns, 'private', userId) : [];
  return [...publicViews, ...privateViews];
}

export function persistSavedViews(pageKey: string, views: SavedTableView[]) {
  const publicViews = views.filter((view) => !view.isPrivate);
  const privateViews = views.filter((view) => view.isPrivate);
  writeWorkspaceScopedStorage(JSON.stringify(publicViews), STORAGE_PREFIX, pageKey, 'saved', 'shared');

  const userId = getCurrentUserId();
  if (userId) {
    writeWorkspaceScopedStorage(
      JSON.stringify(privateViews),
      STORAGE_PREFIX,
      pageKey,
      'saved',
      'private',
      userId,
    );
  }
}

export function createEmptyViewState(displayColumns: DisplayColumnDef[]): PersistedTableViewState {
  return { config: createDefaultViewConfig(displayColumns), activeSavedViewId: null };
}

export function parseRemoteViewState(
  rawConfig: unknown,
  activeSavedViewId: string | null,
  displayColumns: DisplayColumnDef[],
): PersistedTableViewState {
  if (!rawConfig) {
    return createEmptyViewState(displayColumns);
  }
  return {
    config: normalizeConfig(rawConfig, displayColumns),
    activeSavedViewId,
  };
}

export function describeLinearFilters<T, Ctx>(
  rules: LinearFilterRule[],
  columns: TableViewColumnDef<T, Ctx>[],
): string {
  const active = rules.filter(isActiveFilterRule);
  if (active.length === 0) return 'Sin filtros activos';

  return active
    .map((rule, index) => {
      const column = columns.find((entry) => entry.id === rule.columnId);
      const label = column?.label ?? rule.columnId;
      const operator = rule.operator;
      const prefix =
        index === 0 ? '' : `${rule.joinWithPrevious?.toUpperCase() ?? 'AND'} `;
      if (!operatorNeedsValue(operator)) {
        return `${prefix}${label} ${operator}`;
      }
      return `${prefix}${label} ${operator} ${rule.value}`.trim();
    })
    .join(' · ');
}

export { getOperatorsForValueType, createId };
