import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import { es } from 'date-fns/locale';

export type DatePeriod = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export const DATE_PERIOD_LABELS: Record<DatePeriod, string> = {
  today: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  quarter: 'Trimestre',
  year: 'Año',
  custom: 'Custom',
};

/** Etiquetas cortas para filtros en pantallas pequeñas (custom usa símbolo en UI). */
export const DATE_PERIOD_LABELS_SHORT: Record<DatePeriod, string> = {
  today: 'H',
  week: 'S',
  month: 'M',
  quarter: 'T',
  year: 'A',
  custom: '',
};

export const DATE_PERIODS: DatePeriod[] = ['today', 'week', 'month', 'quarter', 'year', 'custom'];

export interface DateRange {
  from: string;
  to: string;
}

export function getDateRangeForPeriod(
  period: DatePeriod,
  customFrom?: string,
  customTo?: string,
  referenceDate = new Date(),
): DateRange {
  if (period === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  let start: Date;
  let end: Date;

  switch (period) {
    case 'today':
      start = startOfDay(referenceDate);
      end = endOfDay(referenceDate);
      break;
    case 'week':
      start = startOfWeek(referenceDate, { locale: es });
      end = endOfWeek(referenceDate, { locale: es });
      break;
    case 'month':
      start = startOfMonth(referenceDate);
      end = endOfMonth(referenceDate);
      break;
    case 'quarter':
      start = startOfQuarter(referenceDate);
      end = endOfQuarter(referenceDate);
      break;
    case 'year':
      start = startOfYear(referenceDate);
      end = endOfYear(referenceDate);
      break;
    default:
      start = startOfMonth(referenceDate);
      end = endOfMonth(referenceDate);
  }

  return {
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
  };
}

export function formatPeriodDisplayLabel(
  period: DatePeriod,
  from: string,
  to: string,
): string {
  const fromDate = parseISO(from);
  const toDate = parseISO(to);
  const fromLabel = format(fromDate, 'd MMM yyyy', { locale: es });
  const toLabel = format(toDate, 'd MMM yyyy', { locale: es });

  if (period === 'today') {
    return `${DATE_PERIOD_LABELS.today} · ${fromLabel} (24 h)`;
  }

  if (from === to) {
    return fromLabel;
  }

  return `${fromLabel} — ${toLabel}`;
}

export function isDateInRange(dateStr: string | undefined, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  return d >= from && d <= to;
}

/** Rango anterior de la misma duración (inclusive) que [from, to]. */
export function getPreviousDateRange(from: string, to: string): DateRange {
  const start = parseISO(from);
  const end = parseISO(to);
  const days = differenceInCalendarDays(end, start) + 1;
  const prevEnd = subDays(start, 1);
  const prevStart = subDays(prevEnd, days - 1);
  return {
    from: format(prevStart, 'yyyy-MM-dd'),
    to: format(prevEnd, 'yyyy-MM-dd'),
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export type MetricComparisonContext = {
  period: DatePeriod;
  from: string;
  to: string;
};

/** Referencia de comparación por tipo de periodo (custom se resuelve con fechas). */
export const DATE_PERIOD_COMPARISON: Record<
  Exclude<DatePeriod, 'custom'>,
  { reference: string; noData: string }
> = {
  today: { reference: 'ayer', noData: 'Sin datos de ayer' },
  week: { reference: 'semana pasada', noData: 'Sin datos de la semana pasada' },
  month: { reference: 'mes pasado', noData: 'Sin datos del mes pasado' },
  quarter: { reference: 'trimestre pasado', noData: 'Sin datos del trimestre pasado' },
  year: { reference: 'año pasado', noData: 'Sin datos del año pasado' },
};

export function getComparisonPeriodLabel(context: MetricComparisonContext): string {
  if (context.period === 'custom') {
    const previous = getPreviousDateRange(context.from, context.to);
    return formatPeriodDisplayLabel('custom', previous.from, previous.to);
  }
  return DATE_PERIOD_COMPARISON[context.period].reference;
}

export function getComparisonNoDataLabel(context: MetricComparisonContext): string {
  if (context.period === 'custom') {
    return `Sin datos de ${getComparisonPeriodLabel(context)}`;
  }
  return DATE_PERIOD_COMPARISON[context.period].noData;
}

export type MetricChangeTone = 'up' | 'down' | 'neutral';

export function formatMetricChangePercent(
  value: number | null | undefined,
  context: MetricComparisonContext,
): { text: string; tone: MetricChangeTone } {
  const comparison = getComparisonPeriodLabel(context);

  if (value == null) {
    return { text: getComparisonNoDataLabel(context), tone: 'neutral' };
  }
  if (value === 0) {
    return { text: `0% vs ${comparison}`, tone: 'neutral' };
  }
  return {
    text: `${value > 0 ? '+' : ''}${value}% vs ${comparison}`,
    tone: value > 0 ? 'up' : 'down',
  };
}
