import { useMemo } from 'react';
import SelectMenu, { type SelectMenuOption } from '@/components/SelectMenu';
import { cx } from '@/lib/cx';
import styles from './TimeSelect.module.css';

const HOUR_OPTIONS: SelectMenuOption[] = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, '0');
  return { value, label: value };
});

const MINUTE_OPTIONS: SelectMenuOption[] = Array.from({ length: 60 }, (_, minute) => {
  const value = String(minute).padStart(2, '0');
  return { value, label: value };
});

function parseTimeValue(value: string): { hour: string; minute: string } {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return { hour: '00', minute: '00' };
  }
  return { hour: match[1], minute: match[2] };
}

type TimeSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel: string;
};

export default function TimeSelect({
  id,
  value,
  onChange,
  disabled = false,
  className,
  ariaLabel,
}: TimeSelectProps) {
  const { hour, minute } = parseTimeValue(value);

  const minuteOptions = useMemo(() => {
    if (MINUTE_OPTIONS.some((option) => option.value === minute)) {
      return MINUTE_OPTIONS;
    }
    return [...MINUTE_OPTIONS, { value: minute, label: minute }].sort((a, b) =>
      a.value.localeCompare(b.value),
    );
  }, [minute]);

  return (
    <div
      id={id}
      className={cx(styles.root, className)}
      role="group"
      aria-label={ariaLabel}
    >
      <SelectMenu
        id={id ? `${id}-hour` : undefined}
        value={hour}
        onChange={(nextHour) => onChange(`${nextHour}:${minute}`)}
        options={HOUR_OPTIONS}
        ariaLabel="Hora"
        disabled={disabled}
        compact
        className={styles.unit}
      />
      <span className={styles.sep} aria-hidden>
        :
      </span>
      <SelectMenu
        id={id ? `${id}-minute` : undefined}
        value={minute}
        onChange={(nextMinute) => onChange(`${hour}:${nextMinute}`)}
        options={minuteOptions}
        ariaLabel="Minutos"
        disabled={disabled}
        compact
        className={styles.unit}
      />
    </div>
  );
}
