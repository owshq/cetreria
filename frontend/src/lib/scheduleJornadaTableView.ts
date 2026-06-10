import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ActivityType, Client } from '@shared/types';
import {
  DOCUMENT_TYPE_LABELS,
  getActivityTypeLabel,
  SHIFT_META,
  type ShiftCode,
} from '@shared/types';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import type { ScheduleJornadaRow } from '@/lib/scheduleJornadaRows';
import type { DisplayColumnDef } from '@/lib/viewConfig';
import type { TableViewColumnDef } from '@/lib/tableViews';

export const SCHEDULE_JORNADAS_VIEW_PAGE_KEY = 'schedule-jornadas';

export const SCHEDULE_JORNADA_DISPLAY_COLUMNS: DisplayColumnDef[] = [
  { id: 'date', label: 'Fecha', emoji: '📅', defaultWidth: 110, minWidth: 96 },
  { id: 'weekday', label: 'Día', emoji: '📆', defaultWidth: 72, minWidth: 60 },
  { id: 'shift', label: 'Turno', emoji: '⏰', defaultWidth: 120, minWidth: 100 },
  { id: 'hourRange', label: 'Rango horario', emoji: '🕐', defaultWidth: 130, minWidth: 110 },
  { id: 'hours', label: 'Horas', emoji: '⏱️', defaultWidth: 88, minWidth: 72, align: 'right' },
  {
    id: 'activityType',
    label: 'Tipo actividad',
    emoji: ACTIVITY_EMOJI,
    defaultWidth: 140,
    minWidth: 110,
  },
  {
    id: 'activityDescription',
    label: 'Descripción',
    emoji: '📝',
    defaultWidth: 180,
    minWidth: 120,
  },
  { id: 'client', label: 'Contacto', emoji: '👤', defaultWidth: 160, minWidth: 120 },
  { id: 'documents', label: 'Documentos', emoji: '📄', defaultWidth: 160, minWidth: 120 },
  { id: 'documentType', label: 'Tipo documento', emoji: '🗂️', defaultWidth: 130, minWidth: 100 },
  { id: 'activity', label: 'Actividad', emoji: ACTIVITY_EMOJI, defaultWidth: 110, minWidth: 90 },
];

export type ScheduleJornadaTableContext = {
  clientsMap: Map<string, Client>;
  activityTypes: ActivityType[];
};

export function buildScheduleJornadaTableColumns(): TableViewColumnDef<
  ScheduleJornadaRow,
  ScheduleJornadaTableContext
>[] {
  return [
    {
      id: 'date',
      label: 'Fecha',
      emoji: '📅',
      valueType: 'date',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.date,
      getGroupLabel: (key) => format(parseISO(key), 'd MMM yyyy', { locale: es }),
      getFilterValue: (row) => row.date,
    },
    {
      id: 'weekday',
      label: 'Día',
      emoji: '📆',
      valueType: 'text',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => format(parseISO(row.date), 'EEE', { locale: es }),
      getGroupLabel: (key) => key,
      getFilterValue: (row) => format(parseISO(row.date), 'EEE', { locale: es }),
    },
    {
      id: 'shift',
      label: 'Turno',
      emoji: '⏰',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.shift,
      getGroupLabel: (key) => SHIFT_META[key as ShiftCode]?.label ?? key,
      getFilterValue: (row) => row.shift,
      filterOptions: (['M', 'T', 'N', 'L', 'V'] as ShiftCode[]).map((code) => ({
        value: code,
        label: SHIFT_META[code].label,
      })),
    },
    {
      id: 'hourRange',
      label: 'Rango horario',
      emoji: '🕐',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.hourRange ?? '',
      getGroupLabel: (key) => key || '—',
      getFilterValue: (row) => row.hourRange ?? '',
    },
    {
      id: 'hours',
      label: 'Horas',
      emoji: '⏱️',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => String(row.hours),
      getGroupLabel: (key) => `${key} h`,
      getFilterValue: (row) => String(row.hours),
    },
    {
      id: 'activityType',
      label: 'Tipo actividad',
      emoji: ACTIVITY_EMOJI,
      valueType: 'text',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row, ctx) =>
        row.activity ? getActivityTypeLabel(row.activity.type, ctx.activityTypes) : '',
      getGroupLabel: (key) => key || 'Sin actividad',
      getFilterValue: (row, ctx) =>
        row.activity ? getActivityTypeLabel(row.activity.type, ctx.activityTypes) : '',
    },
    {
      id: 'activityDescription',
      label: 'Descripción',
      emoji: '📝',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.activity?.description?.trim() ?? '',
      getGroupLabel: (key) => key || '—',
      getFilterValue: (row) => row.activity?.description?.trim() ?? '',
    },
    {
      id: 'client',
      label: 'Contacto',
      emoji: '👤',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.activity?.clientId ?? '',
      getGroupLabel: (key, ctx) => ctx.clientsMap.get(key)?.name ?? '—',
      getFilterValue: (row) => row.activity?.clientId ?? '',
    },
    {
      id: 'documents',
      label: 'Documentos',
      emoji: '📄',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) => row.documents.map((doc) => doc.number).join(', '),
      getGroupLabel: (key) => key || '?',
      getFilterValue: (row) => row.documents.map((doc) => doc.number).join(' '),
    },
    {
      id: 'activity',
      label: 'Actividad',
      emoji: ACTIVITY_EMOJI,
      valueType: 'text',
      groupable: false,
      filterable: false,
      sortable: false,
      searchable: false,
      getGroupKey: (row) => row.activity?.id ?? '',
      getGroupLabel: (key) => key,
      getFilterValue: (row) => row.activity?.id ?? '',
    },
    {
      id: 'documentType',
      label: 'Tipo documento',
      emoji: '🗂️',
      valueType: 'text',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (row) =>
        row.documents.map((doc) => DOCUMENT_TYPE_LABELS[doc.type]).join(', '),
      getGroupLabel: (key) => key || '—',
      getFilterValue: (row) =>
        row.documents.map((doc) => DOCUMENT_TYPE_LABELS[doc.type]).join(' '),
    },
  ];
}
