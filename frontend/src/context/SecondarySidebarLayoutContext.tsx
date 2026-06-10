import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

type SecondarySidebarLayoutContextValue = {
  active: boolean;
  resizable: boolean;
  resizing: boolean;
  sidebarWidth: string;
  slotRef: RefObject<HTMLDivElement | null>;
  slotNode: HTMLDivElement | null;
  assignSlotRef: (node: HTMLDivElement | null) => void;
  setSidebarWidth: (width: string) => void;
  setResizing: (resizing: boolean) => void;
};

const SecondarySidebarLayoutContext =
  createContext<SecondarySidebarLayoutContextValue | null>(null);

type SecondarySidebarLayoutProviderProps = {
  active: boolean;
  resizable: boolean;
  resizing: boolean;
  sidebarWidth: string;
  onSidebarWidthChange: (width: string) => void;
  onResizingChange: (resizing: boolean) => void;
  children: ReactNode;
};

export function SecondarySidebarLayoutProvider({
  active,
  resizable,
  resizing,
  sidebarWidth,
  onSidebarWidthChange,
  onResizingChange,
  children,
}: SecondarySidebarLayoutProviderProps) {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [slotNode, setSlotNode] = useState<HTMLDivElement | null>(null);

  const assignSlotRef = useCallback((node: HTMLDivElement | null) => {
    slotRef.current = node;
    setSlotNode((current) => (current === node ? current : node));
  }, []);

  const value = useMemo(
    () => ({
      active,
      resizable,
      resizing,
      sidebarWidth,
      slotRef,
      slotNode,
      assignSlotRef,
      setSidebarWidth: onSidebarWidthChange,
      setResizing: onResizingChange,
    }),
    [active, assignSlotRef, onResizingChange, onSidebarWidthChange, resizable, resizing, sidebarWidth],
  );

  return (
    <SecondarySidebarLayoutContext.Provider value={value}>
      {children}
    </SecondarySidebarLayoutContext.Provider>
  );
}

export function useSecondarySidebarLayout() {
  return useContext(SecondarySidebarLayoutContext);
}
