import { DEFAULT_APP_ACCENT, getAppAccentColor } from './appTheme';
import { readLocalStorageFor, removeLocalStorageFor, writeLocalStorageFor } from './storageKeys';
import { APP_EVENTS } from './appEvents';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'auto' | 'light' | 'dark';

export type ThemeUpdateDetail = {
  preference: ThemePreference;
  resolved: ColorScheme;
};

const NEAR_BLACK_THRESHOLD = 40;

/** Re-evaluate auto theme every minute (next sync period). */
export const AUTO_THEME_SYNC_MS = 60_000;

const DARK_HOUR_START = 20;
const DARK_HOUR_END = 7;

function isNearBlack(color: string): boolean {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return false;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return r <= NEAR_BLACK_THRESHOLD && g <= NEAR_BLACK_THRESHOLD && b <= NEAR_BLACK_THRESHOLD;
}

function getEffectiveAccent(colorScheme: ColorScheme, accent: string): string {
  if (colorScheme === 'dark' && isNearBlack(accent)) {
    return '#fafafa';
  }
  return accent;
}

function readStoredPreference(): ThemePreference | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = readLocalStorageFor('themePreference');
  if (stored === 'auto' || stored === 'light' || stored === 'dark') {
    return stored;
  }
  return null;
}

function migrateLegacyPreference(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const legacy = readLocalStorageFor('colorSchemeLegacy');
  if (legacy === 'dark') return 'dark';
  if (legacy === 'light') return 'light';
  return 'auto';
}

export function getThemePreference(): ThemePreference {
  return readStoredPreference() ?? migrateLegacyPreference();
}

/** Dark between 20:00 and 06:59 using local PC clock (NTP/internet-synced). */
export function isDarkByLocalTime(now = new Date()): boolean {
  const hour = now.getHours();
  return hour >= DARK_HOUR_START || hour < DARK_HOUR_END;
}

export function resolveAutoColorScheme(now = new Date()): ColorScheme {
  return isDarkByLocalTime(now) ? 'dark' : 'light';
}

export function getResolvedColorScheme(
  preference: ThemePreference = getThemePreference(),
  now = new Date(),
): ColorScheme {
  if (preference === 'auto') {
    return resolveAutoColorScheme(now);
  }
  return preference;
}

export function getColorScheme(): ColorScheme {
  return getResolvedColorScheme();
}

function dispatchThemeUpdated(detail: ThemeUpdateDetail): void {
  window.dispatchEvent(new CustomEvent<ThemeUpdateDetail>(APP_EVENTS.colorSchemeUpdated, { detail }));
}

export function syncAccentForColorScheme(
  accent: string = getAppAccentColor(),
  resolved: ColorScheme = getResolvedColorScheme(),
): void {
  const effectiveAccent = getEffectiveAccent(resolved, accent);
  document.documentElement.style.setProperty('--app-accent', effectiveAccent);
}

export function applyColorScheme(
  resolved: ColorScheme = getResolvedColorScheme(),
): void {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
  syncAccentForColorScheme(getAppAccentColor(), resolved);
}

export function setThemePreference(preference: ThemePreference): ThemeUpdateDetail {
  if (typeof localStorage !== 'undefined') {
    writeLocalStorageFor('themePreference', preference);
    removeLocalStorageFor('colorSchemeLegacy');
  }

  const resolved = getResolvedColorScheme(preference);
  applyColorScheme(resolved);

  const detail: ThemeUpdateDetail = { preference, resolved };
  dispatchThemeUpdated(detail);
  return detail;
}

/** @deprecated Use setThemePreference */
export function setColorScheme(scheme: ColorScheme): ThemeUpdateDetail {
  return setThemePreference(scheme);
}

export function toggleManualColorScheme(): ThemeUpdateDetail {
  const resolved = getResolvedColorScheme();
  const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
  return setThemePreference(next);
}

/** @deprecated Use toggleManualColorScheme */
export function toggleColorScheme(): ColorScheme {
  return toggleManualColorScheme().resolved;
}

export function syncAutoColorScheme(now = new Date()): ThemeUpdateDetail | null {
  const preference = getThemePreference();
  if (preference !== 'auto') {
    return null;
  }

  const resolved = getResolvedColorScheme('auto', now);
  const current = document.documentElement.getAttribute('data-theme');
  applyColorScheme(resolved);

  if (current !== resolved) {
    const detail: ThemeUpdateDetail = { preference: 'auto', resolved };
    dispatchThemeUpdated(detail);
    return detail;
  }

  return { preference: 'auto', resolved };
}

export function getStoredAccentOrDefault(): string {
  return getAppAccentColor() || DEFAULT_APP_ACCENT;
}

/** Inline bootstrap (index.html) — keep in sync with resolveAutoColorScheme. */
export function resolveThemeForBootstrap(): ColorScheme {
  const preference = getThemePreference();
  return getResolvedColorScheme(preference);
}
