import {
  forwardRef,
  useEffect,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type FocusEvent,
} from 'react';
import { cx } from '@/lib/cx';
import forms from '@/styles/forms.module.css';

const TIME_24H_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function formatTimeTypingValue(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeOnBlur(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (TIME_24H_RE.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const candidate = `0${digits.slice(0, 1)}:${digits.slice(1)}`;
    if (TIME_24H_RE.test(candidate)) return candidate;
  }
  if (digits.length === 4) {
    const candidate = `${digits.slice(0, 2)}:${digits.slice(2)}`;
    if (TIME_24H_RE.test(candidate)) return candidate;
  }
  if (digits.length >= 1 && digits.length <= 2) {
    const candidate = `${digits.padStart(2, '0')}:00`;
    if (TIME_24H_RE.test(candidate)) return candidate;
  }
  return null;
}

type InputProps = ComponentPropsWithoutRef<'input'> & {
  large?: boolean;
};

type TimeInput24Props = Omit<InputProps, 'type' | 'step'>;

const TimeInput24 = forwardRef<HTMLInputElement, TimeInput24Props>(function TimeInput24(
  { className, large = false, value = '', onChange, onBlur, lang, ...props },
  ref,
) {
  const [text, setText] = useState(typeof value === 'string' ? value : '');

  useEffect(() => {
    setText(typeof value === 'string' ? value : '');
  }, [value]);

  const emitChange = (next: string) => {
    if (!onChange) return;
    onChange({
      target: { value: next },
      currentTarget: { value: next },
    } as ChangeEvent<HTMLInputElement>);
  };

  return (
    <span lang={lang ?? 'en-GB'} className={forms.timeInput24Shell}>
      <input
        ref={ref}
        type="text"
        lang={lang ?? 'en-GB'}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:mm"
        maxLength={5}
        spellCheck={false}
        className={cx(forms.control, large && forms.controlLarge, forms.controlTime24h, className)}
        value={text}
        onChange={(event) => {
          const next = formatTimeTypingValue(event.target.value);
          setText(next);
          if (TIME_24H_RE.test(next)) emitChange(next);
        }}
        onBlur={(event) => {
          const normalized = normalizeTimeOnBlur(text);
          if (normalized) {
            setText(normalized);
            if (normalized !== value) emitChange(normalized);
          } else {
            setText(typeof value === 'string' ? value : '');
          }
          onBlur?.(event);
        }}
        {...props}
      />
    </span>
  );
});

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, large = false, type, lang, step, ...props },
  ref,
) {
  if (type === 'time') {
    return (
      <TimeInput24
        ref={ref}
        className={className}
        large={large}
        lang={lang ?? 'en-GB'}
        {...props}
      />
    );
  }

  return (
    <input
      ref={ref}
      type={type}
      lang={lang}
      step={step}
      className={cx(forms.control, large && forms.controlLarge, className)}
      {...props}
    />
  );
});

export default Input;
