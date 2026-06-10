import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const SHOW_DELAY_MS = 280;
const HIDE_DELAY_MS = 120;

export function useActivityPreviewHover() {
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const showTimeoutRef = useRef<number>();
  const hideTimeoutRef = useRef<number>();
  const [previewOpen, setPreviewOpen] = useState(false);

  const scheduleShow = useCallback(() => {
    if (!canHover) return;
    window.clearTimeout(hideTimeoutRef.current);
    showTimeoutRef.current = window.setTimeout(() => setPreviewOpen(true), SHOW_DELAY_MS);
  }, [canHover]);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(showTimeoutRef.current);
    hideTimeoutRef.current = window.setTimeout(() => setPreviewOpen(false), HIDE_DELAY_MS);
  }, []);

  const handleMouseEnter = useCallback(() => {
    scheduleShow();
  }, [scheduleShow]);

  const handleMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  const handleFocus = useCallback(() => {
    if (!canHover) return;
    setPreviewOpen(true);
  }, [canHover]);

  const handleBlur = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  const closePreview = useCallback(() => {
    window.clearTimeout(showTimeoutRef.current);
    window.clearTimeout(hideTimeoutRef.current);
    setPreviewOpen(false);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(showTimeoutRef.current);
      window.clearTimeout(hideTimeoutRef.current);
    },
    [],
  );

  return {
    previewOpen,
    canHover,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
    closePreview,
  };
}
