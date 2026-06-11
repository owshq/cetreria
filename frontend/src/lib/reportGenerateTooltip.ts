import type { ReportKind } from '@shared/types';

export function getReportGenerateTooltip(options: {
  invalidCustomRange: boolean;
  hasPeriodData: boolean;
  generating?: boolean;
  entity?: 'cliente' | 'operario';
  reportKind?: ReportKind;
}): string {
  const entity = options.entity ?? 'cliente';
  if (options.invalidCustomRange) {
    return 'Corrige el rango de fechas (inicio ≤ fin).';
  }
  if (!options.hasPeriodData) {
    return `Sin actividades ni documentos en el periodo (${entity}).`;
  }
  if (options.generating) {
    return 'Generando informe…';
  }

  switch (options.reportKind) {
    case 'general':
      return 'Generar informe general (clientes + operarios + documentos)';
    case 'contacts_global':
      return 'Generar informe global de clientes';
    case 'contact':
      return 'Generar informe del cliente';
    case 'workers_global':
      return 'Generar informe de equipo';
    case 'worker':
      return 'Generar informe del operario';
    default:
      return `Generar informe (${entity})`;
  }
}

/** @deprecated Use getReportGenerateTooltip */
export const getReportDownloadTooltip = getReportGenerateTooltip;
