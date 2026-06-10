import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

export const CALENDAR_SCROLL_BATCH_SIZE = 6;
const LOAD_EDGE_THRESHOLD_PX = 320;

export function computeCalendarScrollRange(
  anchorIndex: number,
  total: number,
  batchSize = CALENDAR_SCROLL_BATCH_SIZE,
): { start: number; end: number } {
  if (total <= 0) return { start: 0, end: 0 };
  if (total <= batchSize) return { start: 0, end: total };

  const half = Math.floor(batchSize / 2);
  let start = Math.max(0, anchorIndex - half);
  let end = start + batchSize;
  if (end > total) {
    end = total;
    start = Math.max(0, end - batchSize);
  }
  return { start, end };
}

type UseCalendarScrollBatchOptions = {
  enabled: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  allPeriods: Date[];
  periodKeyForDate: (date: Date) => string;
  anchorDate: Date;
};

export function useCalendarScrollBatch({
  enabled,
  scrollRootRef,
  allPeriods,
  periodKeyForDate,
  anchorDate,
}: UseCalendarScrollBatchOptions) {
  const anchorKey = periodKeyForDate(anchorDate);
  const anchorIndex = useMemo(
    () => allPeriods.findIndex((period) => periodKeyForDate(period) === anchorKey),
    [allPeriods, anchorKey, periodKeyForDate],
  );

  const [range, setRange] = useState(() =>
    computeCalendarScrollRange(Math.max(0, anchorIndex), allPeriods.length),
  );

  const prependScrollHeightRef = useRef<number | null>(null);
  const edgeLoadLockRef = useRef(false);

  const periodsSignature = useMemo(
    () =>
      allPeriods.length > 0
        ? `${allPeriods.length}:${periodKeyForDate(allPeriods[0])}:${periodKeyForDate(allPeriods[allPeriods.length - 1])}`
        : 'empty',
    [allPeriods, periodKeyForDate],
  );

  useEffect(() => {
    if (!enabled) return;
    const idx = anchorIndex >= 0 ? anchorIndex : 0;
    setRange(computeCalendarScrollRange(idx, allPeriods.length));
  }, [enabled, periodsSignature]);

  useEffect(() => {
    if (!enabled || anchorIndex < 0) return;
    setRange((prev) => {
      if (anchorIndex >= prev.start && anchorIndex < prev.end) return prev;
      return computeCalendarScrollRange(anchorIndex, allPeriods.length);
    });
  }, [enabled, anchorIndex, allPeriods.length]);

  const visiblePeriods = useMemo(
    () => allPeriods.slice(range.start, range.end),
    [allPeriods, range.start, range.end],
  );

  const expandEarlier = useCallback(() => {
    setRange((prev) => {
      if (prev.start <= 0) return prev;
      const root = scrollRootRef.current;
      if (root) prependScrollHeightRef.current = root.scrollHeight;
      return {
        start: Math.max(0, prev.start - CALENDAR_SCROLL_BATCH_SIZE),
        end: prev.end,
      };
    });
  }, [scrollRootRef]);

  const expandLater = useCallback(() => {
    setRange((prev) => {
      if (prev.end >= allPeriods.length) return prev;
      return {
        start: prev.start,
        end: Math.min(allPeriods.length, prev.end + CALENDAR_SCROLL_BATCH_SIZE),
      };
    });
  }, [allPeriods.length]);

  useLayoutEffect(() => {
    const root = scrollRootRef.current;
    const heightBefore = prependScrollHeightRef.current;
    if (!root || heightBefore == null) return;

    root.scrollTop += root.scrollHeight - heightBefore;
    prependScrollHeightRef.current = null;
  }, [range.start, scrollRootRef]);

  useEffect(() => {
    if (!enabled) return;

    const root = scrollRootRef.current;
    if (!root) return;

    let frame = 0;

    const tryEdgeLoad = () => {
      if (edgeLoadLockRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = root;
      const nearTop = scrollTop < LOAD_EDGE_THRESHOLD_PX;
      const nearBottom = scrollTop + clientHeight > scrollHeight - LOAD_EDGE_THRESHOLD_PX;

      if (!nearTop && !nearBottom) return;

      edgeLoadLockRef.current = true;

      if (nearTop) expandEarlier();
      else expandLater();

      window.setTimeout(() => {
        edgeLoadLockRef.current = false;
      }, 120);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tryEdgeLoad);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', onScroll);
    };
  }, [enabled, scrollRootRef, expandEarlier, expandLater, range.start, range.end]);

  return {
    visiblePeriods,
    rangeStart: range.start,
    allPeriodKeys: useMemo(
      () => allPeriods.map((period) => periodKeyForDate(period)),
      [allPeriods, periodKeyForDate],
    ),
    visiblePeriodKeys: useMemo(
      () => visiblePeriods.map((period) => periodKeyForDate(period)),
      [visiblePeriods, periodKeyForDate],
    ),
  };
}
