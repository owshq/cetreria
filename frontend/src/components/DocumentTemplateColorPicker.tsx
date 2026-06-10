import { DOCUMENT_TEMPLATE_COLOR_PRESETS } from '@shared/types';
import { cx } from '@/lib/cx';
import styles from './DocumentTemplateColorPicker.module.css';

type DocumentTemplateColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
};

export default function DocumentTemplateColorPicker({
  value,
  onChange,
}: DocumentTemplateColorPickerProps) {
  return (
    <div className={styles.colorRow}>
      {DOCUMENT_TEMPLATE_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          className={cx(styles.colorSwatch, value === color && styles.colorSwatchActive)}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          aria-label={`Color de plantilla ${color}`}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.colorInput}
        title="Color personalizado de la plantilla"
      />
    </div>
  );
}
