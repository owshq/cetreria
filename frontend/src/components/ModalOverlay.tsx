import { type HTMLAttributes, type ReactNode } from 'react';
import Portal from '@/components/Portal';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ModalOverlayProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export default function ModalOverlay({ children, className, ...props }: ModalOverlayProps) {
  return (
    <Portal>
      <div {...props} className={cx(ui.modalOverlay, className)} data-popup-layer>
        <div className={ui.modalFrame}>{children}</div>
      </div>
    </Portal>
  );
}
