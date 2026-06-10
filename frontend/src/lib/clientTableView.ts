import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Client } from '@shared/types';
import { clientCreatedAtFilterValue } from '@shared/types';
import type { DisplayColumnDef } from '@/lib/viewConfig';
import type { TableViewColumnDef } from '@/lib/tableViews';
import { CLIENT_STATUS_DOT, CLIENT_STATUS_LABELS } from '@/lib/clientStatus';

const EMPTY_COUNTRY_KEY = '__empty__';

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

export const CLIENT_TABLE_VIEW_COLUMNS: TableViewColumnDef<Client>[] = [
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
