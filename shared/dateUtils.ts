import { format, isValid, parseISO, type FormatOptions } from 'date-fns';
import { isDateInRange } from './dateRange.js';

export type ClientCreatedAtPrecision = 'day' | 'year';

export function parseDateSafe(value: string | undefined | null): Date | null {
  if (!value || typeof value !== 'string') return null;
  try {
    const date = parseISO(value);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

export function compareDateStringsAsc(
  a: string | undefined | null,
  b: string | undefined | null,
): number {
  const timeA = parseDateSafe(a)?.getTime() ?? 0;
  const timeB = parseDateSafe(b)?.getTime() ?? 0;
  return timeA - timeB;
}

export function compareDateStringsDesc(
  a: string | undefined | null,
  b: string | undefined | null,
): number {
  return compareDateStringsAsc(b, a);
}

export function formatDateSafe(
  value: string | undefined | null,
  formatStr: string,
  options?: FormatOptions,
): string {
  const date = parseDateSafe(value);
  if (!date) return '—';
  return format(date, formatStr, options);
}

export function resolveClientCreatedAtPrecision(client: {
  createdAt: string;
  createdAtPrecision?: ClientCreatedAtPrecision;
}): ClientCreatedAtPrecision {
  if (client.createdAtPrecision === 'year' || client.createdAtPrecision === 'day') {
    return client.createdAtPrecision;
  }
  if (/^\d{4}$/.test(client.createdAt.trim())) return 'year';
  return 'day';
}

export function normalizeClientCreatedAtPrecision(
  value: unknown,
  createdAt: string,
): ClientCreatedAtPrecision {
  if (value === 'year' || value === 'day') return value;
  if (/^\d{4}$/.test(createdAt.trim())) return 'year';
  return 'day';
}

/** Valor yyyy-MM-dd para un input type="date" a partir de createdAt del contacto. */
export function clientCreatedAtToInputValue(value: string | undefined | null): string {
  const date = parseDateSafe(value ?? undefined);
  return date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
}

export function clientCreatedAtToFormValues(client?: {
  createdAt?: string | null;
  createdAtPrecision?: ClientCreatedAtPrecision;
}): { createdAt: string; createdAtPrecision: ClientCreatedAtPrecision } {
  const precision =
    client?.createdAt != null && client.createdAt !== ''
      ? resolveClientCreatedAtPrecision({
          createdAt: client.createdAt,
          createdAtPrecision: client.createdAtPrecision,
        })
      : 'day';

  if (precision === 'year') {
    const year = client?.createdAt?.trim().slice(0, 4) ?? '';
    return {
      createdAt: /^\d{4}$/.test(year) ? year : String(new Date().getFullYear()),
      createdAtPrecision: 'year',
    };
  }

  return {
    createdAt: clientCreatedAtToInputValue(client?.createdAt),
    createdAtPrecision: 'day',
  };
}

/** Normaliza la fecha de alta de un contacto (acepta yyyy-MM-dd, yyyy o ISO). */
export function normalizeClientCreatedAt(
  value?: string | null,
  precision: ClientCreatedAtPrecision = 'day',
): string {
  if (precision === 'year') {
    const year = String(value ?? '').trim().slice(0, 4);
    if (/^\d{4}$/.test(year)) return year;
    return String(new Date().getFullYear());
  }

  const date = parseDateSafe(value ?? undefined);
  return date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
}

export function formatClientCreatedAt(
  client: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
  dayFormat = 'dd/MM/yyyy',
  options?: FormatOptions,
): string {
  const precision = resolveClientCreatedAtPrecision(client);
  if (precision === 'year') {
    const year = client.createdAt.trim().slice(0, 4);
    return /^\d{4}$/.test(year) ? year : '—';
  }
  return formatDateSafe(client.createdAt, dayFormat, options);
}

export function formatClientCreatedAtLong(
  client: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
  options?: FormatOptions,
): string {
  const precision = resolveClientCreatedAtPrecision(client);
  if (precision === 'year') {
    return formatClientCreatedAt(client);
  }
  return formatDateSafe(client.createdAt, "d 'de' MMMM yyyy", options);
}

export function clientCreatedAtSortKey(client: {
  createdAt: string;
  createdAtPrecision?: ClientCreatedAtPrecision;
}): number {
  const precision = resolveClientCreatedAtPrecision(client);
  if (precision === 'year') {
    const year = parseInt(client.createdAt.slice(0, 4), 10);
    return Number.isNaN(year) ? 0 : new Date(year, 0, 1).getTime();
  }
  return parseDateSafe(client.createdAt)?.getTime() ?? 0;
}

export function compareClientCreatedAtAsc(
  a: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
  b: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
): number {
  return clientCreatedAtSortKey(a) - clientCreatedAtSortKey(b);
}

export function compareClientCreatedAtDesc(
  a: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
  b: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
): number {
  return compareClientCreatedAtAsc(b, a);
}

export function isClientCreatedAtInRange(
  client: { createdAt: string; createdAtPrecision?: ClientCreatedAtPrecision },
  from: string,
  to: string,
): boolean {
  const precision = resolveClientCreatedAtPrecision(client);
  if (precision === 'year') {
    const year = parseInt(client.createdAt.slice(0, 4), 10);
    if (Number.isNaN(year)) return false;
    const fromYear = parseInt(from.slice(0, 4), 10);
    const toYear = parseInt(to.slice(0, 4), 10);
    return year >= fromYear && year <= toYear;
  }
  return isDateInRange(client.createdAt, from, to);
}

export function clientCreatedAtFilterValue(client: {
  createdAt: string;
  createdAtPrecision?: ClientCreatedAtPrecision;
}): string {
  const precision = resolveClientCreatedAtPrecision(client);
  if (precision === 'year') {
    return client.createdAt.trim().slice(0, 4);
  }
  return client.createdAt.slice(0, 10);
}

/** Horas entre dos horas HH:mm, redondeadas a 0.5 (mínimo 0.5). */
export function hoursFromTimeRange(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 1;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 1;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.max(0.5, Math.round((minutes / 60) * 2) / 2);
}
