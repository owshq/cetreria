import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Activity,
  ActivityType,
  Client,
  Document,
  UserAssignee,
  WorkspaceScheduleShiftBoundaries,
} from '@shared/types';
import {
  findEventForActivity,
  getActivityAssigneeIds,
  getActivityTypeLabel,
  getActivityWorkReportSurfaceStatus,
  isActivitySigned,
} from '@shared/types';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import {
  formatActivityDocumentConcepts,
  formatActivityShiftCodes,
  getActivityDocumentStatuses,
  getActivityDocuments,
  getActivityHoursTotals,
  getActivityWorkReportStatusLabel,
  getActivityReportedHoursForTable,
  sumActivityDocumentTotals,
} from '@/lib/activityTableFields';
import {
  DOCUMENT_STATUS_CLASS,
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
} from '@/lib/documentStatus';
import { SHIFT_META, type ShiftCode } from '@shared/types';
import { buildShiftColorMap, getShiftPaletteColor } from '@/lib/shiftColorPalette';
import {
  createDefaultViewConfig,
  pinLockedColumns,
  type DisplayColumnDef,
  type TableViewConfig,
} from '@/lib/viewConfig';
import type { TableViewColumnDef } from '@/lib/tableViews';

/** Clave aislada de vistas/filtros de la tabla de actividades (independiente de clients, documents, etc.). */
export const ACTIVITIES_TEAM_TABLE_PAGE_KEY = 'activities-team-table';

const LEGACY_ACTIVITY_COLUMN_ID = 'activity';
const LEGACY_HOURS_COLUMN_ID = 'hours';

/** Versión de orden/visibilidad por defecto de la tabla de actividades. */
export const ACTIVITY_TEAM_TABLE_VIEW_VERSION = 4;

/** Orden de columnas movibles (select y tipo se reordenan con pinLockedColumns). */
export const ACTIVITY_TEAM_TABLE_MOVABLE_COLUMN_ORDER = [
  'description',
  'date',
  'client',
  'assignee',
  'signed',
  'hoursAssigned',
  'hoursSigned',
  'workReportHours',
  'workReportStatus',
  'documents',
  'shifts',
  'documentTotal',
  'documentStatus',
  'documentConcepts',
] as const;

export function getDefaultActivityTeamTableColumnOrder(): string[] {
  return pinLockedColumns(ACTIVITY_DISPLAY_COLUMNS, [
    'select',
    ...ACTIVITY_TEAM_TABLE_MOVABLE_COLUMN_ORDER,
    'type',
  ]);
}

export function createDefaultActivityTeamTableConfig(): TableViewConfig {
  return {
    ...createDefaultViewConfig(ACTIVITY_DISPLAY_COLUMNS),
    columnOrder: getDefaultActivityTeamTableColumnOrder(),
    pinnedColumnIds: [],
    activityTeamTableVersion: ACTIVITY_TEAM_TABLE_VIEW_VERSION,
  };
}

export const ACTIVITY_DISPLAY_COLUMNS: DisplayColumnDef[] = [
  { id: 'select', label: 'Selección', defaultWidth: 64, minWidth: 64, locked: true },
  {
    id: 'type',
    label: 'Tipo',
    emoji: ACTIVITY_EMOJI,
    defaultWidth: 140,
    minWidth: 110,
    locked: true,
  },
  {
    id: 'description',
    label: 'Descripción',
    emoji: '\uD83D\uDCDD',
    defaultWidth: 200,
    minWidth: 140,
  },
  { id: 'date', label: 'Fecha', emoji: '\uD83D\uDCC5', defaultWidth: 120, minWidth: 100 },
  { id: 'client', label: 'Contacto', emoji: '\uD83D\uDC64', defaultWidth: 160, minWidth: 120 },
  { id: 'assignee', label: 'Operario', emoji: '\uD83D\uDC65', defaultWidth: 150, minWidth: 110 },
  { id: 'signed', label: 'Firmada', emoji: '\u270D\uFE0F', defaultWidth: 100, minWidth: 84 },
  {
    id: 'hoursAssigned',
    label: 'Horas asignadas',
    emoji: '\u23F3',
    defaultWidth: 108,
    minWidth: 92,
    align: 'right',
  },
  {
    id: 'hoursSigned',
    label: 'Horas firmadas',
    emoji: '\u270D\uFE0F',
    defaultWidth: 108,
    minWidth: 92,
    align: 'right',
  },
  {
    id: 'workReportHours',
    label: 'Horas informe',
    emoji: '\u23F1\uFE0F',
    defaultWidth: 108,
    minWidth: 92,
    align: 'right',
  },
  {
    id: 'workReportStatus',
    label: 'Informe de Trabajo',
    emoji: '\uD83D\uDCCB',
    defaultWidth: 110,
    minWidth: 92,
  },
  { id: 'documents', label: 'Documentos', emoji: '\uD83D\uDCC4', defaultWidth: 150, minWidth: 110 },
  {
    id: 'shifts',
    label: 'Turno',
    emoji: '\uD83C\uDF05',
    defaultWidth: 120,
    minWidth: 90,
  },
  {
    id: 'documentTotal',
    label: 'Ingresos',
    emoji: '\uD83D\uDCB6',
    defaultWidth: 100,
    minWidth: 80,
    align: 'right',
  },
  {
    id: 'documentStatus',
    label: 'Estado documento',
    emoji: '\uD83C\uDFF7\uFE0F',
    defaultWidth: 150,
    minWidth: 110,
  },
  {
    id: 'documentConcepts',
    label: 'Conceptos',
    emoji: '\uD83E\uDDFE',
    defaultWidth: 180,
    minWidth: 120,
  },
];

export type ActivityTableContext = {
  clientsMap: Map<string, Client>;
  assigneesMap: Map<string, UserAssignee>;
  activityTypes: ActivityType[];
  events: import('@shared/types').CalendarEvent[];
  documentsByActivityId: Map<string, import('@shared/types').Document[]>;
  boundaries: WorkspaceScheduleShiftBoundaries;
  shiftSchedulingEnabled?: boolean;
  workerSignaturesEnabled?: boolean;
  hasWorkReportActivityTypes?: boolean;
};

export type ActivityTableColumnOptions = {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
  hasWorkReportActivityTypes?: boolean;
};

export function filterActivityDisplayColumns(
  columns: DisplayColumnDef[],
  options: ActivityTableColumnOptions = {},
): DisplayColumnDef[] {
  const workerSignaturesEnabled = options.workerSignaturesEnabled ?? false;
  const shiftSchedulingEnabled = options.shiftSchedulingEnabled ?? false;
  const hasWorkReportActivityTypes = options.hasWorkReportActivityTypes ?? false;
  return columns.filter((column) => {
    if (hasWorkReportActivityTypes) {
      if (!workerSignaturesEnabled && (column.id === 'hoursSigned' || column.id === 'signed')) {
        return false;
      }
    } else if (column.id === 'workReportHours' || column.id === 'workReportStatus') {
      return false;
    }
    if (!workerSignaturesEnabled && !hasWorkReportActivityTypes) {
      if (column.id === 'hoursSigned' || column.id === 'signed') return false;
    }
    if (!shiftSchedulingEnabled && column.id === 'shifts') {
      return false;
    }
    if (!hasWorkReportActivityTypes && (column.id === 'workReportHours' || column.id === 'workReportStatus')) {
      return false;
    }
    return true;
  });
}

export function buildActivityTableColumns(
  assignees: UserAssignee[],
  activityTypes: ActivityType[],
  clients: Client[],
  options: ActivityTableColumnOptions = {},
): TableViewColumnDef<Activity, ActivityTableContext>[] {
  const workerSignaturesEnabled = options.workerSignaturesEnabled ?? false;
  const shiftSchedulingEnabled = options.shiftSchedulingEnabled ?? false;
  const hasWorkReportActivityTypes = options.hasWorkReportActivityTypes ?? false;
  const shiftColors = buildShiftColorMap();
  const assigneeOptions = [...assignees]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((user) => ({ value: user.id, label: user.name }));

  const typeOptions = activityTypes.map((type) => ({
    value: type.id,
    label: type.name,
    emoji: type.icon,
    dotColor: type.color,
  }));

  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((client) => ({ value: client.id, label: client.name }));

  const columns: TableViewColumnDef<Activity, ActivityTableContext>[] = [
    {
      id: 'type',
      label: 'Tipo',
      emoji: ACTIVITY_EMOJI,
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => activity.type,
      getGroupLabel: (key, ctx) => getActivityTypeLabel(key, ctx.activityTypes),
      getFilterValue: (activity) => activity.type,
      filterOptions: typeOptions,
    },
    {
      id: 'description',
      label: 'Descripci\u00f3n',
      emoji: '\uD83D\uDCDD',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity) => activity.description.trim(),
      getGroupLabel: (key) => key || '\u2014',
      getFilterValue: (activity) => activity.description,
    },
    {
      id: 'date',
      label: 'Fecha',
      emoji: '\uD83D\uDCC5',
      valueType: 'date',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity) => activity.date,
      getGroupLabel: (key) => format(parseISO(key), 'd MMM yyyy', { locale: es }),
      getFilterValue: (activity) => activity.date,
    },
    {
      id: 'client',
      label: 'Contacto',
      emoji: '\uD83D\uDC64',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity) => activity.clientId,
      getGroupLabel: (key, ctx) => ctx.clientsMap.get(key)?.name ?? 'Contacto desconocido',
      getFilterValue: (activity) => activity.clientId,
      filterOptions: clientOptions,
    },
    {
      id: 'assignee',
      label: 'Operario',
      emoji: '\uD83D\uDC65',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => {
        const event = findEventForActivity(activity, ctx.events);
        const ids = getActivityAssigneeIds(activity, event);
        return ids[0] ?? '';
      },
      getGroupLabel: (key, ctx) => ctx.assigneesMap.get(key)?.name ?? '\u2014',
      getFilterValue: (activity, ctx) => {
        const event = findEventForActivity(activity, ctx.events);
        return getActivityAssigneeIds(activity, event)[0] ?? '';
      },
      filterOptions: assigneeOptions,
    },
    {
      id: 'signed',
      label: 'Firmada',
      emoji: '\u270D\uFE0F',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (activity, ctx) => {
        const event = findEventForActivity(activity, ctx.events);
        return isActivitySigned(activity, event) ? 'yes' : 'no';
      },
      getGroupLabel: (key) => (key === 'yes' ? 'Firmada' : 'Sin firma'),
      getFilterValue: (activity, ctx) => {
        const event = findEventForActivity(activity, ctx.events);
        return isActivitySigned(activity, event) ? 'yes' : 'no';
      },
      filterOptions: [
        { value: 'yes', label: 'Firmada', emoji: '\u2705' },
        { value: 'no', label: 'Sin firma', emoji: '\u274C' },
      ],
    },
    {
      id: 'hoursAssigned',
      label: 'Horas asignadas',
      emoji: '\u23F3',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => String(getActivityHoursTotals(activity, ctx).assignedHours),
      getGroupLabel: (key) => `${key} h`,
      getFilterValue: (activity, ctx) =>
        String(getActivityHoursTotals(activity, ctx).assignedHours),
    },
    {
      id: 'hoursSigned',
      label: 'Horas firmadas',
      emoji: '\u270D\uFE0F',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => String(getActivityHoursTotals(activity, ctx).signedHours),
      getGroupLabel: (key) => `${key} h`,
      getFilterValue: (activity, ctx) => String(getActivityHoursTotals(activity, ctx).signedHours),
    },
    {
      id: 'workReportHours',
      label: 'Horas informe',
      emoji: '\u23F1\uFE0F',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => String(getActivityReportedHoursForTable(activity, ctx)),
      getGroupLabel: (key) => `${key} h`,
      getFilterValue: (activity, ctx) => String(getActivityReportedHoursForTable(activity, ctx)),
    },
    {
      id: 'workReportStatus',
      label: 'Informe de Trabajo',
      emoji: '\uD83D\uDCCB',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (activity) => getActivityWorkReportSurfaceStatus(activity),
      getGroupLabel: (key) => getActivityWorkReportStatusLabel(key as ReturnType<typeof getActivityWorkReportSurfaceStatus>),
      getFilterValue: (activity) => getActivityWorkReportSurfaceStatus(activity),
      filterOptions: [
        { value: 'none', label: 'Sin informe', emoji: '\u26AA' },
        { value: 'draft', label: 'Borrador', emoji: '\u270E\uFE0F' },
        { value: 'submitted', label: 'Enviado', emoji: '\u2705' },
      ],
    },
    {
      id: 'documents',
      label: 'Documentos',
      emoji: '\uD83D\uDCC4',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => {
        const docs = getActivityDocuments(activity, ctx);
        return docs.map((doc) => doc.number).join(', ');
      },
      getGroupLabel: (key) => key || '\u2014',
      getFilterValue: (activity, ctx) => {
        const docs = getActivityDocuments(activity, ctx);
        return docs.map((doc) => doc.number).join(' ');
      },
    },
    {
      id: 'shifts',
      label: 'Turno',
      emoji: '\uD83C\uDF05',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => formatActivityShiftCodes(activity, ctx),
      getGroupLabel: (key) => {
        if (!key) return '\u2014';
        return key
          .split(', ')
          .map((code) => SHIFT_META[code as ShiftCode]?.label ?? code)
          .join(', ');
      },
      getFilterValue: (activity, ctx) => formatActivityShiftCodes(activity, ctx),
      filterOptions: (Object.keys(SHIFT_META) as ShiftCode[]).map((code) => ({
        value: code,
        label: SHIFT_META[code].label,
        dotColor: getShiftPaletteColor(code, shiftColors),
      })),
    },
    {
      id: 'documentTotal',
      label: 'Ingresos',
      emoji: '\uD83D\uDCB6',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => {
        const docs = getActivityDocuments(activity, ctx);
        return docs.length > 0 ? String(sumActivityDocumentTotals(docs)) : '';
      },
      getGroupLabel: (key) => (key ? `${Number(key).toFixed(2)}\u20ac` : '\u2014'),
      getFilterValue: (activity, ctx) => {
        const docs = getActivityDocuments(activity, ctx);
        return docs.length > 0 ? String(sumActivityDocumentTotals(docs)) : '';
      },
    },
    {
      id: 'documentStatus',
      label: 'Estado documento',
      emoji: '\uD83C\uDFF7\uFE0F',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => {
        const statuses = getActivityDocumentStatuses(getActivityDocuments(activity, ctx));
        return statuses.join(', ');
      },
      getGroupLabel: (key) => {
        if (!key) return '\u2014';
        return key
          .split(', ')
          .map((status) => DOCUMENT_STATUS_LABELS[status as Document['status']] ?? status)
          .join(', ');
      },
      getFilterValue: (activity, ctx) => {
        const statuses = getActivityDocumentStatuses(getActivityDocuments(activity, ctx));
        return statuses.join(' ');
      },
      filterOptions: [
        {
          value: 'draft',
          label: 'Borrador',
          dotColor: DOCUMENT_STATUS_DOT.draft,
          badgeClassName: DOCUMENT_STATUS_CLASS.draft,
          emoji: '\uD83D\uDCDD',
        },
        {
          value: 'sent',
          label: 'Enviado',
          dotColor: DOCUMENT_STATUS_DOT.sent,
          badgeClassName: DOCUMENT_STATUS_CLASS.sent,
          emoji: '\uD83D\uDCE8',
        },
        {
          value: 'paid',
          label: 'Pagado',
          dotColor: DOCUMENT_STATUS_DOT.paid,
          badgeClassName: DOCUMENT_STATUS_CLASS.paid,
          emoji: '\u2705',
        },
      ],
    },
    {
      id: 'documentConcepts',
      label: 'Conceptos',
      emoji: '\uD83E\uDDFE',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (activity, ctx) => formatActivityDocumentConcepts(getActivityDocuments(activity, ctx)),
      getGroupLabel: (key) => key || '\u2014',
      getFilterValue: (activity, ctx) => formatActivityDocumentConcepts(getActivityDocuments(activity, ctx)),
    },
  ];

  return columns.filter((column) => {
    if (
      !workerSignaturesEnabled &&
      (column.id === 'hoursSigned' || column.id === 'signed' || column.id === 'signatureStatus')
    ) {
      return false;
    }
    if (!shiftSchedulingEnabled && column.id === 'shifts') {
      return false;
    }
    if (!hasWorkReportActivityTypes && (column.id === 'workReportHours' || column.id === 'workReportStatus')) {
      return false;
    }
    if (hasWorkReportActivityTypes && !workerSignaturesEnabled) {
      if (column.id === 'hoursSigned' || column.id === 'signed') return false;
    }
    return true;
  });
}

function remapLegacyActivityColumnIds(ids: string[]): string[] {
  const result: string[] = [];
  for (const id of ids) {
    if (id === LEGACY_ACTIVITY_COLUMN_ID) {
      result.push('type', 'description');
      continue;
    }
    if (id === LEGACY_HOURS_COLUMN_ID) {
      result.push('hoursAssigned', 'hoursSigned');
      continue;
    }
    result.push(id);
  }
  return [...new Set(result)];
}

function remapLegacyActivityColumnId(id: string | null): string | null {
  if (id === LEGACY_ACTIVITY_COLUMN_ID) return 'type';
  if (id === LEGACY_HOURS_COLUMN_ID) return 'hoursAssigned';
  return id;
}

/** Migra vistas guardadas que usaban la columna combinada «Actividad». */
export function migrateActivityTeamTableConfig(config: TableViewConfig): TableViewConfig {
  const defaults = createDefaultActivityTeamTableConfig();
  let next: TableViewConfig = { ...config };

  const usesLegacyColumn =
    next.visibleColumnIds.includes(LEGACY_ACTIVITY_COLUMN_ID) ||
    next.columnOrder.includes(LEGACY_ACTIVITY_COLUMN_ID) ||
    next.pinnedColumnIds.includes(LEGACY_ACTIVITY_COLUMN_ID) ||
    next.groupBy === LEGACY_ACTIVITY_COLUMN_ID ||
    next.boardGroupBy === LEGACY_ACTIVITY_COLUMN_ID ||
    next.sortBy === LEGACY_ACTIVITY_COLUMN_ID ||
    next.filterRules.some((rule) => rule.columnId === LEGACY_ACTIVITY_COLUMN_ID) ||
    LEGACY_ACTIVITY_COLUMN_ID in next.columnWidths;

  const usesLegacyHoursColumn =
    next.visibleColumnIds.includes(LEGACY_HOURS_COLUMN_ID) ||
    next.columnOrder.includes(LEGACY_HOURS_COLUMN_ID) ||
    next.pinnedColumnIds.includes(LEGACY_HOURS_COLUMN_ID) ||
    next.groupBy === LEGACY_HOURS_COLUMN_ID ||
    next.boardGroupBy === LEGACY_HOURS_COLUMN_ID ||
    next.sortBy === LEGACY_HOURS_COLUMN_ID ||
    next.filterRules.some((rule) => rule.columnId === LEGACY_HOURS_COLUMN_ID) ||
    LEGACY_HOURS_COLUMN_ID in next.columnWidths;

  if (usesLegacyColumn) {
    const columnWidths = { ...next.columnWidths };
    const legacyWidth = columnWidths[LEGACY_ACTIVITY_COLUMN_ID];
    delete columnWidths[LEGACY_ACTIVITY_COLUMN_ID];
    if (legacyWidth != null) {
      columnWidths.type ??= Math.min(160, legacyWidth);
      columnWidths.description ??= Math.max(140, legacyWidth - (columnWidths.type ?? 140));
    }

    next = {
      ...next,
      visibleColumnIds: remapLegacyActivityColumnIds(next.visibleColumnIds),
      columnOrder: remapLegacyActivityColumnIds(next.columnOrder),
      pinnedColumnIds: remapLegacyActivityColumnIds(next.pinnedColumnIds),
      groupBy: remapLegacyActivityColumnId(next.groupBy),
      boardGroupBy: remapLegacyActivityColumnId(next.boardGroupBy),
      sortBy: remapLegacyActivityColumnId(next.sortBy),
      filterRules: next.filterRules.map((rule) =>
        rule.columnId === LEGACY_ACTIVITY_COLUMN_ID ? { ...rule, columnId: 'type' } : rule,
      ),
      columnWidths,
    };
  }

  if (usesLegacyHoursColumn) {
    const columnWidths = { ...next.columnWidths };
    const legacyWidth = columnWidths[LEGACY_HOURS_COLUMN_ID];
    delete columnWidths[LEGACY_HOURS_COLUMN_ID];
    if (legacyWidth != null) {
      columnWidths.hoursAssigned ??= legacyWidth;
      columnWidths.hoursSigned ??= legacyWidth;
    }

    next = {
      ...next,
      visibleColumnIds: remapLegacyActivityColumnIds(next.visibleColumnIds),
      columnOrder: remapLegacyActivityColumnIds(next.columnOrder),
      pinnedColumnIds: remapLegacyActivityColumnIds(next.pinnedColumnIds),
      groupBy: remapLegacyActivityColumnId(next.groupBy),
      boardGroupBy: remapLegacyActivityColumnId(next.boardGroupBy),
      sortBy: remapLegacyActivityColumnId(next.sortBy),
      filterRules: next.filterRules.map((rule) =>
        rule.columnId === LEGACY_HOURS_COLUMN_ID ? { ...rule, columnId: 'hoursAssigned' } : rule,
      ),
      columnWidths,
    };
  }

  if ((next.activityTeamTableVersion ?? 0) < ACTIVITY_TEAM_TABLE_VIEW_VERSION) {
    const columnWidths = { ...defaults.columnWidths, ...next.columnWidths };
    const resetLayout = (next.activityTeamTableVersion ?? 0) < 3;
    const missingVisibleIds = defaults.visibleColumnIds.filter(
      (id) => !next.visibleColumnIds.includes(id),
    );

    next = {
      ...next,
      ...(resetLayout
        ? {
            columnOrder: defaults.columnOrder,
            pinnedColumnIds: [],
          }
        : null),
      visibleColumnIds:
        (next.activityTeamTableVersion ?? 0) < 4
          ? defaults.visibleColumnIds
          : [...next.visibleColumnIds, ...missingVisibleIds],
      columnWidths,
      activityTeamTableVersion: ACTIVITY_TEAM_TABLE_VIEW_VERSION,
    };
  }

  return next;
}
