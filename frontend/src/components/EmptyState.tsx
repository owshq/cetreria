import { cx } from '@/lib/cx';
import styles from './EmptyState.module.css';

type EmptyStateProps = {
  emoji: string;
  title?: string;
  description?: string;
  compact?: boolean;
};

export default function EmptyState({
  emoji,
  title = 'Sin resultados',
  description,
  compact = false,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.emptyState, compact && styles.emptyStateCompact)}>
      <span className={styles.emojiBox} aria-hidden>
        {emoji}
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
