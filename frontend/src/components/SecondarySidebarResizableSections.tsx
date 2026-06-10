import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useSecondarySidebarLayout } from '@/context/SecondarySidebarLayoutContext';
import { cx } from '@/lib/cx';
import { useSecondarySidebarSectionHeights } from '@/hooks/useSecondarySidebarSectionHeights';
import {
  applyDividerDrag,
  buildDefaultHeights,
  fitHeightsToContainer,
  type SecondarySidebarSectionSpec,
} from '@/lib/secondarySidebarSectionSizes';
import styles from './SecondarySidebarResizableSections.module.css';

export type SecondarySidebarResizableSection = SecondarySidebarSectionSpec & {
  children: ReactNode;
};

type SecondarySidebarResizableSectionsProps = {
  storageKey: string;
  className?: string;
  sections: SecondarySidebarResizableSection[];
};

export default function SecondarySidebarResizableSections({
  storageKey,
  className,
  sections,
}: SecondarySidebarResizableSectionsProps) {
  const layout = useSecondarySidebarLayout();
  const containerRef = useRef<HTMLDivElement>(null);
  const paneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const draggingRef = useRef(false);
  const resizeFrameRef = useRef(0);
  const userAdjustedRef = useRef(false);
  const [heights, setHeights] = useState<number[]>([]);
  const [draggingDivider, setDraggingDivider] = useState<number | null>(null);
  const sectionConfigKey = sections
    .map((section) => `${section.id}:${section.minHeight ?? ''}:${section.maxHeight ?? ''}`)
    .join('|');

  const specs = useMemo(
    () =>
      sections.map(({ id, minHeight, maxHeight }) => ({
        id,
        minHeight,
        maxHeight,
      })),
    [sectionConfigKey, sections],
  );

  const resizable = sections.length > 1;
  const { hydrated, storageRevision, storedHeightsRef, skipNextPersistRef, persistHeights } =
    useSecondarySidebarSectionHeights(storageKey, specs, resizable);

  const applyPaneHeights = useCallback(
    (nextHeights: number[]) => {
      sections.forEach((_, index) => {
        const pane = paneRefs.current[index];
        if (!pane) return;

        const isLast = index === sections.length - 1;
        if (isLast) {
          pane.style.height = '';
          pane.style.flexShrink = '';
          return;
        }

        const height = nextHeights[index];
        if (height == null) return;
        pane.style.height = `${height}px`;
        pane.style.flexShrink = '0';
      });
    },
    [sections],
  );

  const syncHeights = useCallback(
    (containerHeight: number) => {
      if (!resizable) {
        setHeights([]);
        return;
      }

      const stored = storedHeightsRef.current;
      const base =
        stored && stored.length > 0
          ? stored
          : buildDefaultHeights(specs, containerHeight);
      const fitted = fitHeightsToContainer(base, specs, containerHeight);
      storedHeightsRef.current = fitted;
      setHeights(fitted);
    },
    [resizable, specs, storedHeightsRef],
  );

  useLayoutEffect(() => {
    if (!draggingRef.current) {
      applyPaneHeights(heights);
    }
  }, [applyPaneHeights, heights]);

  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node || !resizable || !hydrated) return;

    syncHeights(node.clientHeight);

    const observer = new ResizeObserver(() => {
      if (draggingRef.current || layout?.resizing) return;

      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container || draggingRef.current || layout?.resizing) return;

        const nextHeight = container.clientHeight;
        setHeights((current) => {
          const fitted = fitHeightsToContainer(current, specs, nextHeight);
          storedHeightsRef.current = fitted;
          return fitted;
        });
      });
    });

    observer.observe(node);
    return () => {
      cancelAnimationFrame(resizeFrameRef.current);
      observer.disconnect();
    };
  }, [layout?.resizing, resizable, specs, hydrated, storageRevision, syncHeights, storedHeightsRef]);

  useEffect(() => {
    if (!hydrated || !resizable || draggingRef.current || !userAdjustedRef.current) return;

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      persistHeights(heights);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [heights, hydrated, resizable, persistHeights, skipNextPersistRef]);

  const handleDividerPointerDown = (dividerIndex: number) => (event: React.PointerEvent) => {
    event.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const startY = event.clientY;
    const startHeights = heights;
    const target = event.currentTarget as HTMLDivElement;
    target.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    userAdjustedRef.current = true;
    setDraggingDivider(dividerIndex);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const next = applyDividerDrag(
        dividerIndex,
        deltaY,
        startHeights,
        specs,
        container.clientHeight,
      );
      storedHeightsRef.current = next;
      applyPaneHeights(next);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerUp);
      draggingRef.current = false;
      setDraggingDivider(null);
      const fitted = fitHeightsToContainer(
        storedHeightsRef.current ?? startHeights,
        specs,
        container.clientHeight,
      );
      storedHeightsRef.current = fitted;
      setHeights(fitted);
      persistHeights(fitted);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerUp);
  };

  if (sections.length === 0) return null;

  if (sections.length === 1) {
    const only = sections[0]!;
    return (
      <div ref={containerRef} className={cx(styles.root, className)}>
        <div className={styles.sectionGrow}>
          <div className={styles.sectionBody}>{only.children}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cx(styles.root, className)}>
      {sections.map((section, index) => {
        const isLast = index === sections.length - 1;
        const paneClass = isLast ? styles.sectionGrow : styles.section;
        const paneStyle: CSSProperties | undefined =
          !isLast && heights[index] != null
            ? { height: heights[index], flexShrink: 0 }
            : undefined;

        return (
          <div key={section.id}>
            <div
              ref={(node) => {
                paneRefs.current[index] = node;
              }}
              className={paneClass}
              style={paneStyle}
            >
              <div className={styles.sectionBody}>{section.children}</div>
            </div>
            {!isLast ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Redimensionar sección"
                tabIndex={0}
                className={styles.divider}
                data-dragging={draggingDivider === index ? '' : undefined}
                onPointerDown={handleDividerPointerDown(index)}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key !== 'ArrowUp' && keyEvent.key !== 'ArrowDown') return;
                  keyEvent.preventDefault();
                  userAdjustedRef.current = true;
                  const container = containerRef.current;
                  if (!container) return;
                  const delta = keyEvent.key === 'ArrowUp' ? -16 : 16;
                  setHeights((current) => {
                    const next = applyDividerDrag(
                      index,
                      delta,
                      current,
                      specs,
                      container.clientHeight,
                    );
                    storedHeightsRef.current = next;
                    persistHeights(next);
                    return next;
                  });
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
