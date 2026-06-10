import type { ScheduleLegendCode, ShiftCode } from '@shared/types';
import { HOLIDAY_SHIFT_CODE, SHIFT_CODES } from '@shared/types';
import { buildChartColorPalette, getEffectiveChartAccent } from '@/lib/chartColorPalette';

/** Stable order for mapping workspace chart palette slots to shift codes. */
export const SHIFT_COLOR_ORDER: ScheduleLegendCode[] = [
  ...SHIFT_CODES,
  HOLIDAY_SHIFT_CODE,
];

/** Vacaciones: fijo, fuera de la gama del workspace. */
export const VACATION_SHIFT_COLOR = '#1a1a1a';

export type ShiftColorMap = Record<ScheduleLegendCode, string>;

export function buildShiftColorMap(): ShiftColorMap {
  const accent = getEffectiveChartAccent();
  const fallback = accent;

  /** buildChartColorPalette: [0] oscuro ? [n] claro. Mañana la más clara. */
  const workProgression = buildChartColorPalette(accent, 3);
  const morning = workProgression[2] ?? fallback;
  const afternoon = workProgression[1] ?? fallback;
  const night = workProgression[0] ?? fallback;
  /** Libre y festivo: tonos intermedios de la misma gama. */
  const supportTones = buildChartColorPalette(accent, 2);

  const map = {} as ShiftColorMap;

  for (const code of SHIFT_CODES) {
    switch (code) {
      case 'M':
        map[code] = morning;
        break;
      case 'T':
        map[code] = afternoon;
        break;
      case 'N':
        map[code] = night;
        break;
      case 'L':
        map[code] = supportTones[0] ?? afternoon ?? fallback;
        break;
      case 'V':
        map[code] = VACATION_SHIFT_COLOR;
        break;
      default:
        map[code] = fallback;
    }
  }

  map[HOLIDAY_SHIFT_CODE] = supportTones[1] ?? afternoon ?? fallback;

  return map;
}

export function getShiftPaletteColor(
  shift: ShiftCode | ScheduleLegendCode,
  colorMap: ShiftColorMap,
): string {
  return colorMap[shift] ?? getEffectiveChartAccent();
}
