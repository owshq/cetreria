import { buildShiftEventTimes } from './workspaceScheduleSettings.js';

/** Turno planificado por día (guardias y vacaciones del operario). */
export type ShiftCode = 'M' | 'T' | 'N' | 'L' | 'V';

export const SHIFT_CODES: ShiftCode[] = ['L', 'M', 'T', 'N', 'V'];

/** Turnos asignables al vincular una actividad (sin vacaciones). */
export const ACTIVITY_PLANNING_SHIFT_CODES: ShiftCode[] = ['L', 'M', 'T', 'N'];

/** Franja horaria por defecto del evento de calendario según turno (solo visualización). */
export const SHIFT_EVENT_TIMES = buildShiftEventTimes();

/** Código de festivo de empresa (solo calendario workspace, no en user_schedules). */
export const HOLIDAY_SHIFT_CODE = 'F' as const;

export type ScheduleLegendCode = ShiftCode | typeof HOLIDAY_SHIFT_CODE;

export const SCHEDULE_LEGEND_CODES: ScheduleLegendCode[] = [
  ...SHIFT_CODES,
  HOLIDAY_SHIFT_CODE,
];

export const SHIFT_HOURS: Record<ShiftCode, number> = {
  M: 8,
  T: 8,
  N: 10,
  L: 0,
  V: 0,
};

export const SCHEDULE_MONTHLY_HOURS_WARNING = 168;

export const DEFAULT_MAX_VACATION_DAYS = 0;

export type ShiftMeta = {
  code: ScheduleLegendCode;
  label: string;
  shortLabel: string;
  hours: number;
  /** Color vivo (celdas, leyenda, badges). */
  color: string;
  bgColor: string;
  tooltip: string;
};

export const SHIFT_META: Record<ScheduleLegendCode, ShiftMeta> = {
  M: {
    code: 'M',
    label: 'Mañana',
    shortLabel: 'M',
    hours: SHIFT_HOURS.M,
    color: '#0066FF',
    bgColor: 'rgba(0, 102, 255, 0.2)',
    tooltip: 'Turno de mañana',
  },
  T: {
    code: 'T',
    label: 'Tarde',
    shortLabel: 'T',
    hours: SHIFT_HOURS.T,
    color: '#FF6B00',
    bgColor: 'rgba(255, 107, 0, 0.22)',
    tooltip: 'Turno de tarde',
  },
  N: {
    code: 'N',
    label: 'Noche',
    shortLabel: 'N',
    hours: SHIFT_HOURS.N,
    color: '#B100FF',
    bgColor: 'rgba(177, 0, 255, 0.2)',
    tooltip: 'Turno de noche',
  },
  L: {
    code: 'L',
    label: 'Libre',
    shortLabel: 'L',
    hours: SHIFT_HOURS.L,
    color: '#00B87A',
    bgColor: 'rgba(0, 184, 122, 0.18)',
    tooltip: 'Disponible las 24 h del día (sin turno M/T/N fijo)',
  },
  V: {
    code: 'V',
    label: 'Vacaciones',
    shortLabel: 'V',
    hours: SHIFT_HOURS.V,
    color: '#E91E8C',
    bgColor: 'rgba(233, 30, 140, 0.18)',
    tooltip: 'Vacaciones (no cuenta como jornada trabajada)',
  },
  F: {
    code: 'F',
    label: 'Festivo',
    shortLabel: 'F',
    hours: 0,
    color: '#D4A017',
    bgColor: 'rgba(212, 160, 23, 0.22)',
    tooltip: 'Festivo de empresa (visible para todo el equipo)',
  },
};

export const FUTURE_SHIFT_RECOMMENDATIONS = [
  { code: 'B', label: 'Baja', note: 'Ausencia justificada' },
] as const;

export function normalizeMaxVacationDays(value: unknown): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_VACATION_DAYS;
  return Math.min(366, Math.floor(parsed));
}

export function isShiftCode(value: unknown): value is ShiftCode {
  return typeof value === 'string' && SHIFT_CODES.includes(value as ShiftCode);
}

export function getShiftMeta(
  shift: ShiftCode | typeof HOLIDAY_SHIFT_CODE | null | undefined,
): ShiftMeta | null {
  if (!shift) return null;
  return SHIFT_META[shift] ?? null;
}

export function getAssignableShiftCodes(maxVacationDays: number): ShiftCode[] {
  if (maxVacationDays > 0) return SHIFT_CODES;
  return SHIFT_CODES.filter((code) => code !== 'V');
}

export function cycleShiftCode(
  current: ShiftCode | null | undefined,
  options?: { maxVacationDays?: number },
): ShiftCode | null {
  const codes = getAssignableShiftCodes(options?.maxVacationDays ?? DEFAULT_MAX_VACATION_DAYS);
  if (!current) return codes[0] ?? null;
  const index = codes.indexOf(current);
  if (index === -1 || index === codes.length - 1) return null;
  return codes[index + 1]!;
}

export function countVacationDaysInYear(
  entriesByDate: Map<string, ShiftCode>,
  year: number,
): number {
  const prefix = `${year}-`;
  let count = 0;
  for (const [date, shift] of entriesByDate) {
    if (date.startsWith(prefix) && shift === 'V') count += 1;
  }
  return count;
}

export function canAssignVacationShift(
  entriesByDate: Map<string, ShiftCode>,
  date: string,
  maxVacationDays: number,
  previousShift: ShiftCode | null,
): { ok: true } | { ok: false; message: string } {
  if (maxVacationDays <= 0) {
    return { ok: false, message: 'No tienes días de vacaciones asignados.' };
  }
  if (previousShift === 'V') return { ok: true };
  const year = Number.parseInt(date.slice(0, 4), 10);
  const used = countVacationDaysInYear(entriesByDate, year);
  if (used >= maxVacationDays) {
    return {
      ok: false,
      message: `Has alcanzado el máximo de vacaciones del año (${maxVacationDays} días).`,
    };
  }
  return { ok: true };
}

export type ScheduleDaySummary = {
  date: string;
  weekdayShort: string;
  shift: ShiftCode;
  hours: number;
};

export type SchedulePeriodSummary = {
  assignedDays: ScheduleDaySummary[];
  counts: Record<ShiftCode, number>;
  totalHours: number;
  assignedDayCount: number;
  workingHours: number;
  vacationDaysInScope: number;
  isOverload: boolean;
  coverageLabel: string;
};

function emptyCounts(): Record<ShiftCode, number> {
  return { M: 0, T: 0, N: 0, L: 0, V: 0 };
}

export function buildCoverageLabel(counts: Record<ShiftCode, number>): string {
  return SHIFT_CODES.filter((code) => counts[code] > 0)
    .map((code) => `${counts[code]}${SHIFT_META[code].shortLabel}`)
    .join(' · ');
}

function signedHoursForDay(
  date: string,
  options?: {
    signedHoursByDate?: Map<string, number>;
    /** @deprecated Usar signedHoursByDate (solo horas firmadas). */
    hoursByDate?: Map<string, number>;
  },
): number {
  return options?.signedHoursByDate?.get(date) ?? options?.hoursByDate?.get(date) ?? 0;
}

export function computeSchedulePeriodSummary(
  periodDays: Array<{ date: string; weekdayShort: string; inScope?: boolean }>,
  entriesByDate: Map<string, ShiftCode>,
  options?: {
    hoursCap?: number;
    /** Horas firmadas por día; solo estas cuentan como jornada laboral. */
    signedHoursByDate?: Map<string, number>;
    /** @deprecated Usar signedHoursByDate. */
    hoursByDate?: Map<string, number>;
  },
): SchedulePeriodSummary {
  const counts = emptyCounts();
  let totalHours = 0;
  let workingHours = 0;
  let vacationDaysInScope = 0;
  const assignedOnly: ScheduleDaySummary[] = [];
  const scopedDays = periodDays.filter((d) => d.inScope !== false);

  for (const day of scopedDays) {
    workingHours += signedHoursForDay(day.date, options);
  }

  for (const day of scopedDays) {
    const shift = entriesByDate.get(day.date);
    if (!shift) continue;

    counts[shift] += 1;
    const hours = signedHoursForDay(day.date, options);
    totalHours += hours;
    if (shift === 'V') vacationDaysInScope += 1;

    assignedOnly.push({
      date: day.date,
      weekdayShort: day.weekdayShort,
      shift,
      hours,
    });
  }

  assignedOnly.sort((a, b) => a.date.localeCompare(b.date));

  const cap = options?.hoursCap ?? SCHEDULE_MONTHLY_HOURS_WARNING;
  const isOverload = workingHours > cap;

  return {
    assignedDays: assignedOnly,
    counts,
    totalHours,
    assignedDayCount: assignedOnly.length,
    workingHours,
    vacationDaysInScope,
    isOverload,
    coverageLabel: buildCoverageLabel(counts),
  };
}
