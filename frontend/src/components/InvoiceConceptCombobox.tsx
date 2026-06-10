import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { DocumentConceptOption } from '@shared/types';
import {
  buildDocumentConceptCatalog,
  isWorkspaceAdmin,
  normalizeConceptKey,
  resolveConceptEmoji,
} from '@shared/types';
import { authService } from '@/api';
import ConceptEmojiEditor from '@/components/ConceptEmojiEditor';
import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { useWorkspace } from '@/context/useWorkspace';
import { usePopupEscape } from '@/context/PopupStackContext';
import { cx } from '@/lib/cx';
import styles from './InvoiceConceptCombobox.module.css';

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
};

type ListItem =
  | { kind: 'create'; label: string }
  | { kind: 'option'; option: DocumentConceptOption };

type InvoiceConceptComboboxProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: DocumentConceptOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Por defecto sigue la funcionalidad del workspace (catalogo cerrado si esta desactivada). */
  allowFreeCreation?: boolean;
  className?: string;
  'aria-label'?: string;
};

function matchesCatalogOption(
  text: string,
  options: DocumentConceptOption[],
): boolean {
  const key = normalizeConceptKey(text);
  if (!key) return false;
  return options.some((option) => option.normalizedKey === key);
}

export default function InvoiceConceptCombobox({
  id: idProp,
  value,
  onChange,
  options,
  placeholder = 'Buscar concepto…',
  required = false,
  disabled = false,
  allowFreeCreation: allowFreeCreationProp,
  className,
  'aria-label': ariaLabel,
}: InvoiceConceptComboboxProps) {
  const { settings: conceptSettings } = useInvoiceConceptSettings();
  const { invoiceConceptFreeCreationEnabled } = useWorkspaceFeatureSettings();
  const allowFreeCreation = allowFreeCreationProp ?? invoiceConceptFreeCreationEnabled;
  const currentUser = authService.getCurrentUser();
  const { currentWorkspace } = useWorkspace();
  const canEditConceptEmoji =
    isWorkspaceAdmin(currentWorkspace?.role) || currentUser?.role === 'admin';
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  const trimmedQuery = query.trim();

  const catalogOptions = useMemo(() => {
    const extraLabels = options.map((option) => option.description);
    const merged = buildDocumentConceptCatalog([], conceptSettings, extraLabels);
    return merged.length > 0 ? merged : options;
  }, [conceptSettings, options]);

  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return catalogOptions;
    return catalogOptions.filter(
      (option) =>
        option.description.toLowerCase().includes(q) ||
        option.normalizedKey.includes(q),
    );
  }, [catalogOptions, trimmedQuery]);

  const hasExactMatch = useMemo(() => {
    if (!trimmedQuery) return false;
    const key = normalizeConceptKey(trimmedQuery);
    return catalogOptions.some((option) => option.normalizedKey === key);
  }, [catalogOptions, trimmedQuery]);

  const canCreateNew = allowFreeCreation && trimmedQuery.length > 0 && !hasExactMatch;

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = filtered.map((option) => ({ kind: 'option', option }));
    if (canCreateNew) {
      items.unshift({ kind: 'create', label: trimmedQuery });
    }
    return items;
  }, [filtered, canCreateNew, trimmedQuery]);

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
      setQuery(value);
    }
  }, [value, open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
      setQuery(value);
    };

    const handleScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (dropdownRef.current?.contains(target)) return;
      if (rootRef.current && target.contains(rootRef.current)) {
        updateDropdownPositionRef.current();
        return;
      }
      setOpen(false);
      setQuery(value);
    };

    const handleResize = () => {
      updateDropdownPositionRef.current();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, value]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) {
      setDropdownPosition(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !shellRef.current) return;

    updateDropdownPosition();
    const frameId = requestAnimationFrame(updateDropdownPosition);
    return () => cancelAnimationFrame(frameId);
  }, [open, listItems.length, highlightIndex, updateDropdownPosition]);

  const closeDropdown = () => {
    setOpen(false);
    setQuery(value);
  };

  usePopupEscape(open, closeDropdown);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
  };

  const handleFocus = () => {
    openDropdown();
    setQuery('');
  };

  const handleSelect = (option: DocumentConceptOption) => {
    onChange(option.description);
    setQuery(option.description);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleCreateNew = (label: string) => {
    const next = label.trim();
    if (!next) return;
    onChange(next);
    setQuery(next);
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleInputChange = (next: string) => {
    setQuery(next);
    if (allowFreeCreation) {
      onChange(next);
    }
    setOpen(true);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      if (dropdownRef.current?.contains(document.activeElement)) return;
      setOpen(false);
      if (!allowFreeCreation && trimmedQuery) {
        const match = catalogOptions.find(
          (option) => option.normalizedKey === normalizeConceptKey(trimmedQuery),
        );
        if (match) {
          if (match.description !== value) onChange(match.description);
          setQuery(match.description);
          return;
        }
        setQuery(value);
        return;
      }
      setQuery(value);
    }, 0);
  };

  const displayValue = open ? query : value;
  const trimmedValue = value.trim();
  const showEmojiEditor = trimmedValue.length > 0;
  const normalizedKey = useMemo(() => normalizeConceptKey(trimmedValue), [trimmedValue]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((index) => Math.min(index + 1, Math.max(listItems.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      const item = listItems[highlightIndex];
      if (item?.kind === 'create') {
        handleCreateNew(item.label);
      } else if (item?.kind === 'option') {
        handleSelect(item.option);
      } else if (
        !allowFreeCreation &&
        trimmedQuery &&
        matchesCatalogOption(trimmedQuery, catalogOptions)
      ) {
        const match = catalogOptions.find(
          (option) => option.normalizedKey === normalizeConceptKey(trimmedQuery),
        );
        if (match) handleSelect(match);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(value);
    }
  };

  const dropdown = open ? (
    <ul
      ref={dropdownRef}
      id={`${id}-listbox`}
      role="listbox"
      className={styles.dropdown}
      style={
        dropdownPosition
          ? {
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              minWidth: dropdownPosition.width,
            }
          : { visibility: 'hidden' as const }
      }
    >
      {listItems.length > 0 ? (
        listItems.map((item, index) =>
          item.kind === 'create' ? (
            <li key="__create__" role="option" aria-selected={item.label === value}>
              <button
                type="button"
                className={cx(
                  styles.option,
                  styles.createOption,
                  item.label === value && styles.optionSelected,
                  index === highlightIndex && styles.optionHighlighted,
                )}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleCreateNew(item.label)}
              >
                <span className={styles.optionEmoji} aria-hidden>
                  {resolveConceptEmoji(normalizeConceptKey(item.label), conceptSettings)}
                </span>
                <span className={styles.optionBody}>
                  <span className={styles.optionLabel}>Crear «{item.label}»</span>
                  <span className={styles.optionHint}>Concepto nuevo</span>
                </span>
              </button>
            </li>
          ) : (
            <li
              key={item.option.normalizedKey}
              role="option"
              aria-selected={item.option.description === value}
            >
              <button
                type="button"
                className={cx(
                  styles.option,
                  item.option.description === value && styles.optionSelected,
                  index === highlightIndex && styles.optionHighlighted,
                )}
                onMouseEnter={() => setHighlightIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(item.option)}
              >
                <span className={styles.optionEmoji} aria-hidden>
                  {resolveConceptEmoji(item.option.normalizedKey, conceptSettings)}
                </span>
                <span className={styles.optionBody}>
                  <span className={styles.optionLabel}>{item.option.description}</span>
                  <span className={styles.optionHint}>
                    {item.option.lineCount}{' '}
                    {item.option.lineCount === 1 ? 'línea' : 'líneas'}
                  </span>
                </span>
              </button>
            </li>
          ),
        )
      ) : (
        <li className={styles.emptyOption}>Sin conceptos en el catálogo</li>
      )}
    </ul>
  ) : null;

  return (
    <div ref={rootRef} className={cx(styles.root, open && styles.rootOpen, disabled && styles.rootDisabled)}>
      <div className={styles.fieldRow}>
        {showEmojiEditor ? (
          <div
            className={styles.emojiWrap}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ConceptEmojiEditor
              normalizedKey={normalizedKey}
              description={trimmedValue}
              editable={canEditConceptEmoji}
            />
          </div>
        ) : null}
        <div ref={shellRef} className={styles.shell}>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            aria-label={ariaLabel}
            autoComplete="off"
            disabled={disabled}
            required={required && !value.trim()}
            value={displayValue}
            placeholder={placeholder}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={cx(styles.input, className)}
          />
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            className={styles.toggle}
            aria-label={open ? 'Cerrar lista de conceptos' : 'Abrir lista de conceptos'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (open) {
                closeDropdown();
              } else {
                inputRef.current?.focus();
                setQuery('');
                openDropdown();
              }
            }}
          >
            <ChevronDown size={16} className={cx(styles.chevron, open && styles.chevronOpen)} />
          </button>
        </div>
      </div>
      {dropdown && typeof document !== 'undefined' ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
