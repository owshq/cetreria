import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './DocumentsMobileFilterMenu.module.css';

type MobileFilterMenuItemProps = {
  selected: boolean;
  label: string;
  onClick: () => void;
  title?: string;
  leadingIcon?: ReactNode;
};

export default function MobileFilterMenuItem({
  selected,
  label,
  onClick,
  title,
  leadingIcon,
}: MobileFilterMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(styles.item, selected && styles.itemSelected)}
      onClick={onClick}
      title={title}
      aria-current={selected ? true : undefined}
    >
      <span
        className={cx(styles.itemCheck, selected && styles.itemCheckActive)}
        aria-hidden
      >
        {selected && <Check size={10} strokeWidth={3} />}
      </span>
      {leadingIcon && (
        <span className={styles.itemLeadingIcon} aria-hidden>
          {leadingIcon}
        </span>
      )}
      <span className={styles.itemLabel}>{label}</span>
    </button>
  );
}
