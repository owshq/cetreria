import { ACTIVITY_COLOR_PRESETS } from '@/lib/activityIcons';
import { cx } from '@/lib/cx';
import styles from './ColorPicker.module.css';

type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  presets?: readonly string[];
  allowCustom?: boolean;
};

export default function ColorPicker({
  value,
  onChange,
  presets = ACTIVITY_COLOR_PRESETS,
  allowCustom = true,
}: ColorPickerProps) {
  return (
    <div className={styles.colorRow}>
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          className={cx(styles.colorSwatch, value === color && styles.colorSwatchActive)}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`Color ${color}`}
        />
      ))}
      {allowCustom ? (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.colorInput}
          title="Color personalizado"
        />
      ) : null}
    </div>
  );
}
