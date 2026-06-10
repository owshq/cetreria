import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './SidebarFooter.module.css';

type SidebarFooterProps = {
  variant?: 'primary' | 'secondary';
  children: ReactNode;
  className?: string;
};

export function SidebarFooter({
  variant = 'primary',
  children,
  className,
}: SidebarFooterProps) {
  return (
    <footer
      className={cx(
        styles.footer,
        variant === 'secondary' && styles.footerSecondary,
        className,
      )}
    >
      {children}
    </footer>
  );
}

type SidebarFooterActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  fullWidth?: boolean;
  compact?: boolean;
  mobileIconOnly?: boolean;
  label?: string;
  labelClassName?: string;
};

export function SidebarFooterAction({
  fullWidth = false,
  compact = false,
  mobileIconOnly = false,
  label,
  labelClassName,
  className,
  children,
  ...props
}: SidebarFooterActionProps) {
  return (
    <button
      type="button"
      className={cx(
        styles.action,
        fullWidth && styles.actionFullWidth,
        compact && styles.actionCompact,
        mobileIconOnly && styles.actionMobileIcon,
        className,
      )}
      {...props}
    >
      {children}
      {label ? <span className={cx(styles.actionLabel, labelClassName)}>{label}</span> : null}
    </button>
  );
}
