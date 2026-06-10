import type { ChartDatum } from './utils';
import styles from './ClientActivityTypeChart.module.css';

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum; color?: string }>;
};

export default function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const item = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipDot} style={{ backgroundColor: item.color }} aria-hidden />
      <div className={styles.tooltipBody}>
        <span className={styles.tooltipTitle}>{item.label}</span>
        <span className={styles.tooltipValue}>
          {item.hours}h · {item.percent}%
        </span>
      </div>
    </div>
  );
}
