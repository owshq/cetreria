import { readLocalStorageFor, writeLocalStorageFor } from '@/lib/storageKeys';

export const SECONDARY_SIDEBAR_MIN_WIDTH_REM = 14;
export const SECONDARY_SIDEBAR_MAX_WIDTH_REM = 24;

export function remToPx(rem: number): number {
  if (typeof document === 'undefined') {
    return Math.round(rem * 16);
  }
  const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(rem * fontSize);
}

function readRootLengthPx(variableName: string, fallbackRem: number): number {
  if (typeof document === 'undefined') {
    return remToPx(fallbackRem);
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  if (raw.endsWith('rem')) {
    return remToPx(parseFloat(raw));
  }
  if (raw.endsWith('px')) {
    return Math.round(parseFloat(raw));
  }
  return remToPx(fallbackRem);
}

export function getSecondarySidebarMinWidthPx(): number {
  return readRootLengthPx('--layout-secondary-sidebar-width-expanded', SECONDARY_SIDEBAR_MIN_WIDTH_REM);
}

export function getSecondarySidebarMaxWidthPx(): number {
  return readRootLengthPx('--layout-secondary-sidebar-width-max', SECONDARY_SIDEBAR_MAX_WIDTH_REM);
}

export function clampSecondarySidebarWidthPx(px: number): number {
  const min = getSecondarySidebarMinWidthPx();
  const max = getSecondarySidebarMaxWidthPx();
  return Math.min(Math.max(Math.round(px), min), max);
}

export function readStoredSecondarySidebarWidthPx(): number | null {
  const raw = readLocalStorageFor('secondarySidebarWidth');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function writeStoredSecondarySidebarWidthPx(px: number): void {
  writeLocalStorageFor('secondarySidebarWidth', String(clampSecondarySidebarWidthPx(px)));
}

export type ResolveExpandedSecondarySidebarWidthOptions = {
  /** When no width is stored yet, use the layout maximum instead of the minimum. */
  defaultToMax?: boolean;
};

export function resolveExpandedSecondarySidebarWidth(
  options?: ResolveExpandedSecondarySidebarWidthOptions,
): string {
  const stored = readStoredSecondarySidebarWidthPx();
  const defaultPx = options?.defaultToMax
    ? getSecondarySidebarMaxWidthPx()
    : getSecondarySidebarMinWidthPx();
  const px = stored != null ? clampSecondarySidebarWidthPx(stored) : defaultPx;
  return `${px}px`;
}

export function parseSecondarySidebarWidthCss(value: string): number {
  if (!value || value === '0') return 0;
  const pxMatch = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (pxMatch) return clampSecondarySidebarWidthPx(Number.parseFloat(pxMatch[1]!));
  return getSecondarySidebarMinWidthPx();
}

export function isSecondarySidebarExpanded(width: string): boolean {
  return parseSecondarySidebarWidthCss(width) > 0;
}
