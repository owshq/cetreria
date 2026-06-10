import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';

export function toScheduleDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function getSchedulePeriodRange(currentDate: Date): { from: string; to: string } {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  return { from: toScheduleDateKey(start), to: toScheduleDateKey(end) };
}

export function getScheduleDaysInView(currentDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
}

export function getScheduleSummaryDays(currentDate: Date): Array<{
  date: string;
  weekdayShort: string;
  inScope: boolean;
}> {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => ({
    date: toScheduleDateKey(day),
    weekdayShort: format(day, 'd', { locale: es }),
    inScope: isSameMonth(day, currentDate),
  }));
}

export function formatSchedulePeriodLabel(currentDate: Date): string {
  return format(currentDate, 'MMMM yyyy', { locale: es });
}

export function formatScheduleJornadasLabel(userName?: string): string {
  return userName ? `Jornadas de ${userName}` : 'Jornadas asignadas';
}
