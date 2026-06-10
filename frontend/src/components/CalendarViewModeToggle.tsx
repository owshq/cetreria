import {
  CALENDAR_VIEW_MODES,
  type CalendarViewMode,
} from '@/lib/calendarViewMode';
import { cx } from '@/lib/cx';
import calendarStyles from '@/pages/Calendar.module.css';

type CalendarViewModeToggleProps = {
  value: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
  /** Por defecto: "Vista del calendario" */
  ariaLabel?: string;
  className?: string;
};

export default function CalendarViewModeToggle({
  value,
  onChange,
  ariaLabel = 'Vista del calendario',
  className,
}: CalendarViewModeToggleProps) {
  return (
    <div
      className={cx(calendarStyles.viewToggle, className)}
      role="group"
      aria-label={ariaLabel}
    >
      {CALENDAR_VIEW_MODES.map(({ id, label, short }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cx(calendarStyles.viewPill, value === id && calendarStyles.viewPillActive)}
          aria-label={label}
          aria-pressed={value === id}
          title={label}
        >
          <span className={calendarStyles.viewPillLabel}>{label}</span>
          <span className={calendarStyles.viewPillLabelShort}>{short}</span>
        </button>
      ))}
    </div>
  );
}
