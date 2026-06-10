import { useCallback, useEffect, useState } from 'react';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  getAppLogoForScheme,
  getAppLogoOnAccent,
  getAppLogoSize,
  getDefaultAppLogoUrl,
  type AppLogoSize,
  type AppLogoVariant,
} from '@/lib/appLogo';
import { useTheme } from '@/context/ThemeContext';
import type { ColorScheme } from '@/lib/colorScheme';
import { cx } from '@/lib/cx';
import styles from './BrandLogo.module.css';

type BrandLogoTone = 'default' | 'onAccent' | 'login';

type BrandLogoProps = {
  size?: AppLogoSize;
  collapsed?: boolean;
  tone?: BrandLogoTone;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

function resolveLogoVariant(tone: BrandLogoTone, scheme: ColorScheme): AppLogoVariant {
  if (tone === 'onAccent' || tone === 'login') return 'onAccent';
  return scheme;
}

function resolveLogoUrl(tone: BrandLogoTone, scheme: ColorScheme) {
  if (tone === 'onAccent' || tone === 'login') return getAppLogoOnAccent();
  return getAppLogoForScheme(scheme);
}

export default function BrandLogo({
  size,
  collapsed = false,
  tone = 'default',
  className,
  onClick,
  ariaLabel,
}: BrandLogoProps) {
  const { colorScheme } = useTheme();
  const logoVariant = resolveLogoVariant(tone, colorScheme);
  const [displaySrc, setDisplaySrc] = useState(() => resolveLogoUrl(tone, colorScheme));
  const [usingFallback, setUsingFallback] = useState(false);
  const [configuredSize, setConfiguredSize] = useState(getAppLogoSize);
  const resolvedSize = size ?? configuredSize;

  const syncLogoUrl = useCallback(() => {
    setDisplaySrc(resolveLogoUrl(tone, colorScheme));
    setUsingFallback(false);
  }, [colorScheme, tone]);

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
    const fallback = getDefaultAppLogoUrl(logoVariant);
    if (!usingFallback && displaySrc !== fallback) {
      setDisplaySrc(fallback);
      setUsingFallback(true);
    }
  }, [displaySrc, logoVariant, usingFallback]);

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
    (tone === 'onAccent' || tone === 'login') && styles.logoBoxOnAccent,
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
        tone === 'login' && colorScheme === 'light' && styles.logoLoginBlackBird,
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
