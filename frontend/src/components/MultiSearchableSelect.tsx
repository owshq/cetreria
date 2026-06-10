import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import Portal from '@/components/Portal';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import { withSearchEllipsis } from '@/lib/searchPlaceholder';
import ui from '@/styles/shared.module.css';
import styles from './SearchableSelect.module.css';
import multiStyles from './MultiSearchableSelect.module.css';

export type MultiSearchableSelectOption = {
  value: string;
  label: string;
  hint?: string;
};

type MultiSearchableSelectProps = {
  id?: string;
  label?: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  allLabel?: string;
  /** `search` usa el mismo aspecto que SearchField (pill, colores de búsqueda). */
  variant?: 'field' | 'search';
};

function buildSelectionLabel(
  selectedIds: string[],
  options: MultiSearchableSelectOption[],
  allLabel: string,
): string {
  if (selectedIds.length === 0) return allLabel;
  if (selectedIds.length === 1) {
    return options.find((opt) => opt.value === selectedIds[0])?.label ?? '1 contacto';
  }
  return `${selectedIds.length} contactos seleccionados`;
}

export default function MultiSearchableSelect({
  id: idProp,
  label,
  value,
  onChange,
  options,
  placeholder = 'Buscar…',
  disabled = false,
  allLabel = 'Todos los contactos',
  variant = 'field',
}: MultiSearchableSelectProps) {
  const isSearchVariant = variant === 'search';
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  const selectionLabel = useMemo(
    () => buildSelectionLabel(value, options, allLabel),
    [value, options, allLabel],
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

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDropdownPosition(null);
    }
  }, [open]);

  const updateDropdownPosition = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const rect = shell.getBoundingClientRect();
    const gap = 6;
    const padding = 8;
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? 0;
    let top = rect.bottom + gap;
    if (dropdownHeight > 0) {
      top = Math.min(top, window.innerHeight - dropdownHeight - padding);
    }
    setDropdownPosition({ top, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateDropdownPosition();
    const frameId = requestAnimationFrame(updateDropdownPosition);
    return () => cancelAnimationFrame(frameId);
  }, [open, filtered.length, highlightIndex, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  const closeDropdown = () => {
    setOpen(false);
    setQuery('');
  };

  usePopupEscape(open, closeDropdown);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
  };

  const handleFocus = () => {
    openDropdown();
  };

  const toggleOption = (optValue: string) => {
    if (selectedSet.has(optValue)) {
      onChange(value.filter((id) => id !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  const clearSelection = () => {
    onChange([]);
  };

  const displayValue = open ? query : selectionLabel;

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
      toggleOption(filtered[highlightIndex].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className={ui.field} ref={rootRef}>
      {label && (
        <label htmlFor={id} className={ui.label}>
          {label}
        </label>
      )}
      <div
        className={cx(
          styles.root,
          open && !isSearchVariant && styles.rootOpen,
          disabled && styles.rootDisabled,
        )}
      >
        <div
          className={isSearchVariant ? styles.searchShell : styles.shell}
          ref={shellRef}
        >
          <Search
            className={isSearchVariant ? styles.searchShellIcon : styles.fieldSearchIcon}
            size={16}
            strokeWidth={2.25}
            aria-hidden
          />
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
            value={displayValue}
            placeholder={value.length === 0 ? withSearchEllipsis(placeholder) : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            className={isSearchVariant ? styles.searchInput : styles.input}
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
                setQuery('');
              } else {
                inputRef.current?.focus();
                openDropdown();
              }
            }}
          >
            <ChevronDown size={18} className={cx(styles.chevron, open && styles.chevronOpen)} />
          </button>
        </div>
        {open && dropdownPosition && (
          <Portal>
            <ul
              id={`${id}-listbox`}
              ref={dropdownRef}
              role="listbox"
              className={cx(styles.dropdown, styles.dropdownPortal)}
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
              aria-multiselectable
            >
            {value.length > 0 && (
              <li className={multiStyles.clearRow}>
                <button type="button" className={multiStyles.clearButton} onClick={clearSelection}>
                  {allLabel}
                </button>
              </li>
            )}
            {filtered.length > 0 ? (
              filtered.map((opt, index) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <li key={opt.value} role="option" aria-selected={checked}>
                    <button
                      type="button"
                      className={cx(
                        styles.option,
                        multiStyles.option,
                        checked && styles.optionSelected,
                        index === highlightIndex && styles.optionHighlighted,
                      )}
                      onMouseEnter={() => setHighlightIndex(index)}
                      onClick={() => toggleOption(opt.value)}
                    >
                      <span
                        className={cx(multiStyles.checkbox, checked && multiStyles.checkboxChecked)}
                        aria-hidden
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <span className={multiStyles.optionContent}>
                        <span className={styles.optionLabel}>{opt.label}</span>
                        {opt.hint && <span className={styles.optionHint}>{opt.hint}</span>}
                      </span>
                    </button>
                  </li>
                );
              })
            ) : (
              <li className={styles.emptyOption}>Sin resultados</li>
            )}
            </ul>
          </Portal>
        )}
      </div>
    </div>
  );
}
