import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ModalHeaderProps = {
  title: ReactNode;
  titleId?: string;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  children?: ReactNode;
  className?: string;
};

export default function ModalHeader({
  title,
  titleId,
  onClose,
  closeLabel = 'Cerrar',
  closeDisabled = false,
  children,
  className,
}: ModalHeaderProps) {
  return (
    <div className={cx(ui.modalHeader, className)}>
      <div className={ui.modalHeaderMain}>
        <h3 id={titleId} className={ui.modalTitle}>
          {title}
        </h3>
        {children}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={ui.modalCloseBtn}
          aria-label={closeLabel}
          disabled={closeDisabled}
        >
          <X size={20} />
        </button>
      ) : null}
    </div>
  );
}
