import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import { withSearchEllipsis } from '@/lib/searchPlaceholder';
import ui from '@/styles/shared.module.css';
import styles from './SearchableSelect.module.css';

export type SearchableSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

type SearchableSelectProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Render dropdown in a portal to avoid clipping inside scroll containers (e.g. modals). */
  menuPortal?: boolean;
  fieldClassName?: string;
  dropdownClassName?: string;
};

export default function SearchableSelect({
  id: idProp,
  label,
  value,
  onChange,
  options,
  placeholder = 'Buscar',
  required = false,
  disabled = false,
  menuPortal = true,
  fieldClassName,
  dropdownClassName,
}: SearchableSelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.hint?.toLowerCase().includes(q) ?? false),
    );
  }, [options, query]);

  const updateDropdownPosition = useCallback(() => {
    const shell = shellRef.current;
    const dropdown = dropdownRef.current;
    if (!shell) return;

    const shellRect = shell.getBoundingClientRect();
    const gap = 6;
    const padding = 8;
    const width = shellRect.width;
    let left = shellRect.left;

    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }

    const dropdownHeight = dropdown?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - shellRect.bottom - padding;
    const spaceAbove = shellRect.top - padding;
    const openUp =
      dropdownHeight > 0 && spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    let top = openUp
      ? shellRect.top - gap - (dropdownHeight || 224)
      : shellRect.bottom + gap;

    if (dropdownHeight > 0) {
      top = Math.max(padding, Math.min(top, window.innerHeight - dropdownHeight - padding));
    }

    setDropdownPosition({ top, left, width });
  }, []);

  const updateDropdownPositionRef = useRef(updateDropdownPosition);
  updateDropdownPositionRef.current = updateDropdownPosition;

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label ?? '');
    }
  }, [value, selected?.label, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setQuery(selected?.label ?? '');
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (rootRef.current && target.contains(rootRef.current)) {
        if (menuPortal) {
          updateDropdownPositionRef.current();
        }
        return;
      }
      setOpen(false);
      setQuery(selected?.label ?? '');
    };

    const handleResize = () => {
      if (menuPortal && shellRef.current) {
        updateDropdownPositionRef.current();
        return;
      }
      setOpen(false);
      setQuery(selected?.label ?? '');
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, selected?.label, menuPortal]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setDropdownPosition(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !menuPortal || !shellRef.current) return;

    updateDropdownPosition();
    const frameId = requestAnimationFrame(updateDropdownPosition);
    return () => cancelAnimationFrame(frameId);
  }, [open, menuPortal, filtered.length, highlightIndex, updateDropdownPosition]);

  const closeDropdown = () => {
    setOpen(false);
    setQuery(selected?.label ?? '');
  };

  usePopupEscape(open, closeDropdown);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery(selected ? '' : query);
  };

  const handleFocus = () => {
    openDropdown();
    if (selected) setQuery('');
  };

  const handleSelect = (opt: SearchableSelectOption) => {
    onChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (next: string) => {
    setQuery(next);
    setOpen(true);
    if (value && selected && next !== selected.label) {
      onChange('');
    }
  };

  const displayValue = open ? query : (selected?.label ?? '');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && filtered[highlightIndex]) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(selected?.label ?? '');
    }
  };

  const dropdown = open ? (
    <ul
      ref={dropdownRef}
      id={`${id}-listbox`}
      role="listbox"
      className={cx(styles.dropdown, menuPortal && styles.dropdownPortal, dropdownClassName)}
      style={
        menuPortal && dropdownPosition
          ? {
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              minWidth: dropdownPosition.width,
            }
          : menuPortal
            ? { visibility: 'hidden' as const }
            : undefined
      }
    >
      {filtered.length > 0 ? (
        filtered.map((opt, index) => (
          <li key={opt.value} role="option" aria-selected={opt.value === value}>
            <button
              type="button"
              className={cx(
                styles.option,
                opt.value === value && styles.optionSelected,
                index === highlightIndex && styles.optionHighlighted,
              )}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => handleSelect(opt)}
            >
              <span className={styles.optionLabel}>{opt.label}</span>
              {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
            </button>
          </li>
        ))
      ) : (
        <li className={styles.emptyOption}>Sin resultados</li>
      )}
    </ul>
  ) : null;

  return (
    <div className={cx(ui.field, fieldClassName)} ref={rootRef}>
      {label && (
        <label htmlFor={id} className={ui.label}>
          {label}
          {required && ' *'}
        </label>
      )}
      <div
        className={cx(
          styles.root,
          open && !menuPortal && styles.rootOpen,
          disabled && styles.rootDisabled,
        )}
      >
        <div ref={shellRef} className={styles.shell}>
          <Search className={styles.fieldSearchIcon} size={16} strokeWidth={2.25} aria-hidden />
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            autoComplete="off"
            disabled={disabled}
            required={required && !value}
            value={displayValue}
            placeholder={withSearchEllipsis(placeholder)}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            className={styles.input}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            className={styles.toggle}
            aria-label={open ? 'Cerrar lista' : 'Abrir lista'}
            onClick={() => {
              if (open) {
                setOpen(false);
                setQuery(selected?.label ?? '');
              } else {
                inputRef.current?.focus();
                openDropdown();
              }
            }}
          >
            <ChevronDown size={18} className={cx(styles.chevron, open && styles.chevronOpen)} />
          </button>
        </div>
        {dropdown &&
          (menuPortal && typeof document !== 'undefined'
            ? createPortal(dropdown, document.body)
            : dropdown)}
      </div>
      <input type="hidden" name={id} value={value} required={required && !value} tabIndex={-1} aria-hidden />
    </div>
  );
}
