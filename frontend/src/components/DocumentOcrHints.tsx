import { Sparkles, Check } from 'lucide-react';
import type { OcrLineSuggestion, DocumentOcrLineDraft, DocumentOcrLineField } from '@/lib/documentOcr';
import { formatDocumentAmount } from '@shared/types';
import { cx } from '@/lib/cx';
import styles from './DocumentOcrHints.module.css';

type DocumentOcrHintsProps = {
  loading: boolean;
  error: string | null;
  suggestions: OcrLineSuggestion[];
  items: DocumentOcrLineDraft[];
  getApplicableFields: (rowIndex: number, suggestion: OcrLineSuggestion) => DocumentOcrLineField[];
  onApplySuggestion: (suggestionIndex: number, rowIndex: number) => void;
  onApplyAll: () => void;
};

function formatSuggestionLabel(suggestion: OcrLineSuggestion): string {
  const qty =
    suggestion.quantity != null && suggestion.quantity > 0 && suggestion.quantity !== 1
      ? `${suggestion.quantity}  `
      : '';
  return `${suggestion.name}  ${qty}${formatDocumentAmount(suggestion.price)}`;
}

function fieldLabel(field: DocumentOcrLineField): string {
  switch (field) {
    case 'name':
      return 'concepto';
    case 'description':
      return 'descripcin';
    case 'quantity':
      return 'cantidad';
    case 'price':
      return 'precio';
    default:
      return field;
  }
}

function formatFieldValue(suggestion: OcrLineSuggestion, field: DocumentOcrLineField): string {
  switch (field) {
    case 'name':
      return suggestion.name;
    case 'description':
      return suggestion.description ?? '';
    case 'quantity':
      return String(suggestion.quantity ?? 1);
    case 'price':
      return formatDocumentAmount(suggestion.price);
    default:
      return '';
  }
}

export function DocumentOcrFieldHint({
  suggestion,
  field,
  onApply,
}: {
  suggestion: OcrLineSuggestion;
  field: DocumentOcrLineField;
  onApply: () => void;
}) {
  const value = formatFieldValue(suggestion, field);
  if (!value.trim()) return null;

  return (
    <div className={styles.fieldHint} role="note">
      <span className={styles.fieldHintLabel}>
        Detectado ({fieldLabel(field)}): <strong>{value}</strong>
      </span>
      <button type="button" className={styles.fieldHintApply} onClick={onApply}>
        <Check size={12} aria-hidden />
        Usar
      </button>
    </div>
  );
}

export default function DocumentOcrHints({
  loading,
  error,
  suggestions,
  items,
  getApplicableFields,
  onApplySuggestion,
  onApplyAll,
}: DocumentOcrHintsProps) {
  const hasApplicable = suggestions.some((suggestion) =>
    items.some((_, rowIndex) => getApplicableFields(rowIndex, suggestion).length > 0),
  );

  if (!loading && !error && suggestions.length === 0) return null;

  return (
    <div className={styles.panel} aria-live="polite">
      <div className={styles.panelHeader}>
        <Sparkles size={16} className={styles.panelIcon} aria-hidden />
        <div className={styles.panelHeading}>
          <p className={styles.panelTitle}>Lectura del documento</p>
          <p className={styles.panelSubtitle}>
            Sugerencias detectadas por OCR. No se rellenan solas: pulsa Usar o Aplicar todo.
          </p>
        </div>
      </div>

      {loading && <p className={styles.status}>Analizando el archivo</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && suggestions.length > 0 && (
        <>
          <ul className={styles.suggestionList}>
            {suggestions.map((suggestion, suggestionIndex) => {
              const targetRow = items.findIndex(
                (_, rowIndex) => getApplicableFields(rowIndex, suggestion).length > 0,
              );
              const canApply = targetRow >= 0;

              return (
                <li key={`${suggestion.name}-${suggestion.price}-${suggestionIndex}`}>
                  <span className={styles.suggestionText}>{formatSuggestionLabel(suggestion)}</span>
                  <button
                    type="button"
                    className={cx(styles.applyOneBtn, !canApply && styles.applyOneBtnDisabled)}
                    disabled={!canApply}
                    onClick={() => onApplySuggestion(suggestionIndex, targetRow)}
                  >
                    Usar
                  </button>
                </li>
              );
            })}
          </ul>
          {hasApplicable && (
            <button type="button" className={styles.applyAllBtn} onClick={onApplyAll}>
              Aplicar todo en campos vacos
            </button>
          )}
        </>
      )}

      {!loading && !error && suggestions.length === 0 && (
        <p className={styles.status}>
          No se detectaron lneas con importe. Puedes rellenar los conceptos manualmente.
        </p>
      )}
    </div>
  );
}
