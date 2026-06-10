import type { Client } from '@shared/types';
import type { SelectMenuOption } from '@/components/SelectMenu';

export const CLIENT_STATUS_DOT: Record<Client['status'], string> = {
  active: '#22c55e',
  potential: '#f97316',
  inactive: '#ef4444',
};

export const CLIENT_STATUS_LABELS: Record<Client['status'], string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  potential: 'Potencial',
};

export const CLIENT_STATUSES: Client['status'][] = ['active', 'potential', 'inactive'];

/** Opciones de estado para formularios (SelectMenu con bolita de color). */
export const CLIENT_STATUS_FORM_OPTIONS: SelectMenuOption[] = (
  ['active', 'inactive', 'potential'] as const
).map((status) => ({
  value: status,
  label: CLIENT_STATUS_LABELS[status],
  dotColor: CLIENT_STATUS_DOT[status],
}));

export const CLIENT_STATUS_FILTER_OPTIONS: SelectMenuOption[] = [
  { value: 'all', label: 'Todos los estados', emoji: '🏷️' },
  { value: 'active', label: 'Activos', dotColor: CLIENT_STATUS_DOT.active, emoji: '🟢' },
  { value: 'potential', label: 'Potenciales', dotColor: CLIENT_STATUS_DOT.potential, emoji: '🟠' },
  { value: 'inactive', label: 'Inactivos', dotColor: CLIENT_STATUS_DOT.inactive, emoji: '🔴' },
];
