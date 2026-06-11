import { type HTMLAttributes, type ReactNode } from 'react';
import Portal from '@/components/Portal';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ModalOverlayProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Apila encima de otro modal (p. ej. vista previa PDF). */
  raised?: boolean;
};

export default function ModalOverlay({
  children,
  className,
  raised = false,
  ...props
}: ModalOverlayProps) {
  return (
    <Portal>
      <div
        {...props}
        className={cx(ui.modalOverlay, raised && ui.modalOverlayRaised, className)}
        data-popup-layer
      >
        <div className={ui.modalFrame}>{children}</div>
      </div>
    </Portal>
  );
}
