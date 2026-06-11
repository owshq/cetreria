import {
  COMPACT_TIME_RANGE_SEPARATOR,
  META_SEPARATOR,
} from './textSeparators';

export const ACTIVITY_SCHEDULE_HOURS_TOOLTIP =
  'Las horas se suman por operario. El calendario muestra una sola franja, del inicio mas temprano al fin mas tarde.';

export function activityScheduleHoursExceedsCalendarSpan(
  totalHours: number,
  calendarSpanHours: number,
): boolean {
  return totalHours > calendarSpanHours + 0.001;
}

export function formatActivityScheduleHoursLabel(
  totalHours: number,
  calendarSpanHours: number,
  formatHours: (hours: number) => string,
): { label: string; title?: string } {
  const total = formatHours(totalHours);
  if (activityScheduleHoursExceedsCalendarSpan(totalHours, calendarSpanHours)) {
    const span = formatHours(calendarSpanHours);
    return {
      label: `${total}h sumadas por operarios${META_SEPARATOR}bloque calendario ${span}h`,
      title: ACTIVITY_SCHEDULE_HOURS_TOOLTIP,
    };
  }
  return { label: `${total}h totales` };
}

export function formatActivityScheduleEditHint(
  totalHours: number,
  calendarSpanHours: number,
  range: { startTime: string; endTime: string },
  crossesMidnight: boolean,
  formatHours: (hours: number) => string,
): { title?: string; suffix: string } {
  const midnightSuffix = crossesMidnight ? ' (+1 dia)' : '';
  const rangeLabel = `${range.startTime}${COMPACT_TIME_RANGE_SEPARATOR}${range.endTime}${midnightSuffix}`;

  if (activityScheduleHoursExceedsCalendarSpan(totalHours, calendarSpanHours)) {
    const span = formatHours(calendarSpanHours);
    return {
      suffix: ` sumadas por operarios${META_SEPARATOR}calendario ${rangeLabel} (bloque ${span} h)`,
      title: ACTIVITY_SCHEDULE_HOURS_TOOLTIP,
    };
  }

  return { suffix: ` totales${META_SEPARATOR}calendario ${rangeLabel}` };
}
