import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cx } from '@/lib/cx';
import { withSearchEllipsis } from '@/lib/searchPlaceholder';
import forms from '@/styles/forms.module.css';

type SearchFieldProps = ComponentPropsWithoutRef<'input'> & {
  iconSize?: number;
  trailing?: ReactNode;
  wrapperClassName?: string;
};

const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { className, wrapperClassName, iconSize = 16, trailing, placeholder = 'Buscar', ...props },
  ref,
) {
  return (
    <div className={wrapperClassName ? cx(forms.searchShell, wrapperClassName) : forms.searchShell}>
      <Search className={forms.searchIcon} size={iconSize} strokeWidth={2.25} aria-hidden />
      <input
        ref={ref}
        type="search"
        className={cx(forms.searchControl, className)}
        placeholder={withSearchEllipsis(placeholder)}
        {...props}
      />
      {trailing}
    </div>
  );
});

export default SearchField;
