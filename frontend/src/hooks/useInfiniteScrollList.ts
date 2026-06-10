import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';

export const INFINITE_SCROLL_BATCH_SIZE = 25;

function resolveBatchSize(batchSize?: number) {
  return batchSize ?? INFINITE_SCROLL_BATCH_SIZE;
}

function safeVisibleCount(value: number, batch: number) {
  return Number.isFinite(value) && value > 0 ? value : batch;
}

export function useInfiniteScrollList<T>(
  items: T[],
  resetDeps: unknown[] = [],
  batchSize?: number,
  scrollRootRef?: RefObject<Element | null>,
) {
  const batch = resolveBatchSize(batchSize);
  const [visibleCount, setVisibleCount] = useState(batch);
  const [scrollRootEl, setScrollRootEl] = useState<Element | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(batch);
  }, [batch, ...resetDeps]);

  useLayoutEffect(() => {
    const root = scrollRootRef?.current ?? null;
    setScrollRootEl(root);
    if (!root) return;

    const resizeObserver = new ResizeObserver(() => {
      setScrollRootEl(root);
    });
    resizeObserver.observe(root);
    return () => resizeObserver.disconnect();
  }, [scrollRootRef, ...resetDeps]);

  const totalItems = items.length;
  const visibleItems = useMemo(
    () => items.slice(0, safeVisibleCount(visibleCount, batch)),
    [items, visibleCount, batch],
  );
  const hasMore = safeVisibleCount(visibleCount, batch) < totalItems;

  useLayoutEffect(() => {
    const root = scrollRootEl ?? scrollRootRef?.current ?? null;
    if (!root || totalItems === 0) return;

    const { clientHeight, scrollHeight } = root;
    if (clientHeight <= 0) return;
    if (scrollHeight <= clientHeight + 4) {
      setVisibleCount((current) => {
        const safe = safeVisibleCount(current, batch);
        return safe < totalItems ? totalItems : safe;
      });
    }
  }, [scrollRootEl, totalItems, batch, scrollRootRef]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const root = scrollRootEl ?? scrollRootRef?.current ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => {
            const safeCurrent = safeVisibleCount(current, batch);
            return Math.min(safeCurrent + batch, totalItems);
          });
        }
      },
      { root, rootMargin: '120px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, batch, totalItems, scrollRootEl, ...resetDeps]);

  return {
    visibleItems,
    sentinelRef,
    hasMore,
    totalItems,
  };
}
