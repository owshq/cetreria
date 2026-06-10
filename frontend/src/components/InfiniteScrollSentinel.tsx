import type { RefObject } from 'react';
import styles from './InfiniteScrollSentinel.module.css';

type InfiniteScrollSentinelProps = {
  sentinelRef: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  className?: string;
};

export default function InfiniteScrollSentinel({
  sentinelRef,
  hasMore,
  className,
}: InfiniteScrollSentinelProps) {
  if (!hasMore) return null;

  return (
    <div ref={sentinelRef} className={className ?? styles.root} aria-hidden>
      <span className={styles.label}>Cargando más…</span>
    </div>
  );
}
