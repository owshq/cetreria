import { createPortal } from 'react-dom';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useSecondarySidebarLayout } from '@/context/SecondarySidebarLayoutContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';

type SecondarySidebarPortalProps = {
  children: ReactNode;
  /** Inline sidebar on mobile (e.g. Settings pills, Reports list). Hidden by default. */
  renderOnMobile?: boolean;
};

export default function SecondarySidebarPortal({
  children,
  renderOnMobile = false,
}: SecondarySidebarPortalProps) {
  const layout = useSecondarySidebarLayout();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [mountNode, setMountNode] = useState<HTMLElement | null>(() => layout?.slotNode ?? null);

  const portalDisabled = !layout?.active || isMobile;

  useLayoutEffect(() => {
    if (portalDisabled) {
      setMountNode(null);
      return;
    }

    const node = layout?.slotNode ?? layout?.slotRef.current ?? null;
    setMountNode((current) => (current === node ? current : node));
  }, [portalDisabled, layout?.slotNode, layout?.slotRef]);

  if (!layout?.active) {
    return null;
  }

  if (isMobile && !renderOnMobile) {
    return null;
  }

  if (portalDisabled) {
    return <>{children}</>;
  }

  if (!mountNode) {
    return null;
  }

  return createPortal(children, mountNode);
}
