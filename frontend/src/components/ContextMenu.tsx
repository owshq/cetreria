import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import styles from './ContextMenu.module.css';
import StatusDot from '@/components/StatusDot';

export type ContextMenuItem = {
  kind?: 'item';
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  selected?: boolean;
  danger?: boolean;
  dotColor?: string;
  badgeClassName?: string;
  icon?: ReactNode;
};

export type ContextMenuHeader = {
  kind: 'header';
  id: string;
  label: string;
};

export type ContextMenuSeparator = {
  kind: 'separator';
  id: string;
};

export type ContextMenuEntry = ContextMenuItem | ContextMenuHeader | ContextMenuSeparator;

type ContextMenuAnchorX = 'start' | 'center' | 'end';

type ContextMenuProps = {
  x: number;
  y: number;
  anchorX?: ContextMenuAnchorX;
  onClose: () => void;
  items: ContextMenuEntry[];
  ariaLabel: string;
  scrollable?: boolean;
};

export default function ContextMenu({
  x,
  y,
  anchorX = 'start',
  onClose,
  items,
  ariaLabel,
  scrollable = false,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isBadgeMenu = items.some((item) => item.kind !== 'header' && item.kind !== 'separator' && item.badgeClassName);

  usePopupEscape(true, onClose);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const padding = 8;
    const { width, height } = el.getBoundingClientRect();
    let left = x;

    if (anchorX === 'center') {
      left = x - width / 2;
    } else if (anchorX === 'end') {
      left = x - width;
    }

    let top = y;

    if (left < padding) {
      left = padding;
    }
    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }
    if (top + height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - height - padding);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, anchorX, items]);

  return createPortal(
    <div
      ref={menuRef}
      className={cx(styles.menu, isBadgeMenu && styles.menuBadges, scrollable && styles.menuScrollable)}
      style={{ left: x, top: y }}
      role="menu"
      aria-label={ariaLabel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => {
        if (item.kind === 'header') {
          return (
            <div key={item.id} className={styles.header} role="presentation">
              {item.label}
            </div>
          );
        }

        if (item.kind === 'separator') {
          return <div key={item.id} className={styles.separator} role="separator" />;
        }

        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cx(
              item.badgeClassName ? styles.itemBadge : styles.item,
              item.badgeClassName,
              !item.badgeClassName && item.selected && styles.itemSelected,
              !item.badgeClassName && item.danger && styles.itemDanger,
              item.badgeClassName && item.selected && styles.itemBadgeSelected,
            )}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
            {item.dotColor && <StatusDot color={item.dotColor} />}
            <span className={styles.itemLabel}>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
