import type { ReactNode } from 'react';
import type { MetricComparisonContext } from '@shared/types';
import { formatDocumentAmount } from '@shared/types';
import MetricDelta from '@/components/MetricDelta';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './DocumentPeriodStats.module.css';

type ThirdStat = {
  label: string;
  value: ReactNode;
  subtitle?: string;
  delta?: number | null | undefined;
  wide?: boolean;
};

type Props = {
  paidAmount: number;
  sentAmount: number;
  draftCount?: number;
  thirdStat?: ThirdStat;
  showMetricDeltas?: boolean;
  comparison?: MetricComparisonContext;
  paidAmountDelta?: number | null | undefined;
  pendingAmountDelta?: number | null | undefined;
  className?: string;
  labelClassName?: string;
  deltaClassName?: string;
  subtitleClassName?: string;
};

export default function DocumentPeriodStats({
  paidAmount,
  sentAmount,
  draftCount,
  thirdStat,
  showMetricDeltas = false,
  comparison,
  paidAmountDelta,
  pendingAmountDelta,
  className,
  labelClassName,
  deltaClassName,
  subtitleClassName,
}: Props) {
  const resolvedThirdStat: ThirdStat | null =
    thirdStat ??
    (draftCount !== undefined
      ? { label: 'Borradores', value: draftCount }
      : null);

  return (
    <div className={cx(ui.metricsStrip, styles.stats, className)}>
      <div className={ui.statBox}>
        <div className={cx(ui.statBoxLabel, labelClassName)}>Pagados</div>
        <div className={ui.statBoxValue}>
          {formatDocumentAmount(paidAmount)}
        </div>
        {showMetricDeltas && (
          <MetricDelta
            percent={paidAmountDelta}
            comparison={comparison}
            className={cx(styles.statDelta, deltaClassName)}
          />
        )}
      </div>
      <div className={ui.statBox}>
        <div className={cx(ui.statBoxLabel, labelClassName)}>Pendientes</div>
        <div className={cx(ui.statBoxValue, styles.statValuePending)}>
          {formatDocumentAmount(sentAmount)}
        </div>
        {showMetricDeltas && (
          <MetricDelta
            percent={pendingAmountDelta}
            comparison={comparison}
            className={cx(styles.statDelta, deltaClassName)}
          />
        )}
      </div>
      {resolvedThirdStat && (
        <div
          className={cx(
            ui.statBox,
            resolvedThirdStat.wide && styles.statBoxWide,
          )}
        >
          <div className={cx(ui.statBoxLabel, labelClassName)}>{resolvedThirdStat.label}</div>
          <div className={ui.statBoxValue}>{resolvedThirdStat.value}</div>
          {resolvedThirdStat.subtitle && (
            <div
              className={cx(styles.statSubtitle, subtitleClassName)}
              title={resolvedThirdStat.subtitle}
            >
              {resolvedThirdStat.subtitle}
            </div>
          )}
          {showMetricDeltas && resolvedThirdStat.delta !== undefined && (
            <MetricDelta
              percent={resolvedThirdStat.delta}
              comparison={comparison}
              className={cx(styles.statDelta, deltaClassName)}
            />
          )}
        </div>
      )}
    </div>
  );
}
