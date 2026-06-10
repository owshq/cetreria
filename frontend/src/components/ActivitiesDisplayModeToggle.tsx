import type { ActivitiesDisplayMode } from '@/lib/activitiesDisplayMode';
import { ACTIVITIES_DISPLAY_MODE_LABELS } from '@/lib/activitiesDisplayMode';
import { cx } from '@/lib/cx';
import calendarStyles from '@/pages/Calendar.module.css';

const VIEWS: ActivitiesDisplayMode[] = ['calendar', 'table'];

type ActivitiesDisplayModeToggleProps = {
  value: ActivitiesDisplayMode;
  onChange: (view: ActivitiesDisplayMode) => void;
  className?: string;
};

export default function ActivitiesDisplayModeToggle({
  value,
  onChange,
  className,
}: ActivitiesDisplayModeToggleProps) {
  return (
    <div
      className={cx(calendarStyles.viewToggle, className)}
      role="group"
      aria-label="Vista de actividades"
    >
      {VIEWS.map((id) => {
        const { label, short } = ACTIVITIES_DISPLAY_MODE_LABELS[id];
        return (
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
        );
      })}
    </div>
  );
}
