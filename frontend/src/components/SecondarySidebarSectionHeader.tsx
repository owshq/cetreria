import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import shared from '@/styles/shared.module.css';

type SecondarySidebarSectionHeaderProps = {
  title: string;
  /** Cabecera de pagina (p. ej. «Documentos»): separacion inferior antes del contenido. */
  variant?: 'page' | 'section';
  /** Accion a la derecha (p. ej. colapsar). Sin accion, reserva el hueco del chevron. */
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
};

export default function SecondarySidebarSectionHeader({
  title,
  variant = 'section',
  action,
  className,
  titleClassName,
}: SecondarySidebarSectionHeaderProps) {
  const headerClass =
    variant === 'page'
      ? shared.secondarySidebarNavHeader
      : shared.secondarySidebarNavSectionHeader;

  return (
    <div className={cx(headerClass, className)}>
      <p className={cx(shared.secondarySidebarNavHeaderTitle, titleClassName)}>{title}</p>
      {action ?? (
        <span className={shared.secondarySidebarNavHeaderActionSlot} aria-hidden />
      )}
    </div>
  );
}
