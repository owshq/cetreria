import { useCallback, useState } from 'react';
import { useSecondarySidebarLayout } from '@/context/SecondarySidebarLayoutContext';
import {
  clampSecondarySidebarWidthPx,
  getSecondarySidebarMaxWidthPx,
  getSecondarySidebarMinWidthPx,
  parseSecondarySidebarWidthCss,
  writeStoredSecondarySidebarWidthPx,
} from '@/lib/secondarySidebarWidth';
import styles from './SecondarySidebarResizeHandle.module.css';

const KEYBOARD_STEP_PX = 16;

export default function SecondarySidebarResizeHandle() {
  const layout = useSecondarySidebarLayout();
  const [dragging, setDragging] = useState(false);

  const resizable = layout?.resizable;
  const sidebarWidth = layout?.sidebarWidth ?? '0';
  const setSidebarWidth = layout?.setSidebarWidth;

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!resizable || !setSidebarWidth) return;
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = parseSecondarySidebarWidthCss(sidebarWidth);
      let latestWidth = startWidth;
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      setDragging(true);
      layout?.setResizing?.(true);

      const content = target.closest('[data-secondary-sidebar]') as HTMLElement | null;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        latestWidth = clampSecondarySidebarWidthPx(startWidth + deltaX);
        content?.style.setProperty('--layout-secondary-sidebar-width', `${latestWidth}px`);
      };

      const finish = (endEvent: PointerEvent) => {
        target.releasePointerCapture(endEvent.pointerId);
        target.removeEventListener('pointermove', onPointerMove);
        target.removeEventListener('pointerup', finish);
        target.removeEventListener('pointercancel', finish);
        setDragging(false);
        layout?.setResizing?.(false);
        writeStoredSecondarySidebarWidthPx(latestWidth);
        setSidebarWidth(`${latestWidth}px`);
      };

      target.addEventListener('pointermove', onPointerMove);
      target.addEventListener('pointerup', finish);
      target.addEventListener('pointercancel', finish);
    },
    [layout, resizable, setSidebarWidth, sidebarWidth],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!resizable || !setSidebarWidth) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
      const nextWidth = clampSecondarySidebarWidthPx(
        parseSecondarySidebarWidthCss(sidebarWidth) + delta,
      );
      writeStoredSecondarySidebarWidthPx(nextWidth);
      setSidebarWidth(`${nextWidth}px`);
    },
    [resizable, setSidebarWidth, sidebarWidth],
  );

  if (!resizable) {
    return null;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar barra lateral"
      aria-valuemin={getSecondarySidebarMinWidthPx()}
      aria-valuemax={getSecondarySidebarMaxWidthPx()}
      aria-valuenow={parseSecondarySidebarWidthCss(sidebarWidth)}
      tabIndex={0}
      className={styles.handle}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}
