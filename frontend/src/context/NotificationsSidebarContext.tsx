import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router';

type NotificationsSidebarContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const NotificationsSidebarContext = createContext<NotificationsSidebarContextValue | null>(
  null,
);

export function NotificationsSidebarProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
    }),
    [isOpen, open, close, toggle],
  );

  return (
    <NotificationsSidebarContext.Provider value={value}>
      {children}
    </NotificationsSidebarContext.Provider>
  );
}

export function useNotificationsSidebar() {
  const context = useContext(NotificationsSidebarContext);
  if (!context) {
    throw new Error('useNotificationsSidebar must be used within NotificationsSidebarProvider');
  }
  return context;
}

export function useNotificationsSidebarOptional() {
  return useContext(NotificationsSidebarContext);
}
