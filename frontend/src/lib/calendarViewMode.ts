import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';

/** Vistas del calendario de actividades (incluye día). */
export type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

export const CALENDAR_VIEW_MODES: { id: CalendarViewMode; label: string; short: string }[] = [
  { id: 'day', label: 'Día', short: 'D' },
  { id: 'week', label: 'Semana', short: 'S' },
  { id: 'month', label: 'Mes', short: 'M' },
  { id: 'year', label: 'Año', short: 'A' },
];

const VIEW_MODE_IDS = CALENDAR_VIEW_MODES.map(({ id }) => id);

export function isCalendarViewMode(value: string): value is CalendarViewMode {
  return VIEW_MODE_IDS.includes(value as CalendarViewMode);
}

export function readStoredCalendarViewMode(): CalendarViewMode {
  const stored = readWorkspaceScopedStorage(storageKeys.calendarViewMode);
  if (stored && isCalendarViewMode(stored)) return stored;
  return 'month';
}

export function writeStoredCalendarViewMode(mode: CalendarViewMode): void {
  writeWorkspaceScopedStorage(mode, storageKeys.calendarViewMode);
}

export function getCalendarViewDateRange(
  anchorDate: Date,
  viewMode: CalendarViewMode,
): { start: Date; end: Date; from: string; to: string } {
  let start: Date;
  let end: Date;

  if (viewMode === 'year') {
    start = startOfYear(anchorDate);
    end = endOfYear(anchorDate);
  } else if (viewMode === 'month') {
    start = startOfMonth(anchorDate);
    end = endOfMonth(anchorDate);
  } else if (viewMode === 'week') {
    start = startOfWeek(anchorDate, { locale: es });
    end = endOfWeek(anchorDate, { locale: es });
  } else {
    start = startOfDay(anchorDate);
    end = endOfDay(anchorDate);
  }

  return {
    start,
    end,
    from: format(start, 'yyyy-MM-dd'),
    to: format(end, 'yyyy-MM-dd'),
  };
}
