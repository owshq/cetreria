import { useEffect, useState } from 'react';
import { ACTIVITY_COLOR_PRESETS } from '@/lib/activityIcons';
import { cx } from '@/lib/cx';
import styles from './ColorPicker.module.css';

function isSameColor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function parseHexColor(input: string): string | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null;

  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((channel) => channel + channel)
          .join('')
      : hex;

  return `#${normalized.toLowerCase()}`;
}

type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  presets?: readonly string[];
  allowCustom?: boolean;
  /** Marca visualmente el tono corporativo / predeterminado. */
  defaultColor?: string;
};

export default function ColorPicker({
  value,
  onChange,
  presets = ACTIVITY_COLOR_PRESETS,
  allowCustom = true,
  defaultColor,
}: ColorPickerProps) {
  const [hexDraft, setHexDraft] = useState(value);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  const handleHexDraftChange = (nextDraft: string) => {
    setHexDraft(nextDraft);
    const parsed = parseHexColor(nextDraft);
    if (parsed) onChange(parsed);
  };

  return (
    <div className={styles.colorRow}>
      {presets.map((color) => {
        const isActive = isSameColor(value, color);
        const isCorporate = defaultColor != null && isSameColor(defaultColor, color);

        return (
          <button
            key={color}
            type="button"
            className={cx(
              styles.colorSwatch,
              isCorporate && styles.colorSwatchCorporate,
              isActive && styles.colorSwatchActive,
            )}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={isCorporate ? `Color predeterminado ${color}` : `Color ${color}`}
            aria-pressed={isActive}
            title={isCorporate ? 'Color predeterminado' : undefined}
          />
        );
      })}
      {allowCustom ? (
        <div className={styles.colorCustom}>
          <label className={styles.colorCustomPicker} title="Elegir color">
            <span
              className={styles.colorCustomPreview}
              style={{ backgroundColor: value }}
              aria-hidden
            />
            <input
              type="color"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className={styles.colorInputHidden}
              aria-label="Elegir color"
            />
          </label>
          <input
            type="text"
            value={hexDraft}
            onChange={(event) => handleHexDraftChange(event.target.value)}
            onBlur={() => setHexDraft(value)}
            className={styles.colorHexInput}
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            placeholder="#000000"
            aria-label="Codigo hexadecimal"
          />
        </div>
      ) : null}
    </div>
  );
}
