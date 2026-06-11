import BrandLogo from '@/components/BrandLogo';
import { cx } from '@/lib/cx';
import styles from './ContentLoading.module.css';

type ContentLoadingProps = {
  className?: string;
  label?: string;
};

export default function ContentLoading({
  className,
  label = 'Cargando',
}: ContentLoadingProps) {
  return (
    <div
      className={cx(styles.root, className)}
      role="status"
      aria-live="polite"
      aria-busy
      aria-label={label}
    >
      <div className={styles.logoWrap}>
        <BrandLogo tone="loading" size="lg" className={styles.logo} />
      </div>
    </div>
  );
}
