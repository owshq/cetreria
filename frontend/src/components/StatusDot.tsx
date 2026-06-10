import { cx } from '@/lib/cx';
import styles from './StatusDot.module.css';

type StatusDotProps = {
  color: string;
  className?: string;
  size?: number;
};

export default function StatusDot({ color, className, size = 8 }: StatusDotProps) {
  return (
    <svg
      className={cx(styles.dot, className)}
      width={size}
      height={size}
      viewBox="0 0 8 8"
      aria-hidden
    >
      <circle cx="4" cy="4" r="4" fill={color} />
    </svg>
  );
}
