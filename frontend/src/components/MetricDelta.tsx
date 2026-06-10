import type { MetricComparisonContext } from '@shared/types';
import { cx } from '@/lib/cx';
import { formatChangePercent } from '@/lib/metricDelta';
import styles from './MetricDelta.module.css';

type Props = {
  percent: number | null | undefined;
  comparison: MetricComparisonContext;
  className?: string;
};

export default function MetricDelta({ percent, comparison, className }: Props) {
  const { text, tone } = formatChangePercent(percent, comparison);
  return (
    <div className={cx(styles.delta, styles[`delta_${tone}`], className)}>{text}</div>
  );
}
