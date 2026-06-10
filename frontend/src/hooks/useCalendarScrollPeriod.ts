import { useCallback, useEffect, useRef, type RefObject } from 'react';

type UseCalendarScrollPeriodOptions = {
  enabled: boolean;
  scrollRootRef: RefObject<HTMLElement | null>;
  periodKeys: string[];
  anchorKey: string;
  onVisiblePeriod: (key: string) => void;
};

function resolveVisiblePeriodKey(
  root: HTMLElement,
  sections: Map<string, HTMLElement>,
): string | null {
  const rootRect = root.getBoundingClientRect();
  const viewportCenter = rootRect.top + rootRect.height / 2;

  let bestKey: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  sections.forEach((element, key) => {
    const rect = element.getBoundingClientRect();
    const sectionCenter = rect.top + rect.height / 2;
    const distance = Math.abs(sectionCenter - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = key;
    }
  });

  return bestKey;
}

export function useCalendarScrollPeriod({
  enabled,
  scrollRootRef,
  periodKeys,
  anchorKey,
  onVisiblePeriod,
}: UseCalendarScrollPeriodOptions) {
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const programmaticScrollRef = useRef(false);
  const onVisiblePeriodRef = useRef(onVisiblePeriod);
  const lastVisibleKeyRef = useRef<string | null>(null);

  onVisiblePeriodRef.current = onVisiblePeriod;

  const registerSection = useCallback((key: string, node: HTMLElement | null) => {
    if (node) sectionRefs.current.set(key, node);
    else sectionRefs.current.delete(key);
  }, []);

  const syncVisiblePeriod = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root || programmaticScrollRef.current) return;

    const key = resolveVisiblePeriodKey(root, sectionRefs.current);
    if (!key || key === lastVisibleKeyRef.current) return;

    lastVisibleKeyRef.current = key;
    onVisiblePeriodRef.current(key);
  }, [scrollRootRef]);

  useEffect(() => {
    if (!enabled) return;

    const root = scrollRootRef.current;
    if (!root) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncVisiblePeriod);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    frame = requestAnimationFrame(syncVisiblePeriod);

    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener('scroll', onScroll);
    };
  }, [enabled, scrollRootRef, periodKeys, syncVisiblePeriod]);

  useEffect(() => {
    if (!enabled) return;

    const target = sectionRefs.current.get(anchorKey);
    if (!target) return;

    programmaticScrollRef.current = true;
    lastVisibleKeyRef.current = anchorKey;
    target.scrollIntoView({ block: 'start' });
    const timer = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      syncVisiblePeriod();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [enabled, anchorKey, periodKeys, syncVisiblePeriod]);

  return { registerSection };
}
