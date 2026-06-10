import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, CalendarEvent, ShiftCode } from '@shared/types';
import {
  canAssignVacationShift,
  cycleShiftCode,
  listUserActivityEntriesOnDate,
  normalizeMaxVacationDays,
  resolveUserDayShiftDisplay,
  USER_DAY_SHIFT_LOCKED_MESSAGE,
  type UserDayActivityEntry,
} from '@shared/types';
import { scheduleHolidaysService, userSchedulesService } from '@/api';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { toScheduleDateKey } from '@/lib/schedulePeriod';
import { eachDayOfInterval, parseISO } from 'date-fns';

type UseCalendarAvailabilityOptions = {
  userId: string;
  enabled: boolean;
  rangeFrom: string;
  rangeTo: string;
  maxVacationDays?: number;
  activities: Activity[];
  events: CalendarEvent[];
};

export function useCalendarAvailability({
  userId,
  enabled,
  rangeFrom,
  rangeTo,
  maxVacationDays: maxVacationDaysProp,
  activities,
  events,
}: UseCalendarAvailabilityOptions) {
  const { boundaries } = useWorkspaceScheduleSettings();
  const maxVacationDays = normalizeMaxVacationDays(maxVacationDaysProp);

  const [entriesByDate, setEntriesByDate] = useState<Map<string, ShiftCode>>(new Map());
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rangeDays = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(rangeFrom),
        end: parseISO(rangeTo),
      });
    } catch {
      return [];
    }
  }, [rangeFrom, rangeTo]);

  const dayActivitiesByDate = useMemo(() => {
    const map = new Map<string, UserDayActivityEntry[]>();
    for (const day of rangeDays) {
      const dateKey = toScheduleDateKey(day);
      const entries = listUserActivityEntriesOnDate(
        activities,
        events,
        userId,
        dateKey,
        boundaries,
      );
      if (entries.length > 0) {
        map.set(dateKey, entries);
      }
    }
    return map;
  }, [rangeDays, activities, events, userId, boundaries]);

  const loadEntries = useCallback(async () => {
    if (!enabled || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const [entries, holidays] = await Promise.all([
        userSchedulesService.getRange(rangeFrom, rangeTo, userId),
        scheduleHolidaysService.getRange(rangeFrom, rangeTo),
      ]);
      const map = new Map<string, ShiftCode>();
      for (const entry of entries) {
        map.set(entry.date, entry.shift);
      }
      setEntriesByDate(map);
      setHolidayDates(new Set(holidays.map((h) => h.date)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad.');
    } finally {
      setLoading(false);
    }
  }, [enabled, userId, rangeFrom, rangeTo]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const persistShift = useCallback(
    async (date: string, shift: ShiftCode | null) => {
      if (shift === 'V') {
        const check = canAssignVacationShift(
          entriesByDate,
          date,
          maxVacationDays,
          entriesByDate.get(date) ?? null,
        );
        if (!check.ok) {
          setError(check.message);
          return;
        }
      }

      setSaving(true);
      setError(null);
      try {
        await userSchedulesService.saveBulk([{ userId, date, shift }]);
        setEntriesByDate((current) => {
          const next = new Map(current);
          if (shift) next.set(date, shift);
          else next.delete(date);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la disponibilidad.');
        void loadEntries();
      } finally {
        setSaving(false);
      }
    },
    [userId, loadEntries, entriesByDate, maxVacationDays],
  );

  const handleCycleShift = useCallback(
    (date: string) => {
      if (saving) return;
      const current = entriesByDate.get(date) ?? null;
      const display = resolveUserDayShiftDisplay(
        activities,
        events,
        userId,
        date,
        current,
        boundaries,
      );
      if (display.lockedByActivities) {
        setError(USER_DAY_SHIFT_LOCKED_MESSAGE);
        return;
      }
      const next = cycleShiftCode(current, { maxVacationDays });
      void persistShift(date, next);
    },
    [entriesByDate, maxVacationDays, persistShift, saving, activities, events, userId, boundaries],
  );

  return {
    entriesByDate,
    holidayDates,
    dayActivitiesByDate,
    loading,
    saving,
    error,
    handleCycleShift,
    reload: loadEntries,
  };
}
