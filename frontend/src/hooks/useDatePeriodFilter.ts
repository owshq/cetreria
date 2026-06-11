import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { format } from 'date-fns';
import {
  DATE_PERIODS,
  type DatePeriod,
  getDateRangeForPeriod,
} from '@shared/types';

import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';

import { storageKeys } from '@/lib/storageKeys';

export const DATE_PERIOD_FILTER_STORAGE_KEY = storageKeys.dashboardPeriod;
export const REPORTS_PERIOD_FILTER_STORAGE_KEY = storageKeys.reportsPeriod;

export type DatePeriodPrefs = {
  period: DatePeriod;
  customFrom: string;
  customTo: string;
  filtersScrollLeft: number;
};

function isDatePeriod(value: unknown): value is DatePeriod {
  return typeof value === 'string' && (DATE_PERIODS as readonly string[]).includes(value);
}

function readDatePeriodPrefs(storageKey: string): DatePeriodPrefs | null {
  try {
    const raw = readWorkspaceScopedStorage(storageKey);
    if (!raw) return null;

    const data = JSON.parse(raw) as Partial<DatePeriodPrefs>;
    if (data.period == null || !isDatePeriod(data.period)) return null;

    const today = format(new Date(), 'yyyy-MM-dd');
    return {
      period: data.period,
      customFrom: typeof data.customFrom === 'string' ? data.customFrom : today,
      customTo: typeof data.customTo === 'string' ? data.customTo : today,
      filtersScrollLeft:
        typeof data.filtersScrollLeft === 'number' ? data.filtersScrollLeft : 0,
    };
  } catch {
    return null;
  }
}

function writeDatePeriodPrefs(storageKey: string, prefs: DatePeriodPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKey);
}

export type DatePeriodFilterBindings = {
  period: DatePeriod;
  setPeriod: (period: DatePeriod) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  dateRange: ReturnType<typeof getDateRangeForPeriod>;
  periodFiltersRef: RefObject<HTMLDivElement | null>;
  invalidCustomRange: boolean;
};

function readInitialPrefs(storageKey: string): DatePeriodPrefs | null {
  return readDatePeriodPrefs(storageKey);
}

export function useDatePeriodFilter(
  storageKey: string = DATE_PERIOD_FILTER_STORAGE_KEY,
) {
  const savedPrefs = useMemo(() => readInitialPrefs(storageKey), [storageKey]);
  const periodFiltersRef = useRef<HTMLDivElement>(null);

  const [period, setPeriod] = useState<DatePeriod>(
    () => readInitialPrefs(storageKey)?.period ?? 'month',
  );
  const [customFrom, setCustomFrom] = useState(
    () => readInitialPrefs(storageKey)?.customFrom ?? format(new Date(), 'yyyy-MM-dd'),
  );
  const [customTo, setCustomTo] = useState(
    () => readInitialPrefs(storageKey)?.customTo ?? format(new Date(), 'yyyy-MM-dd'),
  );

  const persistPeriodPrefs = useCallback(
    (scrollLeft?: number) => {
      writeDatePeriodPrefs(storageKey, {
        period,
        customFrom,
        customTo,
        filtersScrollLeft: scrollLeft ?? periodFiltersRef.current?.scrollLeft ?? 0,
      });
    },
    [storageKey, period, customFrom, customTo],
  );

  useEffect(() => {
    persistPeriodPrefs();
  }, [persistPeriodPrefs]);

  useLayoutEffect(() => {
    const el = periodFiltersRef.current;
    const scrollLeft = savedPrefs?.filtersScrollLeft ?? 0;
    if (el && scrollLeft > 0) {
      el.scrollLeft = scrollLeft;
    }
  }, [savedPrefs?.filtersScrollLeft]);

  useEffect(() => {
    const el = periodFiltersRef.current;
    if (!el) return;

    const onScroll = () => persistPeriodPrefs(el.scrollLeft);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [persistPeriodPrefs]);

  const setPeriodWithSeed = useCallback(
    (next: DatePeriod) => {
      if (next === 'custom' && period !== 'custom') {
        const range = getDateRangeForPeriod(period, customFrom, customTo);
        setCustomFrom(range.from);
        setCustomTo(range.to);
      }
      setPeriod(next);
    },
    [period, customFrom, customTo],
  );

  const dateRange = useMemo(
    () => getDateRangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const invalidCustomRange = period === 'custom' && customFrom > customTo;

  return {
    period,
    setPeriod: setPeriodWithSeed,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateRange,
    periodFiltersRef,
    invalidCustomRange,
  };
}
