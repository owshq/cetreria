import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity, ActivityType, Document } from '@shared/types';
import { formatDateSafe, getActivityTypeLabel, parseDateSafe } from '@shared/types';

export function formatDocumentHeaderMeta(
  document: Document,
): { label: string; relative: string | null } {
  const refDate = parseDateSafe(document.date);
  if (!refDate) return { label: '', relative: null };

  const formatted = formatDateSafe(document.date, "d 'de' MMMM yyyy", { locale: es });
  const relative = formatDistanceToNow(refDate, { addSuffix: true, locale: es });

  return { label: formatted, relative };
}

export function formatLinkedActivityHeaderLabel(
  activity: Activity,
  activityTypes: ActivityType[],
): string {
  const dateLabel = format(parseISO(activity.date), 'd MMM yyyy', { locale: es });
  const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
  const description = activity.description.trim();
  const suffix =
    description.length > 36 ? `${description.slice(0, 36)}…` : description;
  return suffix ? `${typeLabel} · ${dateLabel} · ${suffix}` : `${typeLabel} · ${dateLabel}`;
}
