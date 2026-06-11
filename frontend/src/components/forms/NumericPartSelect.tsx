import { useEffect, useMemo, useState } from 'react';
import SelectMenu, { type SelectMenuOption } from '@/components/SelectMenu';
import Input from '@/components/forms/Input';
import { cx } from '@/lib/cx';
import styles from './NumericPartSelect.module.css';

function filterDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2);
}

function normalizeOnBlur(raw: string, max: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 0) return '';
  return String(Math.min(max, value));
}

function selectValueFor(raw: string, max: number): string {
  const normalized = normalizeOnBlur(raw, max);
  if (!normalized) return '0';
  return normalized;
}

type NumericPartSelectProps = {
  id: string;
  value: string;
  max: number;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
  onChange: (value: string) => void;
};

export default function NumericPartSelect({
  id,
  value,
  max,
  disabled = false,
  className,
  ariaLabel,
  onChange,
}: NumericPartSelectProps) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  const options = useMemo<SelectMenuOption[]>(() => {
    const base = Array.from({ length: max + 1 }, (_, index) => {
      const raw = String(index);
      return { value: raw, label: raw.padStart(2, '0') };
    });
    const current = selectValueFor(text, max);
    if (base.some((option) => option.value === current)) return base;
    return [...base, { value: current, label: current.padStart(2, '0') }].sort((a, b) =>
      Number(a.value) - Number(b.value),
    );
  }, [max, text]);

  const menuValue = selectValueFor(text, max);

  return (
    <div className={cx(styles.root, className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={2}
        className={styles.input}
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const next = filterDigits(event.target.value);
          setText(next);
          onChange(next);
        }}
        onBlur={() => {
          const normalized = normalizeOnBlur(text, max);
          setText(normalized);
          if (normalized !== value) onChange(normalized);
        }}
      />
      <SelectMenu
        id={`${id}-menu`}
        value={menuValue}
        onChange={(next) => {
          setText(next);
          onChange(next);
        }}
        options={options}
        ariaLabel={ariaLabel}
        disabled={disabled}
        compact
        iconTrigger
        menuPortal
        className={styles.menu}
      />
    </div>
  );
}
