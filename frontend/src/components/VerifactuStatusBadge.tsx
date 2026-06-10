import type { VerifactuStatus } from '@shared/types';
import { VERIFACTU_STATUS_DOT, VERIFACTU_STATUS_LABELS } from '@shared/types';
import StatusDot from '@/components/StatusDot';
import { cx } from '@/lib/cx';
import { VERIFACTU_STATUS_CLASS } from '@/lib/verifactuStatus';
import ui from '@/styles/shared.module.css';

type VerifactuStatusBadgeProps = {
  status: VerifactuStatus;
  className?: string;
  title?: string;
  as?: 'span' | 'button';
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  'aria-label'?: string;
  'aria-haspopup'?: React.AriaAttributes['aria-haspopup'];
  'aria-expanded'?: boolean;
};

export default function VerifactuStatusBadge({
  status,
  className,
  title,
  as = 'span',
  onClick,
  'aria-label': ariaLabel,
  'aria-haspopup': ariaHasPopup,
  'aria-expanded': ariaExpanded,
}: VerifactuStatusBadgeProps) {
  const label = VERIFACTU_STATUS_LABELS[status];
  const content = (
    <>
      <StatusDot color={VERIFACTU_STATUS_DOT[status]} />
      {label}
    </>
  );

  if (as === 'button') {
    return (
      <button
        type="button"
        className={cx(
          VERIFACTU_STATUS_CLASS[status],
          ui.statusWithDot,
          ui.statusBadge,
          className,
        )}
        title={title ?? label}
        aria-label={ariaLabel ?? label}
        aria-haspopup={ariaHasPopup}
        aria-expanded={ariaExpanded}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={cx(VERIFACTU_STATUS_CLASS[status], ui.statusWithDot, className)}
      title={title ?? label}
      aria-label={ariaLabel ?? label}
    >
      {content}
    </span>
  );
}
