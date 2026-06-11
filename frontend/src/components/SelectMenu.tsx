import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import StatusDot from '@/components/StatusDot';
import styles from './SelectMenu.module.css';

export type SelectMenuOption = {
  value: string;
  label: string;
  dotColor?: string;
  emoji?: string;
  symbol?: string;
};

type SelectMenuProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  /** Where the dropdown opens relative to the trigger. */
  placement?: 'bottom' | 'top';
  /** Trigger shows only emoji for these values; otherwise shows the option label. */
  emojiOnlyTriggerValues?: string[];
  /** Trigger shows only the symbol when the selected option has one. */
  symbolOnlyTrigger?: boolean;
  /** Smaller trigger padding for dense layouts. */
  compact?: boolean;
  /** Chevron-only trigger for combobox layouts. */
  iconTrigger?: boolean;
  /** Render dropdown in a portal to avoid clipping inside scroll containers. */
  menuPortal?: boolean;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

export default function SelectMenu({
  id: idProp,
  value,
  onChange,
  options,
  ariaLabel,
  className,
  disabled = false,
  placement = 'bottom',
  emojiOnlyTriggerValues = ['all'],
  symbolOnlyTrigger = false,
  compact = false,
  iconTrigger = false,
  menuPortal = true,
}: SelectMenuProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((opt) => opt.value === value)),
    [options, value],
  );

  const usesEmoji = options.some((opt) => opt.emoji);
  const showEmojiOnlyTrigger =
    usesEmoji &&
    selected != null &&
    emojiOnlyTriggerValues.includes(selected.value) &&
    Boolean(selected.emoji);

  const showSymbolOnlyTrigger =
    symbolOnlyTrigger && selected != null && Boolean(selected.symbol);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleResize = () => setOpen(false);

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setHighlightIndex(selectedIndex);
    } else {
      setDropdownPosition(null);
    }
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open || !menuPortal || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const dropdown = dropdownRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const gap = 6;
      const padding = 8;
      const minDropdownWidth = symbolOnlyTrigger || iconTrigger ? 176 : triggerRect.width;
      const width = Math.max(triggerRect.width, minDropdownWidth);
      let left = triggerRect.left;

      if (left + width > window.innerWidth - padding) {
        left = Math.max(padding, window.innerWidth - width - padding);
      }

      const dropdownHeight = dropdown?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - triggerRect.bottom - padding;
      const spaceAbove = triggerRect.top - padding;
      const openUp =
        placement === 'top' ||
        (placement === 'bottom' &&
          dropdownHeight > 0 &&
          spaceBelow < dropdownHeight &&
          spaceAbove > spaceBelow);

      let top = openUp
        ? triggerRect.top - gap - (dropdownHeight || 224)
        : triggerRect.bottom + gap;

      if (dropdownHeight > 0) {
        top = Math.max(padding, Math.min(top, window.innerHeight - dropdownHeight - padding));
      }

      setDropdownPosition({ top, left, width });
    };

    updatePosition();
    requestAnimationFrame(updatePosition);
  }, [open, menuPortal, placement, options.length, highlightIndex, symbolOnlyTrigger, iconTrigger]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  usePopupEscape(open, closeMenu);

  const handleSelect = (opt: SelectMenuOption) => {
    onChange(opt.value);
    closeMenu();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) {
        const opt = options[highlightIndex];
        if (opt) handleSelect(opt);
      } else {
        setOpen(true);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        closeMenu();
      }
    } else if (e.key === 'Home' && open) {
      e.preventDefault();
      setHighlightIndex(0);
    } else if (e.key === 'End' && open) {
      e.preventDefault();
      setHighlightIndex(options.length - 1);
    }
  };

  const dropdown = open ? (
    <ul
      ref={dropdownRef}
      id={`${id}-listbox`}
      role="listbox"
      aria-label={ariaLabel}
      className={cx(
        styles.dropdown,
        menuPortal && styles.dropdownPortal,
        symbolOnlyTrigger && styles.dropdownSymbol,
        !menuPortal && placement === 'top' && styles.dropdownTop,
      )}
      style={
        menuPortal && dropdownPosition
          ? {
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              minWidth: dropdownPosition.width,
            }
          : menuPortal
            ? { visibility: 'hidden' as const }
            : undefined
      }
    >
      {options.map((opt, index) => (
        <li key={opt.value} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={opt.value === value}
            className={cx(
              styles.option,
              compact && styles.optionCompact,
              opt.emoji && styles.optionWithEmoji,
              opt.symbol && styles.optionWithSymbol,
              opt.value === value && styles.optionSelected,
              index === highlightIndex && styles.optionHighlighted,
            )}
            aria-label={opt.label}
            onMouseEnter={() => setHighlightIndex(index)}
            onClick={() => handleSelect(opt)}
          >
            {opt.emoji ? (
              <>
                <span className={styles.emoji} aria-hidden>
                  {opt.emoji}
                </span>
                <span className={styles.optionText}>{opt.label}</span>
              </>
            ) : (
              <>
                {opt.symbol && (
                  <span className={styles.symbol} aria-hidden>
                    {opt.symbol}
                  </span>
                )}
                {opt.dotColor && <StatusDot color={opt.dotColor} />}
                <span className={styles.optionText}>{opt.label}</span>
              </>
            )}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cx(
        styles.root,
        open && styles.rootOpen,
        disabled && styles.rootDisabled,
        showEmojiOnlyTrigger && styles.rootEmojiTrigger,
        showSymbolOnlyTrigger && styles.rootSymbolTrigger,
        iconTrigger && styles.rootIconTrigger,
        className,
      )}
      style={
        showEmojiOnlyTrigger || showSymbolOnlyTrigger || iconTrigger
          ? { minWidth: 0, width: 'auto' }
          : undefined
      }
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className={cx(
          styles.trigger,
          compact && styles.triggerCompact,
          showEmojiOnlyTrigger && styles.triggerEmojiOnly,
          showSymbolOnlyTrigger && styles.triggerSymbolOnly,
          iconTrigger && styles.triggerIconOnly,
        )}
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.triggerLabel} hidden={iconTrigger}>
          {showEmojiOnlyTrigger ? (
            <span className={styles.emoji} aria-hidden>
              {selected.emoji}
            </span>
          ) : showSymbolOnlyTrigger ? (
            <span className={styles.symbol} aria-hidden>
              {selected.symbol}
            </span>
          ) : (
            <>
              {!selected?.emoji && selected?.symbol && (
                <span className={styles.symbol} aria-hidden>
                  {selected.symbol}
                </span>
              )}
              {!selected?.emoji && selected?.dotColor && (
                <StatusDot color={selected.dotColor} />
              )}
              <span className={styles.triggerText}>{selected?.label ?? ariaLabel}</span>
            </>
          )}
        </span>
        <ChevronDown
          size={compact ? 16 : 18}
          className={cx(styles.chevron, open && styles.chevronOpen)}
          aria-hidden
        />
      </button>
      {dropdown &&
        (menuPortal && typeof document !== 'undefined'
          ? createPortal(dropdown, document.body)
          : dropdown)}
    </div>
  );
}
