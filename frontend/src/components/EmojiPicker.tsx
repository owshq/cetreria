import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import { EMOJI_CATEGORIES } from '@/lib/emojiCategories';
import styles from './EmojiPicker.module.css';

type PanelPosition = {
  top: number;
  left: number;
  width: number;
};

type EmojiPickerProps = {
  value: string;
  onChange: (emoji: string) => void;
  ariaLabel?: string;
  placement?: 'bottom' | 'top';
  variant?: 'default' | 'compact';
  /** Render panel in a portal to avoid clipping inside scroll containers. */
  menuPortal?: boolean;
};

const PANEL_MAX_WIDTH_PX = 288;
const PANEL_GAP_PX = 6;

export default function EmojiPicker({
  value,
  onChange,
  ariaLabel = 'Elegir icono',
  placement = 'top',
  variant = 'default',
  menuPortal = true,
}: EmojiPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(null);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const padding = 8;
    const width = Math.min(PANEL_MAX_WIDTH_PX, window.innerWidth - padding * 2);
    let left = triggerRect.left;

    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }

    const panelHeight = panel?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - triggerRect.bottom - padding;
    const spaceAbove = triggerRect.top - padding;
    const openUp =
      placement === 'top' ||
      (placement === 'bottom' &&
        panelHeight > 0 &&
        spaceBelow < panelHeight &&
        spaceAbove > spaceBelow);

    let top = openUp
      ? triggerRect.top - PANEL_GAP_PX - (panelHeight || 258)
      : triggerRect.bottom + PANEL_GAP_PX;

    if (panelHeight > 0) {
      top = Math.max(padding, Math.min(top, window.innerHeight - panelHeight - padding));
    }

    setPanelPosition({ top, left, width });
  }, [placement]);

  const updatePanelPositionRef = useRef(updatePanelPosition);
  updatePanelPositionRef.current = updatePanelPosition;

  usePopupEscape(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (panelRef.current?.contains(target)) return;
      if (rootRef.current && target.contains(rootRef.current)) {
        if (menuPortal) {
          updatePanelPositionRef.current();
        }
        return;
      }
      setOpen(false);
    };

    const handleResize = () => {
      if (menuPortal && triggerRef.current) {
        updatePanelPositionRef.current();
        return;
      }
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, menuPortal]);

  useEffect(() => {
    if (!open) {
      setPanelPosition(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuPortal || !triggerRef.current) return;

    updatePanelPosition();
    const frameId = requestAnimationFrame(updatePanelPosition);
    return () => cancelAnimationFrame(frameId);
  }, [open, menuPortal, updatePanelPosition]);

  const handleSelect = (emoji: string) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <div
      className={cx(
        styles.root,
        variant === 'compact' && styles.rootCompact,
        open && styles.rootOpen,
      )}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={cx(styles.trigger, variant === 'compact' && styles.triggerCompact)}
        onClick={() => setOpen((current) => !current)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={cx(styles.triggerEmoji, variant === 'compact' && styles.triggerEmojiCompact)}>
          {value}
        </span>
        {variant !== 'compact' && (
          <ChevronDown
            size={14}
            className={cx(styles.chevron, open && styles.chevronOpen)}
            aria-hidden
          />
        )}
      </button>

      {open &&
        (() => {
          const panel = (
            <div
              ref={panelRef}
              className={cx(
                styles.panel,
                !menuPortal && placement === 'top' && styles.panelTop,
                menuPortal && styles.panelPortal,
              )}
              role="listbox"
              aria-label={ariaLabel}
              style={
                menuPortal && panelPosition
                  ? {
                      top: panelPosition.top,
                      left: panelPosition.left,
                      width: panelPosition.width,
                    }
                  : menuPortal
                    ? { visibility: 'hidden' as const }
                    : undefined
              }
            >
              <div className={styles.panelScroll}>
                {EMOJI_CATEGORIES.map((category) => (
                  <section key={category.id} className={styles.category}>
                    <h3 className={styles.categoryTitle}>{category.label}</h3>
                    <div className={styles.emojiGrid}>
                      {category.emojis.map((emoji) => (
                        <button
                          key={`${category.id}-${emoji}`}
                          type="button"
                          role="option"
                          aria-selected={emoji === value}
                          className={cx(
                            styles.emojiOption,
                            emoji === value && styles.emojiOptionActive,
                          )}
                          onClick={() => handleSelect(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          );

          return menuPortal && typeof document !== 'undefined'
            ? createPortal(panel, document.body)
            : panel;
        })()}
    </div>
  );
}
