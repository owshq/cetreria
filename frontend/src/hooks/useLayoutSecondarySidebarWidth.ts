import { useLayoutEffect } from 'react';
import { useSecondarySidebarLayout } from '@/context/SecondarySidebarLayoutContext';
import {
  resolveExpandedSecondarySidebarWidth,
  type ResolveExpandedSecondarySidebarWidthOptions,
} from '@/lib/secondarySidebarWidth';

export function useLayoutSecondarySidebarWidth(
  expanded: boolean,
  widthOptions?: ResolveExpandedSecondarySidebarWidthOptions,
) {
  const layout = useSecondarySidebarLayout();
  const active = layout?.active;
  const setSidebarWidth = layout?.setSidebarWidth;
  const defaultToMax = widthOptions?.defaultToMax ?? false;

  useLayoutEffect(() => {
    if (!active || !setSidebarWidth) return;

    setSidebarWidth(
      expanded ? resolveExpandedSecondarySidebarWidth({ defaultToMax }) : '0',
    );
  }, [expanded, active, defaultToMax, setSidebarWidth]);
}
