import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client, UserAssignee } from '@shared/types';
import { clientCreatedAtFilterValue } from '@shared/types';
import type { DisplayColumnDef } from '@/lib/viewConfig';
import type { FilterOperator, TableViewColumnDef } from '@/lib/tableViews';
import { CLIENT_STATUS_DOT, CLIENT_STATUS_LABELS } from '@/lib/clientStatus';
import { buildClientOperatorIdsMap, clientHasOperator } from '@/lib/clientOperatorFilter';

const EMPTY_COUNTRY_KEY = '__empty__';
const EMPTY_OPERATOR_KEY = '__none__';

export type ClientTableContext = {
  assigneesMap: Map<string, UserAssignee>;
  clientOperatorIds: Map<string, Set<string>>;
};

export function createClientTableContext(
  assignees: readonly UserAssignee[],
  activities: readonly import('@shared/types').Activity[],
  events: readonly import('@shared/types').CalendarEvent[],
  clients: readonly Pick<Client, 'id' | 'assignedUserIds'>[] = [],
): ClientTableContext {
  return {
    assigneesMap: new Map(assignees.map((user) => [user.id, user])),
    clientOperatorIds: buildClientOperatorIdsMap(activities, events, clients),
  };
}

export const EMPTY_CLIENT_TABLE_CONTEXT: ClientTableContext = {
  assigneesMap: new Map(),
  clientOperatorIds: new Map(),
};

function operatorFilterMatch(
  client: Client,
  operator: FilterOperator,
  value: string,
  ctx: ClientTableContext,
): boolean {
  const operatorIds = ctx.clientOperatorIds.get(client.id);
  const hasOperators = Boolean(operatorIds && operatorIds.size > 0);

  if (operator === 'empty') return !hasOperators;
  if (operator === 'not_empty') return hasOperators;
  if (!value) return true;

  const matches = clientHasOperator(client.id, value, ctx.clientOperatorIds);
  if (operator === 'eq') return matches;
  if (operator === 'neq') return !matches;
  return true;
}

function formatCreatedAtGroupLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  try {
    return format(parseISO(key), 'd MMM yyyy', { locale: es });
  } catch {
    return key;
  }
}

export const CLIENTS_VIEW_PAGE_KEY = 'clients';

export const CLIENT_DISPLAY_COLUMNS: DisplayColumnDef[] = [
  { id: 'select', label: 'Selección', defaultWidth: 64, minWidth: 64, locked: true },
  { id: 'client', label: 'Nombre', emoji: '👤', defaultWidth: 200, minWidth: 140 },
  { id: 'contact', label: 'Contacto', emoji: '✉️', defaultWidth: 220, minWidth: 160 },
  { id: 'address', label: 'Dirección', emoji: '📍', defaultWidth: 200, minWidth: 140 },
  { id: 'website', label: 'Web', emoji: '🌐', defaultWidth: 180, minWidth: 120 },
  { id: 'technicalInfo', label: 'Info técnica', emoji: '🛠️', defaultWidth: 200, minWidth: 140 },
  { id: 'createdAt', label: 'Fecha de alta', emoji: '📅', defaultWidth: 130, minWidth: 110 },
  { id: 'observations', label: 'Observaciones', emoji: '💬', defaultWidth: 150, minWidth: 110 },
  { id: 'status', label: 'Estado', emoji: '🏷️', defaultWidth: 140, minWidth: 110 },
];

export const CLIENT_TABLE_VIEW_COLUMNS: TableViewColumnDef<Client, ClientTableContext>[] = [
  {
    id: 'name',
    label: 'Nombre',
    emoji: '👤',
    valueType: 'text',
    groupable: true,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => {
      const initial = client.name.trim().charAt(0).toUpperCase();
      return /[A-ZÁÉÍÓÚÑ]/i.test(initial) ? initial : '#';
    },
    getGroupLabel: (key) => (key === '#' ? 'Otros' : key),
    getFilterValue: (client) => client.name,
  },
  {
    id: 'email',
    label: 'Email',
    emoji: '✉️',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.email,
    getGroupLabel: (key) => key,
    getFilterValue: (client) => client.email,
  },
  {
    id: 'phone',
    label: 'Teléfono',
    emoji: '📞',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.phone,
    getGroupLabel: (key) => key,
    getFilterValue: (client) => client.phone,
  },
  {
    id: 'address',
    label: 'Dirección',
    emoji: '📍',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.address,
    getGroupLabel: (key) => key,
    getFilterValue: (client) => client.address,
  },
  {
    id: 'website',
    label: 'Web',
    emoji: '🌐',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.website,
    getGroupLabel: (key) => key,
    getFilterValue: (client) => client.website,
  },
  {
    id: 'technicalInfo',
    label: 'Info técnica',
    emoji: '🛠️',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.technicalInfo,
    getGroupLabel: (key) => key,
    getFilterValue: (client) => client.technicalInfo,
  },
  {
    id: 'country',
    label: 'País',
    emoji: '🌍',
    valueType: 'text',
    groupable: true,
    filterable: true,
    boardable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.country.trim() || EMPTY_COUNTRY_KEY,
    getGroupLabel: (key) => (key === EMPTY_COUNTRY_KEY ? 'Sin país' : key),
    getFilterValue: (client) => client.country,
  },
  {
    id: 'status',
    label: 'Estado',
    emoji: '🏷️',
    valueType: 'enum',
    groupable: true,
    filterable: true,
    boardable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => client.status,
    getGroupLabel: (key) => CLIENT_STATUS_LABELS[key as Client['status']] ?? key,
    getFilterValue: (client) => client.status,
    filterOptions: [
      { value: 'active', label: 'Activo', dotColor: CLIENT_STATUS_DOT.active, emoji: '🟢' },
      { value: 'potential', label: 'Potencial', dotColor: CLIENT_STATUS_DOT.potential, emoji: '🟠' },
      { value: 'inactive', label: 'Inactivo', dotColor: CLIENT_STATUS_DOT.inactive, emoji: '🔴' },
    ],
  },
  {
    id: 'createdAt',
    label: 'Fecha de alta',
    emoji: '📅',
    valueType: 'date',
    groupable: true,
    filterable: true,
    boardable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => clientCreatedAtFilterValue(client),
    getGroupLabel: (key) => formatCreatedAtGroupLabel(key),
    getFilterValue: (client) => clientCreatedAtFilterValue(client),
  },
  {
    id: 'observations',
    label: 'Observaciones',
    emoji: '💬',
    valueType: 'text',
    groupable: false,
    filterable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client) => (client.observations.length > 0 ? 'with' : 'none'),
    getGroupLabel: (key) => (key === 'with' ? 'Con observaciones' : 'Sin observaciones'),
    getFilterValue: (client) =>
      client.observations.map((observation) => observation.text).join(' '),
  },
];

export function buildClientTableViewColumns(
  assignees: readonly UserAssignee[],
): TableViewColumnDef<Client, ClientTableContext>[] {
  if (assignees.length === 0) return CLIENT_TABLE_VIEW_COLUMNS;

  const assigneeOptions = [...assignees]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((user) => ({ value: user.id, label: user.name }));

  const operatorColumn: TableViewColumnDef<Client, ClientTableContext> = {
    id: 'operator',
    label: 'Operario',
    emoji: '👥',
    valueType: 'enum',
    groupable: true,
    filterable: true,
    boardable: true,
    sortable: true,
    searchable: true,
    getGroupKey: (client, ctx) => {
      const ids = ctx.clientOperatorIds.get(client.id);
      if (!ids || ids.size === 0) return EMPTY_OPERATOR_KEY;
      return [...ids].sort()[0] ?? EMPTY_OPERATOR_KEY;
    },
    getGroupLabel: (key, ctx) =>
      key === EMPTY_OPERATOR_KEY ? 'Sin operario' : (ctx.assigneesMap.get(key)?.name ?? '—'),
    getFilterValue: (client, ctx) => {
      const ids = ctx.clientOperatorIds.get(client.id);
      if (!ids || ids.size === 0) return '';
      return [...ids]
        .map((id) => ctx.assigneesMap.get(id)?.name ?? id)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .join(', ');
    },
    filterOptions: assigneeOptions,
    matchesFilter: operatorFilterMatch,
  };

  return [...CLIENT_TABLE_VIEW_COLUMNS, operatorColumn];
}
