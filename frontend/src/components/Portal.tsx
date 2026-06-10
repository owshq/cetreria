import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

type PortalProps = {
  children: ReactNode;
};

export default function Portal({ children }: PortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
