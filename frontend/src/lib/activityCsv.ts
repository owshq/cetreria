import type { Activity } from '@shared/types';
import {
  findEventForActivity,
  formatHoursMinutes,
  getActivityAssigneeIds,
  getActivityTypeLabel,
} from '@shared/types';
import { getActivityHoursTotals } from '@/lib/activityTableFields';
import type { ActivityTableContext } from '@/lib/activityTableView';

const CSV_HEADERS = [
  'tipo',
  'descripción',
  'fecha',
  'contacto',
  'operario',
  'horas asignadas',
  'horas firmadas',
  'documentos',
] as const;

export type ActivityCsvContext = ActivityTableContext;

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatActivityRow(activity: Activity, ctx: ActivityCsvContext): string[] {
  const client = ctx.clientsMap.get(activity.clientId);
  const event = findEventForActivity(activity, ctx.events);
  const assigneeNames = getActivityAssigneeIds(activity, event)
    .map((id) => ctx.assigneesMap.get(id)?.name)
    .filter(Boolean)
    .join(', ');
  const documents = ctx.documentsByActivityId.get(activity.id) ?? [];
  const documentNumbers = documents.map((doc) => doc.number).join(', ');
  const { assignedHours, signedHours } = getActivityHoursTotals(activity, ctx);

  return [
    getActivityTypeLabel(activity.type, ctx.activityTypes),
    activity.description?.trim() ?? '',
    activity.date,
    client?.name ?? '',
    assigneeNames,
    formatHoursMinutes(assignedHours) ?? '',
    formatHoursMinutes(signedHours) ?? '',
    documentNumbers,
  ];
}

export function activitiesToCsv(activities: Activity[], ctx: ActivityCsvContext): string {
  const delimiter = ';';
  const lines = [
    CSV_HEADERS.map((header) => escapeCsvField(header)).join(delimiter),
    ...activities.map((activity) =>
      formatActivityRow(activity, ctx)
        .map((value) => escapeCsvField(value))
        .join(delimiter),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadActivitiesCsv(
  activities: Activity[],
  ctx: ActivityCsvContext,
  filename = 'actividades.csv',
): void {
  const blob = new Blob([`\uFEFF${activitiesToCsv(activities, ctx)}`], {
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
