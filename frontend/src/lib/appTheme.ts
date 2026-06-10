import {
  readLocalStorageFor,
  removeLocalStorageFor,
  writeLocalStorageFor,
} from './storageKeys';
import { APP_EVENTS } from './appEvents';

/** Verde oscuro por defecto (green-800). */
export const DEFAULT_APP_ACCENT = '#166534';

/** Tonos verdes disponibles en Apariencia. */
export const APP_ACCENT_COLOR_PRESETS = [
  '#14532d',
  '#166534',
  '#15803d',
  '#16a34a',
  '#22c55e',
  '#065f46',
  '#047857',
  '#059669',
  '#10b981',
  '#4ade80',
] as const;

function normalizeHex(color: string): string {
  return color.trim().toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex).replace('#', '');
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
  return [r, g, b];
}

function colorDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return Number.POSITIVE_INFINITY;
  const [r1, g1, b1] = rgbA;
  const [r2, g2, b2] = rgbB;
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

export function normalizeAppAccentColor(color: string): string {
  const normalized = normalizeHex(color);
  const preset = APP_ACCENT_COLOR_PRESETS.find((candidate) => candidate === normalized);
  if (preset) return preset;

  let nearest = DEFAULT_APP_ACCENT;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of APP_ACCENT_COLOR_PRESETS) {
    const distance = colorDistance(normalized, candidate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = candidate;
    }
  }
  return nearest;
}

export function getAppAccentColor(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_APP_ACCENT;
  const stored = readLocalStorageFor('appAccent');
  if (!stored) return DEFAULT_APP_ACCENT;
  return normalizeAppAccentColor(stored);
}

export function setAppAccentColor(color: string): void {
  const normalized = normalizeAppAccentColor(color);
  writeLocalStorageFor('appAccent', normalized);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appAccentUpdated, { detail: normalized }));
}

export function resetAppAccentColor(): void {
  removeLocalStorageFor('appAccent');
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appAccentUpdated, { detail: DEFAULT_APP_ACCENT }));
}

/** Persiste el acento normalizado si el valor guardado ya no es un verde permitido. */
export function migrateAppAccentColor(): void {
  if (typeof localStorage === 'undefined') return;
  const stored = readLocalStorageFor('appAccent');
  if (!stored) return;
  const normalized = normalizeAppAccentColor(stored);
  if (normalizeHex(stored) !== normalized) {
    writeLocalStorageFor('appAccent', normalized);
  }
}
