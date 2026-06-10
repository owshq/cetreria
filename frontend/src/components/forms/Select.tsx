import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cx } from '@/lib/cx';
import forms from '@/styles/forms.module.css';

const Select = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cx(forms.selectControl, className)} {...props} />;
  },
);

export default Select;
