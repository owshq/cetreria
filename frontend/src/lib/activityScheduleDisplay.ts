import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { activityEventSpanCrossesMidnight } from '@shared/types';
import { MISSING_VALUE, TIME_RANGE_SEPARATOR } from './textSeparators';

export type ActivityCalendarTimeRange = {
  startTime: string;
  endTime: string;
};

function parseActivityDate(activityDate: string): Date | null {
  const trimmed = activityDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = parseISO(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Etiqueta de fecha(s) del bloque de calendario. */
export function formatActivityCalendarDateRange(
  activityDate: string,
  range: ActivityCalendarTimeRange,
): string {
  const start = parseActivityDate(activityDate);
  if (!start) return MISSING_VALUE;

  if (!activityEventSpanCrossesMidnight(range)) {
    return format(start, "d 'de' MMMM yyyy", { locale: es });
  }

  const end = addDays(start, 1);
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = start.getMonth();

  if (startYear === endYear && startMonth === end.getMonth()) {
    return `${format(start, 'd', { locale: es })}${TIME_RANGE_SEPARATOR}${format(end, "d 'de' MMMM yyyy", { locale: es })}`;
  }
  if (startYear === endYear) {
    return `${format(start, "d 'de' MMMM", { locale: es })}${TIME_RANGE_SEPARATOR}${format(end, "d 'de' MMMM yyyy", { locale: es })}`;
  }
  return `${format(start, "d 'de' MMMM yyyy", { locale: es })}${TIME_RANGE_SEPARATOR}${format(end, "d 'de' MMMM yyyy", { locale: es })}`;
}

/** Etiqueta de horario del bloque de calendario, con fechas cuando cruza medianoche. */
export function formatActivityCalendarTimeRange(
  activityDate: string,
  range: ActivityCalendarTimeRange,
): string {
  if (!activityEventSpanCrossesMidnight(range)) {
    return `${range.startTime}${TIME_RANGE_SEPARATOR}${range.endTime}`;
  }

  const start = parseActivityDate(activityDate);
  if (!start) {
    return `${range.startTime}${TIME_RANGE_SEPARATOR}${range.endTime} (+1 dia)`;
  }

  const end = addDays(start, 1);
  const dateFmt = 'd MMM yyyy';
  const startLabel = `${format(start, dateFmt, { locale: es })} ${range.startTime}`;
  const endLabel = `${format(end, dateFmt, { locale: es })} ${range.endTime}`;
  return `${startLabel}${TIME_RANGE_SEPARATOR}${endLabel}`;
}
