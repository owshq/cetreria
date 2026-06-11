import { useCallback, useEffect, useState } from 'react';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  getAppLogoUrl,
  getAppLogoOnAccent,
  getAppLogoSize,
  getDefaultAppLogoUrl,
  type AppLogoSize,
} from '@/lib/appLogo';
import { useTheme } from '@/context/ThemeContext';
import type { ColorScheme } from '@/lib/colorScheme';
import { cx } from '@/lib/cx';
import styles from './BrandLogo.module.css';

type BrandLogoTone = 'default' | 'onAccent' | 'login' | 'loading';

type BrandLogoProps = {
  size?: AppLogoSize;
  collapsed?: boolean;
  tone?: BrandLogoTone;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** En superficies claras (p. ej. topbar), usa wordmark a color en tema claro. */
  adaptToColorScheme?: boolean;
};

function resolveLogoUrl(
  tone: BrandLogoTone,
  collapsed: boolean,
  colorScheme: ColorScheme,
  adaptToColorScheme: boolean,
) {
  if (tone === 'loading') {
    return getAppLogoUrl('light');
  }
  if (tone === 'login') {
    return colorScheme === 'dark' ? getAppLogoUrl('dark') : getAppLogoUrl('login');
  }
  if (tone === 'onAccent') {
    if (adaptToColorScheme) {
      return colorScheme === 'dark' ? getAppLogoUrl('dark') : getAppLogoUrl('login');
    }
    return getAppLogoOnAccent();
  }
  return getAppLogoUrl('light');
}

export default function BrandLogo({
  size,
  collapsed = false,
  tone = 'default',
  className,
  onClick,
  ariaLabel,
  adaptToColorScheme = false,
}: BrandLogoProps) {
  const { colorScheme } = useTheme();
  const [displaySrc, setDisplaySrc] = useState(() =>
    resolveLogoUrl(tone, collapsed, colorScheme, adaptToColorScheme),
  );
  const [usingFallback, setUsingFallback] = useState(false);
  const [configuredSize, setConfiguredSize] = useState(getAppLogoSize);
  const resolvedSize = size ?? configuredSize;

  const syncLogoUrl = useCallback(() => {
    setDisplaySrc(resolveLogoUrl(tone, collapsed, colorScheme, adaptToColorScheme));
    setUsingFallback(false);
  }, [adaptToColorScheme, collapsed, colorScheme, tone]);

  useEffect(() => {
    syncLogoUrl();
  }, [syncLogoUrl]);

  useEffect(() => {
    window.addEventListener(APP_EVENTS.appLogoUpdated, syncLogoUrl);
    window.addEventListener(APP_EVENTS.authSessionChanged, syncLogoUrl);
    return () => {
      window.removeEventListener(APP_EVENTS.appLogoUpdated, syncLogoUrl);
      window.removeEventListener(APP_EVENTS.authSessionChanged, syncLogoUrl);
    };
  }, [syncLogoUrl]);

  const handleImageError = useCallback(() => {
    const fallback =
      tone === 'loading'
        ? getDefaultAppLogoUrl('light')
        : tone === 'login'
        ? getDefaultAppLogoUrl(colorScheme === 'dark' ? 'dark' : 'login')
        : tone === 'onAccent' && adaptToColorScheme
          ? getDefaultAppLogoUrl(colorScheme === 'dark' ? 'dark' : 'login')
          : tone === 'onAccent'
            ? getDefaultAppLogoUrl('onAccent')
            : getDefaultAppLogoUrl('light');
    if (!usingFallback && displaySrc !== fallback) {
      setDisplaySrc(fallback);
      setUsingFallback(true);
    }
  }, [adaptToColorScheme, collapsed, colorScheme, displaySrc, tone, usingFallback]);

  useEffect(() => {
    const syncSize = () => setConfiguredSize(getAppLogoSize());
    window.addEventListener(APP_EVENTS.appLogoSizeUpdated, syncSize);
    return () => window.removeEventListener(APP_EVENTS.appLogoSizeUpdated, syncSize);
  }, []);

  const boxClass = cx(
    styles.logoBox,
    resolvedSize === 'sm' && styles.logoBoxSm,
    resolvedSize === 'md' && styles.logoBoxMd,
    resolvedSize === 'lg' && styles.logoBoxLg,
    collapsed && styles.logoBoxCollapsed,
    tone === 'onAccent' && styles.logoBoxOnAccent,
    (tone === 'login' || tone === 'loading') && styles.logoBoxLogin,
    (tone === 'login' || tone === 'loading') &&
      resolvedSize === 'lg' &&
      styles.logoBoxLoginLg,
    onClick && styles.logoBtn,
    className,
  );

  const img = (
    <img
      key={displaySrc}
      src={displaySrc}
      alt=""
      className={cx(
        styles.logo,
        (tone === 'login' || tone === 'loading') && styles.logoLoginImage,
        tone === 'onAccent' && styles.logoOnAccentImage,
      )}
      loading="eager"
      decoding="async"
      onError={handleImageError}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={boxClass}
        aria-label={ariaLabel ?? 'Colapsar men\u00fa'}
        title={ariaLabel}
      >
        {img}
      </button>
    );
  }

  return <div className={boxClass}>{img}</div>;
}
