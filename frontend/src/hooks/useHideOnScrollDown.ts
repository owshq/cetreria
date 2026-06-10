import { useCallback, useEffect, useRef, useState } from 'react';
import { useTopBarVisibility } from '@/context/TopBarVisibilityContext';
import { getMaxNestedScrollTop, isWithinScrollRoot } from '@/lib/nestedScroll';

const DEFAULT_SCROLL_THRESHOLD = 8;
const WHEEL_TOGGLE_THRESHOLD = 80;
const WHEEL_ACCUMULATOR_RESET_MS = 220;
const MIN_WHEEL_DELTA = 6;

export function useHideOnScrollDown(
  enabled = true,
  scrollThreshold = DEFAULT_SCROLL_THRESHOLD,
): [(node: HTMLElement | null) => void, boolean] {
  const [hidden, setHidden] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const hiddenRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const wheelAccumulatorRef = useRef(0);
  const wheelAccumulatorTimerRef = useRef<number | null>(null);
  const { isHidden: topBarHidden } = useTopBarVisibility();

  const containerRef = useCallback((node: HTMLElement | null) => {
    setContainer(node);
  }, []);

  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  useEffect(() => {
    if (!enabled || !container) {
      setHidden(false);
      return;
    }

    lastScrollTopRef.current = getMaxNestedScrollTop(container);

    const resetWheelAccumulator = () => {
      wheelAccumulatorRef.current = 0;
      if (wheelAccumulatorTimerRef.current !== null) {
        window.clearTimeout(wheelAccumulatorTimerRef.current);
        wheelAccumulatorTimerRef.current = null;
      }
    };

    const updateHidden = (value: boolean) => {
      if (hiddenRef.current === value) return;
      hiddenRef.current = value;
      wheelAccumulatorRef.current = 0;
      setHidden(value);
    };

    const bumpWheelAccumulator = (delta: number) => {
      wheelAccumulatorRef.current += delta;
      if (wheelAccumulatorTimerRef.current !== null) {
        window.clearTimeout(wheelAccumulatorTimerRef.current);
      }
      wheelAccumulatorTimerRef.current = window.setTimeout(() => {
        wheelAccumulatorTimerRef.current = null;
        wheelAccumulatorRef.current = 0;
      }, WHEEL_ACCUMULATOR_RESET_MS);
    };

    const handleScroll = (event: Event) => {
      if (document.documentElement.hasAttribute('data-popup-open')) return;
      if (!isWithinScrollRoot(event.target, container)) return;

      const currentScrollTop = getMaxNestedScrollTop(container);
      const delta = currentScrollTop - lastScrollTopRef.current;

      if (currentScrollTop <= 0) {
        updateHidden(false);
      } else if (delta > scrollThreshold) {
        updateHidden(true);
      } else if (delta < -scrollThreshold) {
        updateHidden(false);
      }

      lastScrollTopRef.current = currentScrollTop;
    };

    const handleWheel = (event: WheelEvent) => {
      if (document.documentElement.hasAttribute('data-popup-open')) return;
      if (!topBarHidden) return;
      if (!isWithinScrollRoot(event.target, container)) return;

      const deltaY = event.deltaY;
      if (Math.abs(deltaY) < MIN_WHEEL_DELTA) return;

      const atTop = getMaxNestedScrollTop(container) <= 0;

      if (!hiddenRef.current) {
        if (!atTop || deltaY <= 0) {
          resetWheelAccumulator();
          return;
        }

        event.preventDefault();
        bumpWheelAccumulator(deltaY);
        if (wheelAccumulatorRef.current >= WHEEL_TOGGLE_THRESHOLD) {
          resetWheelAccumulator();
          updateHidden(true);
        }
        return;
      }

      if (!atTop || deltaY >= 0) {
        resetWheelAccumulator();
        return;
      }

      event.preventDefault();
      bumpWheelAccumulator(Math.abs(deltaY));
      if (wheelAccumulatorRef.current >= WHEEL_TOGGLE_THRESHOLD) {
        resetWheelAccumulator();
        updateHidden(false);
      }
    };

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });

    return () => {
      resetWheelAccumulator();
      document.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [container, enabled, scrollThreshold, topBarHidden]);

  return [containerRef, hidden];
}
