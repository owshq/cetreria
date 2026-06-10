import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';

type ModalFooterProps = {
  children: ReactNode;
  className?: string;
};

export function ModalFooter({ children, className }: ModalFooterProps) {
  return <div className={cx(ui.modalFooter, className)}>{children}</div>;
}

type ModalActionsProps = {
  children: ReactNode;
  className?: string;
};

export function ModalActions({ children, className }: ModalActionsProps) {
  return <div className={cx(ui.modalFormActions, className)}>{children}</div>;
}

/** Botón primario corporativo (negro) para footers de modal */
export const modalBtnPrimary = ui.btnModalPrimary;

/** Botón secundario gris para footers de modal */
export const modalBtnSecondary = ui.btnModalSecondary;
