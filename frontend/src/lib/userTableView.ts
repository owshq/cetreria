import type { User } from '@shared/types';
import { getUserRoleLabel } from '@shared/types';
import type { DisplayColumnDef } from '@/lib/viewConfig';
import type { TableViewColumnDef } from '@/lib/tableViews';

export const USERS_VIEW_PAGE_KEY = 'users';

export const USER_DISPLAY_COLUMNS: DisplayColumnDef[] = [
  { id: 'user', label: 'Usuario', emoji: '\uD83E\uDDD1\u200D\uD83D\uDCBC', defaultWidth: 240, minWidth: 160 },
  { id: 'email', label: 'Email', emoji: '\u2709\uFE0F', defaultWidth: 220, minWidth: 160 },
  { id: 'role', label: 'Rol', emoji: '\uD83C\uDFF7\uFE0F', defaultWidth: 160, minWidth: 120 },
  {
    id: 'password',
    label: 'Contraseña',
    emoji: '\uD83D\uDD11',
    defaultWidth: 180,
    minWidth: 140,
    headerStretch: true,
  },
  { id: 'actions', label: 'Acciones', defaultWidth: 100, minWidth: 90, locked: true, align: 'right' },
];

export const USER_TABLE_VIEW_COLUMNS: TableViewColumnDef<Omit<User, 'password'>>[] = [
  {
    id: 'name',
    label: 'Usuario',
    emoji: '\uD83E\uDDD1\u200D\uD83D\uDCBC',
    valueType: 'text',
    groupable: false,
    filterable: false,
    sortable: true,
    searchable: true,
    getGroupKey: (user) => user.name,
    getGroupLabel: (key) => key,
    getFilterValue: (user) => user.name,
  },
  {
    id: 'email',
    label: 'Email',
    emoji: '\u2709\uFE0F',
    valueType: 'text',
    groupable: false,
    filterable: false,
    sortable: true,
    searchable: true,
    getGroupKey: (user) => user.email,
    getGroupLabel: (key) => key,
    getFilterValue: (user) => user.email,
  },
  {
    id: 'role',
    label: 'Rol',
    emoji: '\uD83C\uDFF7\uFE0F',
    valueType: 'text',
    groupable: false,
    filterable: false,
    sortable: true,
    searchable: true,
    getGroupKey: (user) => getUserRoleLabel(user),
    getGroupLabel: (key) => key,
    getFilterValue: (user) => getUserRoleLabel(user),
  },
];
