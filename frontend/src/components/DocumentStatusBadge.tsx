import type { ButtonHTMLAttributes } from 'react';
import type { Document } from '@shared/types';
import StatusDot from '@/components/StatusDot';
import { cx } from '@/lib/cx';
import {
  DOCUMENT_STATUS_CLASS,
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
} from '@/lib/documentStatus';
import ui from '@/styles/shared.module.css';

type DocumentStatusBadgeBaseProps = {
  status: Document['status'];
  className?: string;
};

type DocumentStatusBadgeSpanProps = DocumentStatusBadgeBaseProps & {
  as?: 'span';
};

type DocumentStatusBadgeButtonProps = DocumentStatusBadgeBaseProps & {
  as: 'button';
} & Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'title' | 'aria-label' | 'aria-haspopup' | 'aria-expanded'
>;

export type DocumentStatusBadgeProps =
  | DocumentStatusBadgeSpanProps
  | DocumentStatusBadgeButtonProps;

export default function DocumentStatusBadge(props: DocumentStatusBadgeProps) {
  const { status, className } = props;
  const badgeClass = cx(DOCUMENT_STATUS_CLASS[status], ui.statusWithDot, className);
  const content = (
    <>
      <StatusDot color={DOCUMENT_STATUS_DOT[status]} />
      {DOCUMENT_STATUS_LABELS[status]}
    </>
  );

  if (props.as === 'button') {
    const {
      onClick,
      title,
      'aria-label': ariaLabel,
      'aria-haspopup': ariaHaspopup,
      'aria-expanded': ariaExpanded,
    } = props;
    return (
      <button
        type="button"
        className={cx(badgeClass, ui.statusBadge, ui.statusBadgeBtn)}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup={ariaHaspopup}
        aria-expanded={ariaExpanded}
      >
        {content}
      </button>
    );
  }

  return <span className={badgeClass}>{content}</span>;
}
