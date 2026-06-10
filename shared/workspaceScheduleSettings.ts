import { hoursFromTimeRange } from './dateUtils.js';
import type { ShiftCode } from './userSchedule.js';

export type WorkspaceScheduleShiftBoundaries = {
  /** Hora a la que termina la noche y empieza la mañana (HH:mm). */
  nightToMorningAt: string;
  /** Hora a la que termina la mañana y empieza la tarde (HH:mm). */
  morningToAfternoonAt: string;
  /** Hora a la que termina la tarde y empieza la noche (HH:mm). */
  afternoonToNightAt: string;
};

export type WorkspaceScheduleSettings = WorkspaceScheduleShiftBoundaries & {
  id: string;
  workspaceId: string;
};

export const DEFAULT_SCHEDULE_SHIFT_BOUNDARIES: WorkspaceScheduleShiftBoundaries = {
  nightToMorningAt: '06:00',
  morningToAfternoonAt: '14:00',
  afternoonToNightAt: '22:00',
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function normalizeTimeHHmm(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return TIME_PATTERN.test(trimmed) ? trimmed : fallback;
}

export function defaultWorkspaceScheduleSettings(workspaceId: string): WorkspaceScheduleSettings {
  return {
    id: workspaceId,
    workspaceId,
    ...DEFAULT_SCHEDULE_SHIFT_BOUNDARIES,
  };
}

export function normalizeWorkspaceScheduleSettings(
  raw: Partial<WorkspaceScheduleSettings> | null | undefined,
  workspaceId: string,
): WorkspaceScheduleSettings {
  const defaults = defaultWorkspaceScheduleSettings(workspaceId);
  if (!raw) return defaults;

  return {
    id: raw.id ?? workspaceId,
    workspaceId,
    nightToMorningAt: normalizeTimeHHmm(raw.nightToMorningAt, defaults.nightToMorningAt),
    morningToAfternoonAt: normalizeTimeHHmm(
      raw.morningToAfternoonAt,
      defaults.morningToAfternoonAt,
    ),
    afternoonToNightAt: normalizeTimeHHmm(raw.afternoonToNightAt, defaults.afternoonToNightAt),
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

export function buildShiftEventTimes(
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): Record<ShiftCode, { startTime: string; endTime: string }> {
  const normalized = {
    ...DEFAULT_SCHEDULE_SHIFT_BOUNDARIES,
    ...boundaries,
  };
  const morningStart = normalizeTimeHHmm(
    normalized.nightToMorningAt,
    DEFAULT_SCHEDULE_SHIFT_BOUNDARIES.nightToMorningAt,
  );
  const afternoonStart = normalizeTimeHHmm(
    normalized.morningToAfternoonAt,
    DEFAULT_SCHEDULE_SHIFT_BOUNDARIES.morningToAfternoonAt,
  );
  const nightStart = normalizeTimeHHmm(
    normalized.afternoonToNightAt,
    DEFAULT_SCHEDULE_SHIFT_BOUNDARIES.afternoonToNightAt,
  );

  return {
    M: { startTime: morningStart, endTime: afternoonStart },
    T: { startTime: afternoonStart, endTime: nightStart },
    N: { startTime: nightStart, endTime: morningStart },
    L: { startTime: '09:00', endTime: '17:00' },
    V: { startTime: '09:00', endTime: '17:00' },
  };
}

/** Turno planificado según una hora del día (HH:mm). */
export function inferShiftFromTime(
  time: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): ShiftCode | null {
  const normalized = normalizeWorkspaceScheduleSettings(
    { id: '', workspaceId: '', ...DEFAULT_SCHEDULE_SHIFT_BOUNDARIES, ...boundaries },
    '',
  );
  const minutes = timeToMinutes(normalizeTimeHHmm(time, ''));
  if (!Number.isFinite(minutes)) return null;

  const morningStart = timeToMinutes(normalized.nightToMorningAt);
  const afternoonStart = timeToMinutes(normalized.morningToAfternoonAt);
  const nightStart = timeToMinutes(normalized.afternoonToNightAt);

  if (minutes >= morningStart && minutes < afternoonStart) return 'M';
  if (minutes >= afternoonStart && minutes < nightStart) return 'T';
  return 'N';
}

/** Horas y turno (por hora de inicio) a partir del tramo horario de la actividad. */
export function resolveActivityScheduleFromTimes(
  startTime: string,
  endTime: string,
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): { hours: number; shift: ShiftCode | null } {
  return {
    hours: hoursFromTimeRange(startTime, endTime),
    shift: inferShiftFromTime(startTime, boundaries),
  };
}

export function describeShiftBoundaries(
  boundaries: Partial<WorkspaceScheduleShiftBoundaries> = {},
): { morning: string; afternoon: string; night: string } {
  const times = buildShiftEventTimes(boundaries);
  return {
    morning: `${times.M.startTime} – ${times.M.endTime}`,
    afternoon: `${times.T.startTime} – ${times.T.endTime}`,
    night: `${times.N.startTime} – ${times.N.endTime}`,
  };
}
