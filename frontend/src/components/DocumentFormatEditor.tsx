import { useMemo } from 'react';
import { ArrowDown, ArrowUp, CircleMinus, Plus } from 'lucide-react';
import type { Document } from '@shared/types';
import {
  buildDocumentDisplayNamePreview,
  buildDocumentNumberPreview,
  DOCUMENT_FORMAT_SEPARATOR,
  DOCUMENT_NAME_FORMAT_COMPONENT_LABELS,
  DOCUMENT_NUMBER_FORMAT_COMPONENT_LABELS,
  type DocumentFormatComponent,
  type DocumentNameFormatComponentType,
  type DocumentNumberFormatComponentType,
  type WorkspaceDocumentFormats,
} from '@shared/types';
import { Input } from '@/components/forms';
import SelectMenu, { type SelectMenuOption } from '@/components/SelectMenu';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './DocumentFormatEditor.module.css';

type DocumentFormatEditorProps = {
  value: WorkspaceDocumentFormats;
  onChange: (value: WorkspaceDocumentFormats) => void;
  activeType: Document['type'];
  hideTitle?: boolean;
};

const DOCUMENT_TYPE_OPTIONS: Array<{ value: Document['type']; label: string }> = [
  { value: 'invoice', label: 'Factura' },
  { value: 'delivery-note', label: 'Albarán' },
];

type DocumentTypeTabsProps = {
  activeType: Document['type'];
  onChange: (type: Document['type']) => void;
};

export function DocumentTypeTabs({ activeType, onChange }: DocumentTypeTabsProps) {
  return (
    <nav className={styles.typeTabsBar} role="tablist" aria-label="Tipo de documento">
      {DOCUMENT_TYPE_OPTIONS.map(({ value: type, label }) => (
        <button
          key={type}
          type="button"
          role="tab"
          aria-selected={activeType === type}
          className={cx(styles.typeTab, activeType === type && styles.typeTabActive)}
          onClick={() => onChange(type)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

const PREVIEW_DATE = '2026-06-02';
const PREVIEW_CLIENT = 'Ejemplo Contacto S.L.';

function createNumberComponent(type: DocumentNumberFormatComponentType): DocumentFormatComponent {
  if (type === 'prefix') return { type, value: '' };
  if (type === 'counter') return { type, padding: 3 };
  if (type === 'date') return { type, datePattern: 'yyyy-MM-dd' };
  return { type };
}

function createNameComponent(type: DocumentNameFormatComponentType): DocumentFormatComponent {
  if (type === 'prefix') return { type, value: '' };
  if (type === 'date') return { type, datePattern: 'yyyy-MM-dd' };
  return { type };
}

function toSelectOptions(labels: Record<string, string>): SelectMenuOption[] {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

function moveComponent<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  return copy;
}

type FormatBlockProps = {
  title: string;
  previewLabel: string;
  preview: string;
  components: DocumentFormatComponent[];
  allowedTypes: Record<string, string>;
  onUpdate: (components: DocumentFormatComponent[]) => void;
  onAdd: () => void;
  addLabel: string;
};

function FormatBlock({
  title,
  previewLabel,
  preview,
  components,
  allowedTypes,
  onUpdate,
  onAdd,
  addLabel,
}: FormatBlockProps) {
  const typeOptions = useMemo(() => toSelectOptions(allowedTypes), [allowedTypes]);

  const renderComponentFields = (component: DocumentFormatComponent, index: number) => (
    <div key={`${component.type}-${index}`} className={styles.row}>
      <div className={ui.field}>
        <label className={ui.label}>Tipo</label>
        <SelectMenu
          value={component.type}
          onChange={(nextType) => {
            const typed = nextType as DocumentFormatComponent['type'];
            const nextComponent =
              typed in DOCUMENT_NUMBER_FORMAT_COMPONENT_LABELS
                ? createNumberComponent(typed as DocumentNumberFormatComponentType)
                : createNameComponent(typed as DocumentNameFormatComponentType);
            const next = [...components];
            next[index] = nextComponent;
            onUpdate(next);
          }}
          options={typeOptions}
          ariaLabel="Tipo de componente"
        />
      </div>

      {component.type === 'prefix' ? (
        <div className={ui.field}>
          <label className={ui.label}>Texto inicial</label>
          <Input
            value={component.value ?? ''}
            onChange={(event) => {
              const next = [...components];
              next[index] = { ...component, value: event.target.value };
              onUpdate(next);
            }}
            placeholder="F"
          />
        </div>
      ) : component.type === 'counter' ? (
        <div className={ui.field}>
          <label className={ui.label}>Dígitos</label>
          <Input
            type="number"
            min={1}
            max={8}
            value={component.padding ?? 3}
            onChange={(event) => {
              const padding = parseInt(event.target.value, 10);
              const next = [...components];
              next[index] = {
                ...component,
                padding: Number.isFinite(padding) && padding > 0 ? padding : 3,
              };
              onUpdate(next);
            }}
          />
        </div>
      ) : component.type === 'date' ? (
        <div className={ui.field}>
          <label className={ui.label}>Formato</label>
          <Input
            value={component.datePattern ?? 'yyyy-MM-dd'}
            onChange={(event) => {
              const next = [...components];
              next[index] = { ...component, datePattern: event.target.value };
              onUpdate(next);
            }}
            placeholder="yyyy-MM-dd"
          />
        </div>
      ) : (
        <div className={ui.field}>
          <label className={ui.label}>Valor</label>
          <span className={styles.staticValue}>Automático</span>
        </div>
      )}

      <div className={styles.rowActions}>
        <button
          type="button"
          className={ui.btnIcon}
          aria-label="Subir componente"
          disabled={index === 0}
          onClick={() => onUpdate(moveComponent(components, index, -1))}
        >
          <ArrowUp size={16} />
        </button>
        <button
          type="button"
          className={ui.btnIcon}
          aria-label="Bajar componente"
          disabled={index === components.length - 1}
          onClick={() => onUpdate(moveComponent(components, index, 1))}
        >
          <ArrowDown size={16} />
        </button>
        <button
          type="button"
          className={ui.btnIconDanger}
          aria-label="Eliminar componente"
          disabled={components.length <= 1}
          onClick={() => onUpdate(components.filter((_, itemIndex) => itemIndex !== index))}
        >
          <CircleMinus size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <h4 className={styles.blockTitle}>{title}</h4>
        <button type="button" className={ui.btnSecondary} onClick={onAdd}>
          <Plus size={14} aria-hidden />
          {addLabel}
        </button>
      </div>

      <div className={styles.rows}>
        {components.map((component, index) => renderComponentFields(component, index))}
      </div>

      <div className={styles.preview}>
        <span className={styles.previewLabel}>{previewLabel}</span>
        <span className={styles.previewValue}>{preview}</span>
      </div>
    </div>
  );
}

export default function DocumentFormatEditor({
  value,
  onChange,
  activeType,
  hideTitle = false,
}: DocumentFormatEditorProps) {
  const activeFormats = value[activeType];

  const numberPreview = useMemo(
    () =>
      buildDocumentNumberPreview(activeFormats.number, {
        date: PREVIEW_DATE,
        counter: 7,
      }),
    [activeFormats.number],
  );

  const namePreview = useMemo(
    () =>
      buildDocumentDisplayNamePreview(value, activeType, {
        date: PREVIEW_DATE,
        clientName: PREVIEW_CLIENT,
        counter: 7,
      }),
    [activeType, value],
  );

  const updateTypeFormats = (patch: Partial<typeof activeFormats>) => {
    onChange({
      ...value,
      [activeType]: {
        ...activeFormats,
        ...patch,
      },
    });
  };

  return (
    <div
      className={styles.editor}
      aria-labelledby={hideTitle ? undefined : 'document-format-settings-title'}
    >
      {!hideTitle && (
        <h3 id="document-format-settings-title" className={ui.pageSectionTitle}>
          Numeración y nombre de documentos
        </h3>
      )}

      <p className={ui.textMuted}>
        Configura los componentes del número y del nombre. Se unen con{' '}
        <code>{DOCUMENT_FORMAT_SEPARATOR}</code>.
      </p>

      <FormatBlock
        title="Número"
        previewLabel="Vista previa del número"
        preview={numberPreview}
        components={activeFormats.number}
        allowedTypes={DOCUMENT_NUMBER_FORMAT_COMPONENT_LABELS}
        onUpdate={(components) => updateTypeFormats({ number: components })}
        onAdd={() =>
          updateTypeFormats({
            number: [...activeFormats.number, createNumberComponent('counter')],
          })
        }
        addLabel="Añadir componente"
      />

      <FormatBlock
        title="Nombre"
        previewLabel="Vista previa del nombre"
        preview={namePreview}
        components={activeFormats.name}
        allowedTypes={DOCUMENT_NAME_FORMAT_COMPONENT_LABELS}
        onUpdate={(components) => updateTypeFormats({ name: components })}
        onAdd={() =>
          updateTypeFormats({
            name: [...activeFormats.name, createNameComponent('client')],
          })
        }
        addLabel="Añadir componente"
      />
    </div>
  );
}
