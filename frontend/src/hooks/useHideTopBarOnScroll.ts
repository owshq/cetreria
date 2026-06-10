import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { readLocalStorageFor, writeLocalStorageFor } from '@/lib/storageKeys';

export function readTopBarHiddenPreference(): boolean {
  try {
    return readLocalStorageFor('topBarHidden') === '1';
  } catch {
    return false;
  }
}

function writeTopBarHiddenPreference(hidden: boolean): void {
  try {
    writeLocalStorageFor('topBarHidden', hidden ? '1' : '0');
  } catch {
    // Ignore quota / private mode errors.
  }
}

const TOPBAR_SHELL_SELECTOR = '[data-topbar-shell]';
const SCROLL_IGNORE_SELECTOR = '[data-scroll-ignore-topbar]';
const WHEEL_TOGGLE_THRESHOLD = 140;
const WHEEL_ACCUMULATOR_RESET_MS = 220;
const MIN_WHEEL_DELTA = 6;

function shouldIgnoreElement(element: HTMLElement): boolean {
  if (element.closest(TOPBAR_SHELL_SELECTOR)) return true;
  if (element.closest(SCROLL_IGNORE_SELECTOR)) return true;
  return false;
}

function isScrollableElement(element: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(element);
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') {
    return false;
  }
  return element.scrollHeight > element.clientHeight + 1;
}

function getMaxNestedScrollTop(scrollRoot: HTMLElement): number {
  let maxScrollTop = 0;

  const visit = (element: HTMLElement) => {
    if (shouldIgnoreElement(element)) return;
    if (element !== scrollRoot && isScrollableElement(element)) {
      maxScrollTop = Math.max(maxScrollTop, element.scrollTop);
    }
    for (const child of element.children) {
      if (child instanceof HTMLElement) visit(child);
    }
  };

  visit(scrollRoot);
  return maxScrollTop;
}

function clampAllScrollTops(scrollRoot: HTMLElement) {
  scrollRoot.scrollTop = 0;

  const visit = (element: HTMLElement) => {
    if (shouldIgnoreElement(element)) return;
    if (element !== scrollRoot && isScrollableElement(element)) {
      element.scrollTop = 0;
    }
    for (const child of element.children) {
      if (child instanceof HTMLElement) visit(child);
    }
  };

  visit(scrollRoot);
}

function isWithinScrollRoot(target: EventTarget | null, scrollRoot: HTMLElement): boolean {
  return target instanceof Node && (target === scrollRoot || scrollRoot.contains(target));
}

function shouldIgnoreEventTarget(target: EventTarget | null): boolean {
  return !(target instanceof HTMLElement) || shouldIgnoreElement(target);
}

function isEverythingAtTop(scrollRoot: HTMLElement): boolean {
  return scrollRoot.scrollTop <= 0 && getMaxNestedScrollTop(scrollRoot) <= 0;
}

function setTopBarHidden(layout: HTMLElement | null, hidden: boolean) {
  if (!layout) return;
  if (hidden) {
    layout.setAttribute('data-topbar-hidden', '');
  } else {
    layout.removeAttribute('data-topbar-hidden');
  }
}

export function useHideTopBarOnScroll(
  scrollRoot: HTMLElement | null,
  layoutRef: RefObject<HTMLElement | null>,
  resetKey?: string,
  onHiddenChange?: (hidden: boolean) => void,
  enabled = true,
) {
  const hiddenRef = useRef(readTopBarHiddenPreference());
  const onHiddenChangeRef = useRef(onHiddenChange);

  useEffect(() => {
    onHiddenChangeRef.current = onHiddenChange;
  }, [onHiddenChange]);
  const wheelAccumulatorRef = useRef(0);
  const wheelAccumulatorTimerRef = useRef<number | null>(null);

  const updateHidden = (value: boolean) => {
    if (hiddenRef.current === value) return;
    hiddenRef.current = value;
    wheelAccumulatorRef.current = 0;
    setTopBarHidden(layoutRef.current, value);
    onHiddenChangeRef.current?.(value);
  };

  const resetWheelAccumulator = () => {
    wheelAccumulatorRef.current = 0;
    if (wheelAccumulatorTimerRef.current !== null) {
      window.clearTimeout(wheelAccumulatorTimerRef.current);
      wheelAccumulatorTimerRef.current = null;
    }
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

  useLayoutEffect(() => {
    if (!enabled) return;
    const hidden = readTopBarHiddenPreference();
    hiddenRef.current = hidden;
    resetWheelAccumulator();
    setTopBarHidden(layoutRef.current, hidden);
    onHiddenChangeRef.current?.(hidden);
  }, [resetKey, layoutRef, enabled]);

  useEffect(() => {
    if (!enabled || !scrollRoot) return;

    const handleScroll = (event: Event) => {
      if (document.documentElement.hasAttribute('data-popup-open')) return;
      if (!isWithinScrollRoot(event.target, scrollRoot)) return;
      if (shouldIgnoreEventTarget(event.target)) return;
      if (hiddenRef.current) return;

      if (scrollRoot.scrollTop > 0 || getMaxNestedScrollTop(scrollRoot) > 0) {
        clampAllScrollTops(scrollRoot);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (document.documentElement.hasAttribute('data-popup-open')) return;
      if (!isWithinScrollRoot(event.target, scrollRoot)) return;
      if (shouldIgnoreEventTarget(event.target)) return;

      const deltaY = event.deltaY;
      if (Math.abs(deltaY) < MIN_WHEEL_DELTA) return;

      const atTop = isEverythingAtTop(scrollRoot);

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
  }, [scrollRoot, resetKey, layoutRef, enabled]);
}
