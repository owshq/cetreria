import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

export type ReportDateSectionKey = 'today' | 'yesterday' | 'last7days' | `month-${string}`;

const FIXED_SECTION_ORDER: ReportDateSectionKey[] = ['today', 'yesterday', 'last7days'];

const FIXED_SECTION_LABELS: Record<(typeof FIXED_SECTION_ORDER)[number], string> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  last7days: 'Últimos 7 días',
};

export type ReportDateSection<T> = {
  key: string;
  label: string;
  items: T[];
};

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getReportDateSectionKey(
  generatedAt: string,
  referenceDate = new Date(),
): ReportDateSectionKey {
  const date = startOfDay(parseISO(generatedAt));
  const today = startOfDay(referenceDate);
  const daysAgo = differenceInCalendarDays(today, date);

  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo <= 7) return 'last7days';

  return `month-${format(date, 'yyyy-MM')}`;
}

export function getReportDateSectionLabel(key: ReportDateSectionKey): string {
  if (key in FIXED_SECTION_LABELS) {
    return FIXED_SECTION_LABELS[key as keyof typeof FIXED_SECTION_LABELS];
  }

  const monthKey = key.replace('month-', '');
  const monthDate = parseISO(`${monthKey}-01`);
  return capitalizeFirst(format(monthDate, 'MMMM yyyy', { locale: es }));
}

function compareSectionKeys(a: ReportDateSectionKey, b: ReportDateSectionKey): number {
  const aFixed = FIXED_SECTION_ORDER.indexOf(a);
  const bFixed = FIXED_SECTION_ORDER.indexOf(b);

  if (aFixed !== -1 && bFixed !== -1) return aFixed - bFixed;
  if (aFixed !== -1) return -1;
  if (bFixed !== -1) return 1;

  const aMonth = a.replace('month-', '');
  const bMonth = b.replace('month-', '');
  return bMonth.localeCompare(aMonth);
}

export function groupReportsByDateSection<T extends { generatedAt: string }>(
  reports: T[],
  referenceDate = new Date(),
): ReportDateSection<T>[] {
  const groups = new Map<ReportDateSectionKey, T[]>();

  for (const report of reports) {
    const key = getReportDateSectionKey(report.generatedAt, referenceDate);
    const bucket = groups.get(key);
    if (bucket) bucket.push(report);
    else groups.set(key, [report]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => compareSectionKeys(a, b))
    .map(([key, items]) => ({
      key,
      label: getReportDateSectionLabel(key),
      items,
    }));
}
