import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cx } from '@/lib/cx';
import styles from './FilterPillSelect.module.css';

export type FilterPillOption<T extends string> = {
  id: T;
  label: string;
};

type FilterPillSelectProps<T extends string, M extends string> = {
  menu: M;
  groupLabel: string;
  value: T;
  options: readonly FilterPillOption<T>[];
  openMenu: M | null;
  onToggle: (menu: M) => void;
  onSelect: (value: T) => void;
};

export function FilterPillSelect<T extends string, M extends string>({
  menu,
  groupLabel,
  value,
  options,
  openMenu,
  onToggle,
  onSelect,
}: FilterPillSelectProps<T, M>) {
  const isOpen = openMenu === menu;
  const currentLabel = options.find((option) => option.id === value)?.label ?? value;

  return (
    <div className={styles.control}>
      <button
        type="button"
        className={cx(styles.trigger, isOpen && styles.triggerOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`${groupLabel}: ${currentLabel}`}
        onClick={() => onToggle(menu)}
      >
        <span className={styles.groupLabel}>{groupLabel}</span>
        {!isOpen && <span className={styles.value}>{currentLabel}</span>}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={cx(styles.chevron, isOpen && styles.chevronOpen)}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div className={styles.options} role="listbox" aria-label={groupLabel}>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={value === option.id}
              className={cx(styles.pill, value === option.id && styles.pillActive)}
              onClick={() => onSelect(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type FilterPillBarProps = {
  ariaLabel: string;
  className?: string;
  children: ReactNode;
};

export function useFilterPillMenu<M extends string>() {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<M | null>(null);

  usePopupEscape(openMenu !== null, () => setOpenMenu(null));

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openMenu]);

  const toggleMenu = (menu: M) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  return { controlsRef, openMenu, setOpenMenu, toggleMenu };
}

export function FilterPillBar({ ariaLabel, className, children }: FilterPillBarProps) {
  return (
    <div className={styles.filtersBar} role="group" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

function DualSliderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <line
        x1="4.25"
        y1="2"
        x2="4.25"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="4.25" cy="5.25" r="1.35" fill="currentColor" />
      <line
        x1="9.75"
        y1="2"
        x2="9.75"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="9.75" cy="8.75" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function FilterPillControls({
  className,
  children,
  toggleAriaLabel = 'Opciones del gráfico',
  inline = false,
}: {
  className?: string;
  children: ReactNode;
  toggleAriaLabel?: string;
  /** Siempre muestra la barra de filtros, sin botón colapsable (p. ej. ficha de contacto). */
  inline?: boolean;
}) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  usePopupEscape(expanded, () => setExpanded(false));

  useEffect(() => {
    if (!expanded || !isDesktop) return;

    const handlePointerDown = (event: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [expanded, isDesktop]);

  if (inline || !isDesktop) {
    return <div className={cx(styles.filtersWrap, className)}>{children}</div>;
  }

  return (
    <div ref={wrapRef} className={cx(styles.filtersWrap, className)}>
      <button
        type="button"
        className={styles.toggleBtn}
        aria-label={expanded ? 'Ocultar opciones' : toggleAriaLabel}
        aria-expanded={expanded}
        aria-haspopup="true"
        onClick={() => setExpanded((open) => !open)}
      >
        <span className={styles.toggleIcon}>
          <DualSliderIcon />
        </span>
      </button>
      {expanded ? <div className={styles.filtersPopover}>{children}</div> : null}
    </div>
  );
}
