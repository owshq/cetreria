import { useEffect } from 'react';
import { getMaxNestedScrollTop, resolveMainScrollWheelDecision } from '@/lib/nestedScroll';

const MIN_WHEEL_DELTA = 6;

type MainScrollWheelDelegationOptions = {
  enabled?: boolean;
  /** En movil, deja el gesto de ocultar topbar cuando todo esta arriba. */
  deferTopBarReveal?: boolean;
  topBarHidden?: boolean;
};

/**
 * Prioriza el scroll del viewport principal (`main`) cuando el puntero esta sobre
 * regiones anidadas (`data-scroll-secondary` o `data-scroll-region`).
 */
export function useMainScrollWheelDelegation(
  scrollRoot: HTMLElement | null,
  options: MainScrollWheelDelegationOptions = {},
) {
  const { enabled = true, deferTopBarReveal = false, topBarHidden = true } = options;

  useEffect(() => {
    if (!enabled || !scrollRoot) return;

    const handleWheel = (event: WheelEvent) => {
      if (document.documentElement.hasAttribute('data-popup-open')) return;

      if (deferTopBarReveal && !topBarHidden) {
        const atTop = scrollRoot.scrollTop <= 0 && getMaxNestedScrollTop(scrollRoot) <= 0;
        if (atTop && event.deltaY > MIN_WHEEL_DELTA) return;
      }

      const decision = resolveMainScrollWheelDecision(
        event.target,
        scrollRoot,
        event.deltaY,
        MIN_WHEEL_DELTA,
      );

      if (decision.action === 'ignore' || decision.action === 'default') {
        return;
      }

      event.preventDefault();
      decision.target.scrollTop += decision.deltaY;
    };

    document.addEventListener('wheel', handleWheel, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [deferTopBarReveal, enabled, scrollRoot, topBarHidden]);
}
