import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import Portal from '@/components/Portal';
import { usePopupEscape } from '@/context/PopupStackContext';
import { detectCountryIso } from '@/lib/detectCountry';
import { withSearchEllipsis } from '@/lib/searchPlaceholder';
import {
  DEFAULT_PHONE_COUNTRY,
  filterCountries,
  flagEmoji,
  getCountryByIso,
  type PhoneCountry,
} from '@/lib/phoneCountries';
import {
  formatNationalDisplay,
  formatPhoneValue,
  isPhoneValueValid,
  parsePhoneValue,
} from '@/lib/phoneUtils';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './PhoneInput.module.css';

type PhoneInputProps = {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export default function PhoneInput({
  id: idProp,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = '612 345 678',
}: PhoneInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const countryBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const [countryIso, setCountryIso] = useState(DEFAULT_PHONE_COUNTRY);
  const [national, setNational] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [detected, setDetected] = useState(false);

  const country = getCountryByIso(countryIso) ?? getCountryByIso(DEFAULT_PHONE_COUNTRY)!;

  const filteredCountries = useMemo(
    () => filterCountries(countryQuery),
    [countryQuery],
  );

  useEffect(() => {
    const parsed = parsePhoneValue(value, countryIso);
    setCountryIso(parsed.countryIso);
    setNational(parsed.national);
  }, [value]);

  useEffect(() => {
    if (detected || value.trim()) return;
    let cancelled = false;
    detectCountryIso().then((iso) => {
      if (!cancelled && !value.trim()) {
        setCountryIso(iso);
        setDetected(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [detected, value]);

  useEffect(() => {
    if (!countryOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setCountryOpen(false);
        setCountryQuery('');
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [countryOpen]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [countryQuery, countryOpen]);

  useEffect(() => {
    if (countryOpen) {
      searchRef.current?.focus();
      const updatePos = () => {
        const btn = countryBtnRef.current;
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
          width: Math.max(rect.width, 16 * 16),
        });
      };
      updatePos();
      window.addEventListener('resize', updatePos);
      window.addEventListener('scroll', updatePos, true);
      return () => {
        window.removeEventListener('resize', updatePos);
        window.removeEventListener('scroll', updatePos, true);
      };
    }
    setCountryQuery('');
    setDropdownPos(null);
  }, [countryOpen]);

  const emitChange = (iso: string, nextNational: string) => {
    const c = getCountryByIso(iso) ?? country;
    onChange(formatPhoneValue(c, nextNational));
  };

  const handleNationalChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setNational(digits);
    emitChange(countryIso, digits);
  };

  const handleSelectCountry = (c: PhoneCountry) => {
    setCountryIso(c.iso);
    emitChange(c.iso, national);
    setCountryOpen(false);
    setCountryQuery('');
  };

  const closeCountryDropdown = () => {
    setCountryOpen(false);
    setCountryQuery('');
  };

  usePopupEscape(countryOpen, closeCountryDropdown);

  const handleCountryKeyDown = (e: React.KeyboardEvent) => {
    if (!countryOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setCountryOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, Math.max(filteredCountries.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filteredCountries[highlightIndex]) {
      e.preventDefault();
      handleSelectCountry(filteredCountries[highlightIndex]);
    } else if (e.key === 'Escape') {
      setCountryOpen(false);
      setCountryQuery('');
    }
  };

  const displayNational = formatNationalDisplay(national);
  const valid = !required || isPhoneValueValid(value);

  return (
    <div className={ui.field} ref={rootRef}>
      {label && (
        <label htmlFor={`${id}-number`} className={ui.label}>
          {label}
        </label>
      )}
      <div className={styles.wrapper}>
        <div className={styles.countryWrap}>
          <button
            ref={countryBtnRef}
            type="button"
            className={cx(styles.countryBtn, countryOpen && styles.countryBtnOpen)}
            onClick={() => !disabled && setCountryOpen((o) => !o)}
            onKeyDown={handleCountryKeyDown}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={countryOpen}
            aria-label={`País: ${country.name}, ${country.dialCode}`}
          >
            <span className={styles.flag} aria-hidden>
              {flagEmoji(country.iso)}
            </span>
            <span className={styles.dialCode}>{country.dialCode}</span>
            <ChevronDown
              size={16}
              className={cx(styles.chevron, countryOpen && styles.chevronOpen)}
              aria-hidden
            />
          </button>
          {countryOpen && dropdownPos && (
            <Portal>
            <div
              className={styles.dropdown}
              role="presentation"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
            >
              <div className={styles.searchWrap}>
                <Search className={styles.searchIcon} size={16} strokeWidth={2.25} aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={countryQuery}
                  onChange={(e) => setCountryQuery(e.target.value)}
                  onKeyDown={handleCountryKeyDown}
                  placeholder={withSearchEllipsis('Buscar país')}
                  className={styles.searchInput}
                  autoComplete="off"
                  aria-label="Buscar país"
                />
              </div>
              <ul role="listbox" className={styles.list} aria-label="Países">
                {filteredCountries.length > 0 ? (
                  filteredCountries.map((c, index) => (
                    <li key={c.iso} role="option" aria-selected={c.iso === countryIso}>
                      <button
                        type="button"
                        className={cx(
                          styles.option,
                          c.iso === countryIso && styles.optionSelected,
                          index === highlightIndex && styles.optionHighlighted,
                        )}
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => handleSelectCountry(c)}
                      >
                        <span className={styles.optionFlag} aria-hidden>
                          {flagEmoji(c.iso)}
                        </span>
                        <span className={styles.optionBody}>
                          <span className={styles.optionName}>{c.name}</span>
                          <span className={styles.optionDial}>{c.dialCode}</span>
                        </span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className={styles.empty}>Sin resultados</li>
                )}
              </ul>
            </div>
            </Portal>
          )}
        </div>
        <input
          id={`${id}-number`}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          disabled={disabled}
          value={displayNational}
          placeholder={placeholder}
          onChange={(e) => handleNationalChange(e.target.value)}
          className={styles.numberInput}
          aria-invalid={required && !valid}
        />
      </div>
      {required && (
        <input
          tabIndex={-1}
          className={styles.hiddenRequired}
          value={value}
          required
          onChange={() => {}}
          aria-hidden
        />
      )}
    </div>
  );
}
