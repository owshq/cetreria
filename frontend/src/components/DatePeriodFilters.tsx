import type { ReactNode, RefObject } from 'react';
import { CalendarRange } from 'lucide-react';
import {
  DATE_PERIOD_LABELS,
  DATE_PERIOD_LABELS_SHORT,
  DATE_PERIODS,
  type DatePeriod,
  formatPeriodDisplayLabel,
  type DateRange,
} from '@shared/types';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './DatePeriodFilters.module.css';

type DatePeriodFiltersProps = {
  period: DatePeriod;
  customFrom: string;
  customTo: string;
  dateRange: DateRange;
  onPeriodChange: (period: DatePeriod) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  periodFiltersRef?: RefObject<HTMLDivElement | null>;
  invalidCustomRange?: boolean;
  compact?: boolean;
  /** Etiquetas cortas (H, S, M…) sin apilar en columna. */
  abbreviated?: boolean;
  hidePeriodLabel?: boolean;
  /** Subconjunto de periodos a mostrar (p. ej. solo presets o solo custom). */
  periods?: DatePeriod[];
  /** Muestra los campos Desde/Hasta cuando el periodo es custom. */
  showCustomDates?: boolean;
  /** Muestra el mensaje de error de rango custom inválido. */
  showError?: boolean;
  /** Título del periodo encima y filtros dentro de un panel con borde. */
  sectionLayout?: boolean;
  /** Con `sectionLayout`: solo cabecera, solo panel o ambos (defecto). */
  sectionPart?: 'full' | 'heading' | 'panel';
  /** Clases extra para el panel con borde cuando `sectionLayout` está activo. */
  panelClassName?: string;
  /** Contenido a la izquierda del título (`sectionLayout`). */
  headingStart?: ReactNode;
  /** Contenido a la derecha del título y a la izquierda de los filtros de periodo (`sectionLayout`). */
  headingTrailing?: ReactNode;
  /** Contenido a la derecha de los filtros de periodo en la fila del título (`sectionLayout`). */
  headingEnd?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export default function DatePeriodFilters({
  period,
  customFrom,
  customTo,
  dateRange,
  onPeriodChange,
  onCustomFromChange,
  onCustomToChange,
  periodFiltersRef,
  invalidCustomRange = false,
  compact = false,
  abbreviated = false,
  hidePeriodLabel = false,
  periods = DATE_PERIODS,
  showCustomDates = true,
  showError = true,
  sectionLayout = false,
  sectionPart = 'full',
  panelClassName,
  headingStart,
  headingTrailing,
  headingEnd,
  className,
  children,
}: DatePeriodFiltersProps) {
  const showAbbreviated = abbreviated || compact;
  const isCustomOnly = periods.length === 1 && periods[0] === 'custom';
  const showDates = showCustomDates && periods.includes('custom') && period === 'custom';
  const periodLabel = formatPeriodDisplayLabel(period, dateRange.from, dateRange.to);

  const periodFilters = (
    <div
      className={styles.periodFilters}
      ref={periodFiltersRef}
      role="group"
      aria-label="Periodo"
    >
      {periods.map((p) => (
        <button
          key={p}
          type="button"
          className={cx(
            styles.periodPill,
            p === 'custom' && styles.periodPillCustom,
            period === p && styles.periodPillActive,
          )}
          onClick={() => onPeriodChange(p)}
          aria-label={DATE_PERIOD_LABELS[p]}
          aria-pressed={period === p}
          title={DATE_PERIOD_LABELS[p]}
        >
          {p === 'custom' ? (
            <CalendarRange
              size={13}
              strokeWidth={2}
              className={styles.periodPillSymbol}
              aria-hidden
            />
          ) : null}
          <span className={styles.periodPillLabel}>{DATE_PERIOD_LABELS[p]}</span>
          {p !== 'custom' ? (
            <span className={styles.periodPillLabelShort}>
              {DATE_PERIOD_LABELS_SHORT[p]}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );

  const customDates = showDates ? (
    <div className={styles.customDatesRow}>
      <div className={styles.customDates}>
        <label className={styles.customDateField}>
          <span className={styles.customDateLabel}>Desde</span>
          <input
            type="date"
            className={styles.customDateInput}
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
          />
        </label>
        <label className={styles.customDateField}>
          <span className={styles.customDateLabel}>Hasta</span>
          <input
            type="date"
            className={styles.customDateInput}
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
          />
        </label>
      </div>
    </div>
  ) : null;

  const rangeError = showError && period === 'custom' && invalidCustomRange ? (
    <p className={cx(ui.alertError, styles.error)}>
      La fecha de inicio debe ser anterior o igual a la de fin.
    </p>
  ) : null;

  if (sectionLayout) {
    const sectionClassName = cx(
      ui.pageSection,
      showAbbreviated && styles.abbreviated,
      compact && styles.compact,
      className,
    );

    const headingRow = (
      <div
        className={cx(
          styles.sectionHeadingRow,
          (hidePeriodLabel || isCustomOnly) && styles.sectionHeadingRowEnd,
        )}
      >
        {headingStart ? (
          <div className={styles.sectionHeadingStart}>{headingStart}</div>
        ) : null}
        {!hidePeriodLabel && (
          <h2 className={cx(ui.pageSectionTitle, styles.sectionHeadingTitle)}>
            {periodLabel}
          </h2>
        )}

        <div className={styles.sectionHeadingEnd}>
          {headingTrailing}
          {periodFilters}
          {headingEnd}
        </div>
      </div>
    );

    if (sectionPart === 'heading') {
      return (
        <section className={sectionClassName}>
          {headingRow}
          {customDates}
          {rangeError}
        </section>
      );
    }

    if (sectionPart === 'panel') {
      return (
        <section className={sectionClassName}>
          <div className={cx(panelClassName || ui.card)}>
            {children}
          </div>
        </section>
      );
    }

    return (
      <section className={sectionClassName}>
        {headingRow}
        <div className={cx(panelClassName || ui.card)}>
          {customDates}
          {rangeError}
          {children}
        </div>
      </section>
    );
  }

  return (
    <div className={cx(showAbbreviated && styles.abbreviated, compact && styles.compact, className)}>
      <div
        className={cx(
          styles.periodHeader,
          isCustomOnly && styles.periodHeaderCustomOnly,
        )}
      >
        {!hidePeriodLabel && (
          <h2 className={cx(ui.cardTitle, styles.periodTitle)}>
            {periodLabel}
          </h2>
        )}

        {periodFilters}
      </div>

      {customDates}
      {rangeError}
    </div>
  );
}
