import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cx } from '@/lib/cx';
import forms from '@/styles/forms.module.css';

type InputProps = ComponentPropsWithoutRef<'input'> & {
  large?: boolean;
};

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, large = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(forms.control, large && forms.controlLarge, className)}
      {...props}
    />
  );
});

export default Input;
