import { DEFAULT_APP_ACCENT } from '@/lib/appTheme';

type Hsl = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(input: string): Hsl | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(hex)) return null;

  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex;

  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;

  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toByte = (value: number) =>
    Math.round(clamp(value + m, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

/** Uses the accent already resolved on :root (theme + dark-mode adjustments). */
export function getEffectiveChartAccent(): string {
  if (typeof document === 'undefined') return DEFAULT_APP_ACCENT;
  const cssAccent = getComputedStyle(document.documentElement)
    .getPropertyValue('--app-accent')
    .trim();
  return cssAccent || DEFAULT_APP_ACCENT;
}

/** Builds a distinguishable palette from the user's accent color. */
export function buildChartColorPalette(baseColor: string, count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [baseColor];

  const parsed = parseHexColor(baseColor) ?? { h: 0, s: 0, l: 0.15 };
  const baseHue = parsed.s < 0.08 ? 152 : parsed.h;
  const baseSat = parsed.s < 0.08 ? 0.58 : clamp(parsed.s, 0.42, 0.88);
  const baseLight = clamp(parsed.l, 0.22, 0.72);

  const spread = Math.min(0.28, 0.08 + count * 0.035);
  const startLight = clamp(baseLight - spread, 0.24, 0.68);
  const endLight = clamp(baseLight + spread, 0.32, 0.78);

  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(count - 1, 1);
    const lightness = startLight + (endLight - startLight) * t;
    const hueShift = (index - (count - 1) / 2) * 7;
    return hslToHex(baseHue + hueShift, baseSat, lightness);
  });
}

export function applyChartPalette<T extends { color: string }>(items: T[]): T[] {
  const palette = buildChartColorPalette(getEffectiveChartAccent(), items.length);
  return items.map((item, index) => ({
    ...item,
    color: palette[index] ?? palette[palette.length - 1] ?? getEffectiveChartAccent(),
  }));
}
