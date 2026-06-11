import type { ReportBreakdownRow } from './reportInstitutionalText';

export type ResolvedBreakdownDocumentCounts = {
  deliveryNoteCount: number;
  invoiceCount: number;
  hasTypedCounts: boolean;
  legacyTotal: number;
};

export function resolveReportBreakdownDocumentCounts(
  row: ReportBreakdownRow,
): ResolvedBreakdownDocumentCounts {
  const hasTypedCounts = row.deliveryNoteCount != null || row.invoiceCount != null;
  return {
    deliveryNoteCount: row.deliveryNoteCount ?? 0,
    invoiceCount: row.invoiceCount ?? 0,
    hasTypedCounts,
    legacyTotal: row.documents,
  };
}

export function breakdownRowsHaveTypedDocumentCounts(rows: ReportBreakdownRow[]): boolean {
  return rows.some((row) => row.deliveryNoteCount != null || row.invoiceCount != null);
}

type DocumentSummaryStyle = 'full' | 'compact';

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

export function formatDocumentTypeSummary(
  deliveryNoteCount: number,
  invoiceCount: number,
  options?: {
    style?: DocumentSummaryStyle;
    legacyTotal?: number;
  },
): string {
  const style = options?.style ?? 'full';
  const parts: string[] = [];

  if (deliveryNoteCount > 0) {
    parts.push(
      style === 'compact'
        ? `${deliveryNoteCount} alb.`
        : `${deliveryNoteCount} ${pluralize(deliveryNoteCount, 'albarán', 'albaranes')}`,
    );
  }

  if (invoiceCount > 0) {
    parts.push(
      style === 'compact'
        ? `${invoiceCount} fact.`
        : `${invoiceCount} ${pluralize(invoiceCount, 'factura', 'facturas')}`,
    );
  }

  if (parts.length > 0) {
    return parts.join(' · ');
  }

  if (options?.legacyTotal != null && options.legacyTotal > 0) {
    return style === 'compact'
      ? `${options.legacyTotal} doc.`
      : `${options.legacyTotal} ${pluralize(options.legacyTotal, 'documento', 'documentos')}`;
  }

  return '0';
}

export function formatBreakdownDocumentCell(
  row: ReportBreakdownRow,
  style: DocumentSummaryStyle = 'compact',
): string {
  const counts = resolveReportBreakdownDocumentCounts(row);
  if (counts.hasTypedCounts) {
    return formatDocumentTypeSummary(counts.deliveryNoteCount, counts.invoiceCount, { style });
  }
  return formatDocumentTypeSummary(0, 0, { style, legacyTotal: counts.legacyTotal });
}
