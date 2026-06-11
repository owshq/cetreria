import type { ColorScheme } from '@/lib/colorScheme';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  readLocalStorageFor,
  writeLocalStorageFor,
} from '@/lib/storageKeys';
import {
  readWorkspaceScopedStorage,
  removeWorkspaceScopedStorage,
  writeWorkspaceScopedStorage,
} from '@/lib/workspaceStorage';

/** Logo completo de marca — logo de carga por defecto (mismo asset que login modo claro). */
export const DEFAULT_APP_LOGO_LIGHT = '/logo_login.png';
/** @deprecated Usar DEFAULT_APP_LOGO_LIGHT. Mismo asset en claro y oscuro. */
export const DEFAULT_APP_LOGO_DARK = DEFAULT_APP_LOGO_LIGHT;
/** Pájaro blanco, sin texto — sidebar colapsado (solo icono). */
export const DEFAULT_APP_LOGO_ON_ACCENT_ICON = '/logo_white.png';
/** Logo completo blanco con texto — sidebar expandido (fondo transparente). */
export const DEFAULT_APP_LOGO_ON_ACCENT = '/logo_login_dark.png';
/** Logo completo de marca — login modo claro (fondo transparente). */
export const DEFAULT_APP_LOGO_LOGIN = '/logo_login.png';
/** Logo completo de marca — login modo oscuro (blanco, fondo transparente). */
export const DEFAULT_APP_LOGO_LOGIN_DARK = '/logo_login_dark.png';

export type AppLogoVariant = 'light' | 'dark' | 'onAccent' | 'login';
export type AppLogoSize = 'sm' | 'md' | 'lg';

export const DEFAULT_APP_LOGO_SIZE: AppLogoSize = 'md';

export const APP_LOGO_SIZE_LABELS: Record<AppLogoSize, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
};

export const APP_LOGO_SIZE_DIMENSIONS: Record<AppLogoSize, string> = {
  sm: '2.25rem',
  md: '3rem',
  lg: '3.75rem',
};

/** Altura del wordmark en sidebar (mas compacto que el icono cuadrado). */
export const APP_LOGO_WORDMARK_HEIGHTS: Record<AppLogoSize, string> = {
  sm: '2rem',
  md: '2.5rem',
  lg: '3rem',
};

export const APP_LOGO_HEADER_PADDING: Record<
  AppLogoSize,
  { top: string; bottom: string }
> = {
  sm: { top: '0.5rem', bottom: '0.375rem' },
  md: { top: '0.75rem', bottom: '0.625rem' },
  lg: { top: '1rem', bottom: '0.75rem' },
};

const LOGO_STORAGE_PART: Record<AppLogoVariant, string> = {
  light: 'app_logo_light',
  dark: 'app_logo_dark',
  onAccent: 'app_logo_on_accent',
  login: 'app_logo_login',
};

function defaultLogoFor(variant: AppLogoVariant): string {
  if (variant === 'light') return DEFAULT_APP_LOGO_LIGHT;
  if (variant === 'dark') return DEFAULT_APP_LOGO_LOGIN_DARK;
  if (variant === 'login') return DEFAULT_APP_LOGO_LOGIN;
  return DEFAULT_APP_LOGO_ON_ACCENT;
}

export function getDefaultAppLogoUrl(variant: AppLogoVariant): string {
  return defaultLogoFor(variant);
}

export function isValidAppLogoSrc(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed);
}

function resolveStoredAppLogoUrl(
  stored: string | null,
  variant: AppLogoVariant,
): string {
  if (stored === null) {
    return defaultLogoFor(variant);
  }
  if (!isValidAppLogoSrc(stored)) {
    return defaultLogoFor(variant);
  }
  return stored.trim();
}

export function getAppLogoOnAccent(): string {
  return getAppLogoUrl('onAccent');
}

export function getAppLogoLogin(): string {
  return getAppLogoUrl('login');
}

export function getAppLogoLoginDark(): string {
  return getAppLogoUrl('dark');
}

export function getAppLogoUrl(variant: AppLogoVariant): string {
  return resolveStoredAppLogoUrl(
    readWorkspaceScopedStorage(LOGO_STORAGE_PART[variant]),
    variant,
  );
}

export function getAppLogoForScheme(_scheme: ColorScheme): string {
  return getAppLogoUrl('light');
}

export function hasCustomAppLogo(variant: AppLogoVariant): boolean {
  const stored = readWorkspaceScopedStorage(LOGO_STORAGE_PART[variant]);
  return stored !== null && isValidAppLogoSrc(stored);
}

export function setAppLogo(variant: AppLogoVariant, dataUrl: string): void {
  writeWorkspaceScopedStorage(dataUrl, LOGO_STORAGE_PART[variant]);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appLogoUpdated));
}

export function resetAppLogo(variant: AppLogoVariant): void {
  removeWorkspaceScopedStorage(LOGO_STORAGE_PART[variant]);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appLogoUpdated));
}

function parseAppLogoSize(value: string | null): AppLogoSize {
  if (value === 'sm' || value === 'md' || value === 'lg') {
    return value;
  }
  return DEFAULT_APP_LOGO_SIZE;
}

export function getAppLogoSize(): AppLogoSize {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_APP_LOGO_SIZE;
  }
  return parseAppLogoSize(readLocalStorageFor('appLogoSize'));
}

export function applyAppLogoSize(size: AppLogoSize = getAppLogoSize()): void {
  if (typeof document === 'undefined') {
    return;
  }

  const padding = APP_LOGO_HEADER_PADDING[size];
  document.documentElement.style.setProperty('--app-logo-size', APP_LOGO_SIZE_DIMENSIONS[size]);
  document.documentElement.style.setProperty(
    '--app-logo-wordmark-height',
    APP_LOGO_WORDMARK_HEIGHTS[size],
  );
  document.documentElement.style.setProperty('--app-logo-header-padding-top', padding.top);
  document.documentElement.style.setProperty(
    '--app-logo-header-padding-bottom',
    padding.bottom,
  );
  document.documentElement.setAttribute('data-app-logo-size', size);
}

export function setAppLogoSize(size: AppLogoSize): void {
  writeLocalStorageFor('appLogoSize', size);
  applyAppLogoSize(size);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appLogoSizeUpdated, { detail: size }));
}
