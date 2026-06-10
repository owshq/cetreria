import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSidebar } from '@/context/SidebarContext';

type CloseFn = () => void;

const POPUP_LAYER_SELECTOR = [
  '[data-popup-layer]',
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[class*="modalOverlay"]',
].join(', ');

function isInsidePopupLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(POPUP_LAYER_SELECTOR) !== null;
}

function setPopupOpenAttribute(open: boolean) {
  const root = document.documentElement;
  if (open) {
    root.setAttribute('data-popup-open', '');
  } else {
    root.removeAttribute('data-popup-open');
  }
}

type PopupStackContextValue = {
  register: (close: CloseFn) => () => void;
  closeAll: () => void;
  openCount: number;
};

const PopupStackContext = createContext<PopupStackContextValue | null>(null);

export function PopupStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<CloseFn[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const { isOpen, isCollapsed, close: closeSidebar, collapse } = useSidebar();

  const syncOpenCount = useCallback(() => {
    setOpenCount(stackRef.current.length);
  }, []);

  const register = useCallback(
    (close: CloseFn) => {
      stackRef.current.push(close);
      syncOpenCount();
      return () => {
        const index = stackRef.current.lastIndexOf(close);
        if (index !== -1) stackRef.current.splice(index, 1);
        syncOpenCount();
      };
    },
    [syncOpenCount],
  );

  const closeAll = useCallback(() => {
    const closers = [...stackRef.current];
    for (let index = closers.length - 1; index >= 0; index -= 1) {
      closers[index]();
    }
  }, []);

  useEffect(() => {
    setPopupOpenAttribute(openCount > 0);
    return () => setPopupOpenAttribute(false);
  }, [openCount]);

  useEffect(() => {
    if (openCount === 0) return;

    const blockBackgroundScroll = (event: Event) => {
      if (isInsidePopupLayer(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener('wheel', blockBackgroundScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', blockBackgroundScroll, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', blockBackgroundScroll, { capture: true });
      document.removeEventListener('touchmove', blockBackgroundScroll, { capture: true });
    };
  }, [openCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      const stack = stackRef.current;
      if (stack.length > 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stack[stack.length - 1]();
        return;
      }

      if (isOpen) {
        event.preventDefault();
        closeSidebar();
        return;
      }

      if (!isCollapsed) {
        event.preventDefault();
        collapse();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, isCollapsed, closeSidebar, collapse]);

  return (
    <PopupStackContext.Provider value={{ register, closeAll, openCount }}>
      {children}
    </PopupStackContext.Provider>
  );
}

export function useCloseAllPopups() {
  const context = useContext(PopupStackContext);
  return context?.closeAll ?? (() => {});
}

export function usePopupEscape(isOpen: boolean, onClose: () => void) {
  const context = useContext(PopupStackContext);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || !context) return;
    return context.register(() => onCloseRef.current());
  }, [isOpen, context]);
}
