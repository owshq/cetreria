import { ChevronLeft } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './SecondaryNavToggle.module.css';

type SecondaryNavToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  controlsId?: string;
  className?: string;
};

export default function SecondaryNavToggle({
  expanded,
  onToggle,
  controlsId,
  className,
}: SecondaryNavToggleProps) {
  return (
    <button
      type="button"
      className={cx(styles.toggleBtn, className)}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={expanded ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
      title={expanded ? 'Ocultar panel lateral' : 'Mostrar panel lateral'}
    >
      <ChevronLeft
        size={16}
        strokeWidth={2.25}
        className={cx(styles.chevron, !expanded && styles.chevronCollapsed)}
        aria-hidden
      />
    </button>
  );
}
