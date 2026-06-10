import { Plus, CircleMinus } from 'lucide-react';
import type { ClientCustomFieldEntry } from '@shared/types';
import { Input } from '@/components/forms';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ClientCustomFieldsEditor.module.css';

type ClientCustomFieldsEditorProps = {
  entries: ClientCustomFieldEntry[];
  onChange: (entries: ClientCustomFieldEntry[]) => void;
  /** Sin borde superior ni título propio (p. ej. dentro de una sección del modal). */
  embedded?: boolean;
};

function newEntry(): ClientCustomFieldEntry {
  return { name: '', value: '' };
}

export default function ClientCustomFieldsEditor({
  entries,
  onChange,
  embedded = false,
}: ClientCustomFieldsEditorProps) {
  const addEntry = () => onChange([...entries, newEntry()]);

  const updateEntry = (index: number, patch: Partial<ClientCustomFieldEntry>) => {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  return (
    <section
      className={cx(styles.section, embedded && styles.sectionEmbedded)}
      aria-labelledby={embedded ? undefined : 'client-custom-fields-title'}
    >
      <div className={styles.header}>
        <div>
          {!embedded && (
            <h4 id="client-custom-fields-title" className={styles.title}>
              Columnas personalizadas
            </h4>
          )}
          <p className={cx(styles.hint, embedded && styles.hintEmbedded)}>
            Añade variables con nombre y valor para este contacto.
          </p>
        </div>
        <button type="button" onClick={addEntry} className={styles.addBtn}>
          <Plus size={16} aria-hidden />
          Añadir columna
        </button>
      </div>

      {entries.length > 0 && (
        <div className={styles.list}>
          {entries.map((entry, index) => (
            <div key={index} className={styles.row}>
              <div className={ui.formGrid2}>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`custom-field-name-${index}`}>
                    Columna
                  </label>
                  <Input
                    id={`custom-field-name-${index}`}
                    type="text"
                    value={entry.name}
                    onChange={(e) => updateEntry(index, { name: e.target.value })}
                    placeholder="Nombre de la variable"
                  />
                </div>
                <div className={ui.field}>
                  <label className={ui.label} htmlFor={`custom-field-value-${index}`}>
                    Valor
                  </label>
                  <Input
                    id={`custom-field-value-${index}`}
                    type="text"
                    value={entry.value}
                    onChange={(e) => updateEntry(index, { value: e.target.value })}
                    placeholder="Valor"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeEntry(index)}
                className={cx(ui.btnIcon, styles.removeBtn)}
                aria-label={`Eliminar columna ${entry.name || index + 1}`}
              >
                <CircleMinus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
