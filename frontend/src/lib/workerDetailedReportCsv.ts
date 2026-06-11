import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { workerPeriodHoursMetricLabel } from '@shared/types';
import {
  DETAIL_EMPTY_LABEL,
  workerDetailShowsReportedHoursColumn,
  type WorkerActivityDetailRow,
} from './workerActivityDetailReport';

const BASE_CSV_HEADERS = [
  'fecha',
  'contacto',
  'tipo',
  'descripcion',
  'operario',
  'horas planificadas actividad',
] as const;

const ASSIGNED_HOURS_HEADER = 'horas asignadas' as const;
const REPORTED_HOURS_HEADER = 'horas reportadas' as const;
const SIGNED_HOURS_HEADER = 'horas firmadas' as const;
const SHIFT_HEADER = 'turno' as const;

const TAIL_CSV_HEADERS = [
  'estado informe',
  'zonas',
  'notas',
  'albaran',
  'fecha albaran',
  'documentos vinculados',
  'conceptos factura',
  'conceptos extra',
] as const;

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDetailDate(isoDate: string): string {
  try {
    return format(parseISO(isoDate), 'd/M/yyyy', { locale: es });
  } catch {
    return isoDate;
  }
}

function formatHoursCell(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return DETAIL_EMPTY_LABEL;
  return String(hours);
}

function formatOptionalText(value: string | null | undefined): string {
  if (!value?.trim()) return DETAIL_EMPTY_LABEL;
  return value;
}

export function workerActivityDetailCsvHeaders(options: {
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
} = {}): string[] {
  const headers: string[] = [...BASE_CSV_HEADERS];

  if (options.shiftSchedulingEnabled) {
    headers.push(ASSIGNED_HOURS_HEADER);
  }

  if (workerDetailShowsReportedHoursColumn(options)) {
    headers.push(REPORTED_HOURS_HEADER);
  }

  if (options.workerSignaturesEnabled) {
    headers.push(SIGNED_HOURS_HEADER);
  }

  headers.push(workerPeriodHoursMetricLabel(options).toLowerCase());
  headers.push(...TAIL_CSV_HEADERS);

  if (options.shiftSchedulingEnabled) {
    headers.push(SHIFT_HEADER);
  }

  return headers;
}

export function workerActivityDetailRowToCsvCells(
  row: WorkerActivityDetailRow,
  options: {
    workerSignaturesEnabled?: boolean;
    shiftSchedulingEnabled?: boolean;
  } = {},
): string[] {
  const cells: string[] = [
    formatDetailDate(row.date),
    row.clientName,
    row.typeLabel,
    row.description,
    row.workerName,
    formatHoursCell(row.plannedActivityHours),
  ];

  if (options.shiftSchedulingEnabled) {
    cells.push(formatHoursCell(row.assignedHours));
  }

  if (workerDetailShowsReportedHoursColumn(options)) {
    cells.push(formatHoursCell(row.reportedHours));
  }

  if (options.workerSignaturesEnabled) {
    cells.push(formatHoursCell(row.signedHours));
  }

  cells.push(formatHoursCell(row.reportHours));

  cells.push(
    row.reportStatus,
    row.zones,
    row.notes,
    row.deliveryNoteNumber ?? DETAIL_EMPTY_LABEL,
    row.deliveryNoteDate ? formatDetailDate(row.deliveryNoteDate) : DETAIL_EMPTY_LABEL,
    row.linkedDocuments,
    row.invoiceConcepts,
    row.extraConcepts,
  );

  if (options.shiftSchedulingEnabled) {
    cells.push(formatOptionalText(row.shiftLabel));
  }

  return cells;
}

export function workerActivityDetailRowsToCsv(
  rows: WorkerActivityDetailRow[],
  options: {
    workerSignaturesEnabled?: boolean;
    shiftSchedulingEnabled?: boolean;
  } = {},
): string {
  const delimiter = ';';
  const headers = workerActivityDetailCsvHeaders(options);
  const lines = [
    headers.map((header) => escapeCsvField(header)).join(delimiter),
    ...rows.map((row) =>
      workerActivityDetailRowToCsvCells(row, options)
        .map((value) => escapeCsvField(value))
        .join(delimiter),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadWorkerDetailedReportCsv(
  rows: WorkerActivityDetailRow[],
  filename: string,
  options: {
    workerSignaturesEnabled?: boolean;
    shiftSchedulingEnabled?: boolean;
  } = {},
): void {
  const blob = new Blob([`\uFEFF${workerActivityDetailRowsToCsv(rows, options)}`], {
    type: 'text/csv;charset=utf-8;',
  });
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

export function buildWorkerDetailedReportFilename(
  workerName: string,
  from: string,
  to: string,
): string {
  const safeName = workerName.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
  const suffix = from === to ? from : `${from}_${to}`;
  return `informe_detalle_${safeName}_${suffix}.csv`;
}
