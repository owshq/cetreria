import { ChevronDown } from 'lucide-react';
import { cx } from '@/lib/cx';
import styles from './ChartSectionToggle.module.css';

type ChartSectionToggleProps = {
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
  /** Etiqueta accesible; por defecto segun `plural`. */
  label?: string;
  plural?: boolean;
  className?: string;
};

export default function ChartSectionToggle({
  expanded,
  onToggle,
  controlsId,
  label,
  plural = false,
  className,
}: ChartSectionToggleProps) {
  const fallbackLabel = expanded
    ? plural
      ? 'Ocultar gráficos'
      : 'Ocultar gráfico'
    : plural
      ? 'Mostrar gráficos'
      : 'Mostrar gráfico';
  const ariaLabel = label ?? fallbackLabel;

  return (
    <button
      type="button"
      className={cx(styles.chartSectionToggleBtn, className)}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <ChevronDown
        size={14}
        strokeWidth={2.25}
        className={cx(styles.chartSectionToggleChevron, expanded && styles.chartSectionToggleChevronOpen)}
        aria-hidden
      />
    </button>
  );
}
