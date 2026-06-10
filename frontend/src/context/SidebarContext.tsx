import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { readLocalStorageFor, writeLocalStorageFor } from '@/lib/storageKeys';

function readCollapsedPreference(): boolean {
  try {
    return readLocalStorageFor('sidebarCollapsed') === '1';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean): void {
  try {
    writeLocalStorageFor('sidebarCollapsed', collapsed ? '1' : '0');
  } catch {
    // Ignore quota / private mode errors.
  }
}

type SidebarContextValue = {
  isOpen: boolean;
  isCollapsed: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  toggleCollapsed: () => void;
  collapse: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPreference);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPreference(next);
      return next;
    });
  }, []);

  const collapse = useCallback(() => {
    setIsCollapsed((prev) => {
      if (prev) return prev;
      writeCollapsedPreference(true);
      return true;
    });
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');

    const onChange = () => {
      if (mq.matches) close();
    };

    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [close]);

  const value = useMemo(
    () => ({
      isOpen,
      isCollapsed,
      open,
      close,
      toggle,
      toggleCollapsed,
      collapse,
    }),
    [isOpen, isCollapsed, open, close, toggle, toggleCollapsed, collapse],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}
