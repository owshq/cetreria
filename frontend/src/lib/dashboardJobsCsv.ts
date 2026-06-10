import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { SHIFT_META } from '@shared/types';
import {
  formatDashboardJobsHours,
  type DashboardJobsMatrixData,
  type DashboardJobsWorkerRow,
} from '@/lib/dashboardJobsMatrix';

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

type DashboardJobsCsvOptions = {
  rows?: DashboardJobsWorkerRow[];
  dates?: string[];
  includeShifts?: boolean;
  includeSignatures?: boolean;
};

function formatCellForCsv(
  cell: NonNullable<DashboardJobsWorkerRow['cellsByDate'][string]>,
  includeShifts: boolean,
  includeSignatures: boolean,
): string {
  const parts: string[] = [];

  if (includeShifts) {
    const meta = SHIFT_META[cell.shift];
    parts.push(`${meta.label} (${meta.shortLabel})`);
  }

  parts.push(cell.hourRange);
  parts.push(`horas ${formatDashboardJobsHours(cell.assignedHours)}`);

  if (includeSignatures) {
    parts.push(`firm ${formatDashboardJobsHours(cell.signedHours)}`);
    if (cell.pendingCount > 0) {
      parts.push(`${cell.pendingCount} sin firma`);
    }
  }

  return parts.join(' · ');
}

export function dashboardJobsMatrixToCsv(
  matrix: DashboardJobsMatrixData,
  options: DashboardJobsCsvOptions = {},
): string {
  const rows = options.rows ?? matrix.rows;
  const dates = options.dates ?? matrix.dates;
  const includeShifts = options.includeShifts ?? true;
  const includeSignatures = options.includeSignatures ?? true;
  const delimiter = ';';

  const headerFields = [
    'Operario',
    ...dates.map((date) => {
      const parsed = parseISO(date);
      return format(parsed, 'd MMM yyyy (EEE)', { locale: es });
    }),
    'Horas de actividad',
  ];

  if (includeSignatures) {
    headerFields.push('Horas firmadas', 'Actividades sin firma');
  }

  const header = headerFields.map(escapeCsvField).join(delimiter);

  const body = rows.map((row) => {
    const dateCells = dates.map((date) => {
      const cell = row.cellsByDate[date];
      if (!cell) return escapeCsvField('');
      return escapeCsvField(formatCellForCsv(cell, includeShifts, includeSignatures));
    });

    const rowFields = [
      row.userName,
      ...dateCells,
      formatDashboardJobsHours(row.totalAssignedHours),
    ];

    if (includeSignatures) {
      rowFields.push(
        formatDashboardJobsHours(row.totalSignedHours),
        String(row.pendingSignatureCount),
      );
    }

    return rowFields.map(escapeCsvField).join(delimiter);
  });

  return `${[header, ...body].join('\r\n')}\r\n`;
}

export function downloadDashboardJobsCsv(
  matrix: DashboardJobsMatrixData,
  filename: string,
  options: DashboardJobsCsvOptions = {},
): void {
  downloadCsvFile(dashboardJobsMatrixToCsv(matrix, options), filename);
}
