import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cx } from '@/lib/cx';
import forms from '@/styles/forms.module.css';

type PasswordFieldProps = ComponentPropsWithoutRef<'input'> & {
  trailing?: ReactNode;
};

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  { className, trailing, ...props },
  ref,
) {
  return (
    <div className={forms.passwordShell}>
      <input ref={ref} className={cx(forms.passwordControl, className)} {...props} />
      {trailing}
    </div>
  );
});

export default PasswordField;
