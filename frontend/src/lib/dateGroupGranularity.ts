import {
  format,
  getQuarter,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';

export type DateGroupGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export const DATE_GROUP_GRANULARITY_OPTIONS: {
  value: DateGroupGranularity;
  label: string;
  emoji: string;
}[] = [
  { value: 'day', label: 'Día', emoji: '📅' },
  { value: 'week', label: 'Semana', emoji: '📆' },
  { value: 'month', label: 'Mes', emoji: '🗓️' },
  { value: 'quarter', label: 'Trimestre', emoji: '📊' },
  { value: 'year', label: 'Año', emoji: '📅' },
];

const VALID_GRANULARITIES = new Set<DateGroupGranularity>(
  DATE_GROUP_GRANULARITY_OPTIONS.map((option) => option.value),
);

export function normalizeDateGroupGranularity(
  value: unknown,
  fallback: DateGroupGranularity = 'day',
): DateGroupGranularity {
  if (typeof value === 'string' && VALID_GRANULARITIES.has(value as DateGroupGranularity)) {
    return value as DateGroupGranularity;
  }
  return fallback;
}

export function getDateGroupKey(
  isoDate: string,
  granularity: DateGroupGranularity,
): string {
  const parsed = parseISO(isoDate);
  switch (granularity) {
    case 'day':
      return format(parsed, 'yyyy-MM-dd');
    case 'week':
      return format(startOfWeek(parsed, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    case 'month':
      return format(parsed, 'yyyy-MM');
    case 'quarter':
      return `${format(parsed, 'yyyy')}-Q${getQuarter(parsed)}`;
    case 'year':
      return format(parsed, 'yyyy');
    default:
      return format(parsed, 'yyyy-MM-dd');
  }
}

export function getDateGroupLabel(
  key: string,
  granularity: DateGroupGranularity,
): string {
  switch (granularity) {
    case 'day':
      return format(parseISO(key), 'd MMM yyyy', { locale: es });
    case 'week':
      return `Semana del ${format(parseISO(key), 'd MMM yyyy', { locale: es })}`;
    case 'month': {
      const [year, month] = key.split('-').map(Number);
      return format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: es });
    }
    case 'quarter': {
      const [yearPart, quarterPart] = key.split('-Q');
      const year = Number(yearPart);
      const quarter = Number(quarterPart);
      return `T${quarter} ${year}`;
    }
    case 'year':
      return key;
    default:
      return key;
  }
}

export function compareDateGroupKeys(a: string, b: string): number {
  return a.localeCompare(b, 'es');
}
