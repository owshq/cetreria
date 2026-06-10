import { cx } from '@/lib/cx';
import styles from './ClientLogo.module.css';

type ClientLogoProps = {
  logoUrl: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  alt?: string;
};

export default function ClientLogo({
  logoUrl,
  className,
  size = 'md',
  alt = '',
}: ClientLogoProps) {
  if (!logoUrl.trim()) return null;

  return (
    <img
      src={logoUrl}
      alt={alt}
      className={cx(styles.logo, styles[size], className)}
    />
  );
}
