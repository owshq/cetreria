import type { CalendarEvent, Client } from '@shared/types';

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;

  const parts: string[] = [];
  let remaining = line;

  while (remaining.length > 75) {
    parts.push(remaining.slice(0, 75));
    remaining = remaining.slice(75);
  }
  if (remaining.length > 0) parts.push(remaining);

  return parts.join('\r\n ');
}

function formatIcsLocalDateTime(date: string, time: string): string {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const [year, month, day] = date.split('-');
  const [hour, minute, second = '00'] = normalizedTime.split(':');
  return `${year}${month}${day}T${hour.padStart(2, '0')}${minute.padStart(2, '0')}${second.slice(0, 2).padStart(2, '0')}`;
}

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildEventLines(event: CalendarEvent, client?: Client): string[] {
  const dtStart = formatIcsLocalDateTime(event.date, event.startTime);
  const dtEnd = formatIcsLocalDateTime(event.date, event.endTime || event.startTime);

  const descriptionParts: string[] = [];
  if (client) descriptionParts.push(`Contacto: ${client.name}`);
  if (event.description) descriptionParts.push(event.description);

  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@crm-cetreria`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];

  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join('\n'))}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendarIcs(
  events: CalendarEvent[],
  clientsById?: Map<string, Client>,
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CRM Cetreria//Calendario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    const client = event.clientId ? clientsById?.get(event.clientId) : undefined;
    lines.push(...buildEventLines(event, client));
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

export function downloadCalendarIcs(
  events: CalendarEvent[],
  clientsById?: Map<string, Client>,
  filename = 'calendario.ics',
): void {
  const content = buildCalendarIcs(events, clientsById);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
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
