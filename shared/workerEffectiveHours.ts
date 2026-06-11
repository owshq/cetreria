import type { Activity, ActivityType, CalendarEvent } from './types.js';
import { activityUsesWorkReport } from './activityTypes.js';
import { getActivityReportedHours } from './activityWorkReport.js';
import {
  findEventForActivity,
  getActivityAssigneeIds,
  isUserAssignedToActivity,
} from './scheduleActivityAssignees.js';
import { getWorkerHoursStatus } from './workerHoursStatus.js';

export type WorkerReportHoursSource =
  | 'activity'
  | 'work-report'
  | 'shift'
  | 'signature'
  | 'none';

export type WorkerReportHoursResult = {
  hours: number;
  source: WorkerReportHoursSource;
  label: string;
};

export type ResolveWorkerReportHoursOptions = {
  activityTypes?: readonly ActivityType[];
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
};

const SOURCE_LABELS: Record<WorkerReportHoursSource, string> = {
  'work-report': 'Horas reportadas',
  signature: 'Horas firmadas',
  shift: 'Horas asignadas',
  activity: 'Horas registradas',
  none: '\u2014',
};

export function workerReportHoursLabel(source: WorkerReportHoursSource): string {
  return SOURCE_LABELS[source];
}

/** Etiqueta agregada para totales de periodo segun modulos activos del workspace. */
export function workerPeriodHoursMetricLabel(options: {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
} = {}): string {
  if (options.workerSignaturesEnabled) return SOURCE_LABELS.signature;
  if (options.shiftSchedulingEnabled) return SOURCE_LABELS.shift;
  return SOURCE_LABELS.activity;
}

/** Encabezado corto para columnas CSV/PDF de hora principal por fila. */
export function workerReportHoursColumnLabel(source: WorkerReportHoursSource): string {
  switch (source) {
    case 'work-report':
      return 'H. reportadas';
    case 'signature':
      return 'H. firmadas';
    case 'shift':
      return 'H. asignadas';
    case 'activity':
      return 'H. registradas';
    default:
      return 'Horas';
  }
}

export type WorkerHoursDisplayLabelOptions = {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
  source?: WorkerReportHoursSource;
  /** Abreviatura para columnas estrechas (PDF). Por defecto true. */
  short?: boolean;
};

/**
 * Etiqueta visible de horas para UI/PDF/CSV.
 * Con `source`: etiqueta de la fila segun fuente (parte, firma, turno, actividad).
 * Sin `source`: etiqueta agregada del periodo segun modulos activos.
 */
export function getWorkerHoursDisplayLabel(
  options: WorkerHoursDisplayLabelOptions = {},
): string {
  const { short = true } = options;

  if (options.source) {
    return short
      ? workerReportHoursColumnLabel(options.source)
      : workerReportHoursLabel(options.source);
  }

  const full = workerPeriodHoursMetricLabel(options);
  if (!short) return full;

  return full
    .replace(/^Horas /, 'H. ')
    .replace('registradas', 'reg.')
    .replace('asignadas', 'asig.')
    .replace('firmadas', 'firm.')
    .replace('reportadas', 'rep.');
}

function canFallbackToActivityHours(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
): boolean {
  const assigneeIds = getActivityAssigneeIds(activity, event);
  if (!assigneeIds.includes(userId)) return false;
  if (assigneeIds.length === 1) return true;
  return activity.userId === userId;
}

/**
 * Horas del operario en una actividad con fuente y etiqueta de producto.
 * Prioridad visual: parte enviado > firma (si activa) > tramo (si turnos activos) > actividad.
 */
export function resolveWorkerReportHours(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  options: ResolveWorkerReportHoursOptions = {},
): WorkerReportHoursResult {
  const {
    activityTypes,
    workerSignaturesEnabled = false,
    shiftSchedulingEnabled = false,
  } = options;

  const events = event ? [event] : [];
  if (!isUserAssignedToActivity(activity, events, userId)) {
    return { hours: 0, source: 'none', label: SOURCE_LABELS.none };
  }

  if (activityTypes && activityUsesWorkReport(activity, activityTypes)) {
    const reported = getActivityReportedHours(activity, userId);
    if (reported > 0) {
      return {
        hours: reported,
        source: 'work-report',
        label: SOURCE_LABELS['work-report'],
      };
    }
  }

  const { assignedHours, signedHours } = getWorkerHoursStatus(activity, event, userId);

  if (workerSignaturesEnabled && signedHours > 0) {
    return {
      hours: signedHours,
      source: 'signature',
      label: SOURCE_LABELS.signature,
    };
  }

  if (shiftSchedulingEnabled && assignedHours > 0) {
    return {
      hours: assignedHours,
      source: 'shift',
      label: SOURCE_LABELS.shift,
    };
  }

  if (canFallbackToActivityHours(activity, event, userId)) {
    const hours = activity.hours ?? 0;
    if (hours > 0) {
      return {
        hours,
        source: 'activity',
        label: SOURCE_LABELS.activity,
      };
    }
  }

  return { hours: 0, source: 'none', label: SOURCE_LABELS.none };
}

export type ResolveWorkerEffectiveHoursOptions = ResolveWorkerReportHoursOptions & {
  /** @deprecated Usar resolveWorkerReportHours; se ignora en favor de flags de workspace. */
  preferReportedHours?: boolean;
  /** @deprecated Usar resolveWorkerReportHours. */
  fallbackToActivityHours?: boolean;
};

/**
 * Helper interno: devuelve solo el numero de horas.
 * No usar como etiqueta visible de producto; preferir resolveWorkerReportHours.
 */
export function resolveWorkerEffectiveHours(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  options: ResolveWorkerEffectiveHoursOptions = {},
): number {
  return resolveWorkerReportHours(activity, event, userId, {
    activityTypes: options.activityTypes,
    workerSignaturesEnabled: options.workerSignaturesEnabled,
    shiftSchedulingEnabled: options.shiftSchedulingEnabled,
  }).hours;
}

export function sumWorkerReportHours(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  userId: string,
  options: ResolveWorkerReportHoursOptions = {},
): number {
  const eventsList = [...events];
  return activities.reduce((sum, activity) => {
    const event = findEventForActivity(activity, eventsList) ?? null;
    return sum + resolveWorkerReportHours(activity, event, userId, options).hours;
  }, 0);
}
