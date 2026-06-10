import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDateSafe, parseDateSafe } from '@shared/types';

export type ReportPreviewAuthor = {
  name: string;
  avatarUrl?: string;
};

export type ReportPreviewHeader = {
  title: string;
  periodLabel: string;
  generatedRelative: string | null;
  clientName?: string;
  generatedBy?: ReportPreviewAuthor | null;
};

export function buildReportPreviewHeader(options: {
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  clientName?: string;
  generatedBy?: ReportPreviewAuthor | null;
}): ReportPreviewHeader {
  const fromLabel = formatDateSafe(options.dateFrom, "d 'de' MMMM yyyy", { locale: es });
  const toLabel = formatDateSafe(options.dateTo, "d 'de' MMMM yyyy", { locale: es });
  const periodLabel =
    options.dateFrom === options.dateTo ? fromLabel : `${fromLabel} – ${toLabel}`;
  const generatedAt = parseDateSafe(options.generatedAt);
  const contactLabel = options.clientName ?? 'Todos los contactos';

  return {
    title: `${contactLabel} · ${periodLabel}`,
    periodLabel,
    generatedRelative: generatedAt
      ? formatDistanceToNow(generatedAt, { addSuffix: true, locale: es })
      : null,
    clientName: options.clientName,
    generatedBy: options.generatedBy ?? null,
  };
}
