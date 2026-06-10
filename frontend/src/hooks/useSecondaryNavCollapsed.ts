import { useCallback, useEffect, useState } from 'react';

export type SecondaryNavPage =
  | 'activities'
  | 'activities-calendar'
  | 'clients'
  | 'documents'
  | 'reports'
  | 'settings'
  | 'help';

export function secondaryNavPageFromPath(pathname: string): SecondaryNavPage | null {
  if (pathname === '/activities' || pathname.startsWith('/activities/')) return 'activities';
  if (pathname === '/clients') return 'clients';
  if (pathname === '/docs' || pathname.startsWith('/docs/')) return 'documents';
  if (
    pathname === '/reports' ||
    (pathname.startsWith('/reports/') && !pathname.startsWith('/reports/client/'))
  ) {
    return 'reports';
  }
  if (pathname === '/settings') return 'settings';
  if (pathname === '/help') return 'help';
  return null;
}

export function readSecondaryNavCollapsed(page: SecondaryNavPage): boolean {
  try {
    return localStorage.getItem(`secondary_nav_collapsed_${page}`) === '1';
  } catch {
    return false;
  }
}

export function readSecondaryNavCollapsedForPath(pathname: string): boolean {
  const page = secondaryNavPageFromPath(pathname);
  return page ? readSecondaryNavCollapsed(page) : false;
}

function writeCollapsed(page: SecondaryNavPage, collapsed: boolean): void {
  try {
    localStorage.setItem(`secondary_nav_collapsed_${page}`, collapsed ? '1' : '0');
  } catch {
    // Ignore quota / private mode errors.
  }
}

type SetCollapsedOptions = {
  persist?: boolean;
};

export function useSecondaryNavCollapsed(page: SecondaryNavPage) {
  const [collapsed, setCollapsedState] = useState(() => readSecondaryNavCollapsed(page));

  useEffect(() => {
    setCollapsedState(readSecondaryNavCollapsed(page));
  }, [page]);

  const setCollapsed = useCallback((value: boolean, options?: SetCollapsedOptions) => {
    setCollapsedState(value);
    if (options?.persist !== false) {
      writeCollapsed(page, value);
    }
  }, [page]);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeCollapsed(page, next);
      return next;
    });
  }, [page]);

  return { collapsed, toggle, setCollapsed };
}
