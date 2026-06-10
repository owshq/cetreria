import type { Activity, CalendarEvent, Document, ShiftCode } from '@shared/types';
import {
  buildShiftEventTimes,
  findEventForActivity,
  hoursForWorkerOnActivity,
  listUserActivitiesOnDate,
  type ScheduleDaySummary,
} from '@shared/types';

export type ScheduleJornadaRow = {
  id: string;
  date: string;
  shift: ShiftCode;
  hourRange: string | null;
  hours: number;
  activity: Activity | null;
  documents: Document[];
};

export function formatShiftHourRangeForRow(
  shift: ShiftCode,
  shiftEventTimes: ReturnType<typeof buildShiftEventTimes>,
): string | null {
  if (shift === 'L' || shift === 'V') return null;
  const { startTime, endTime } = shiftEventTimes[shift];
  return `${startTime} – ${endTime}`;
}

function activityHoursForUser(
  activity: Activity,
  events: CalendarEvent[],
  userId: string,
  boundaries: Parameters<typeof hoursForWorkerOnActivity>[3],
): number {
  const event = findEventForActivity(activity, events);
  return hoursForWorkerOnActivity(activity, event, userId, boundaries);
}

export function buildScheduleJornadaRows(
  assignedDays: ScheduleDaySummary[],
  activities: Activity[],
  events: CalendarEvent[],
  documents: Document[],
  userId: string,
  shiftEventTimes: ReturnType<typeof buildShiftEventTimes>,
  boundaries: Parameters<typeof hoursForWorkerOnActivity>[3],
): ScheduleJornadaRow[] {
  const documentsByActivityId = new Map<string, Document[]>();
  for (const doc of documents) {
    if (!doc.activityId) continue;
    const list = documentsByActivityId.get(doc.activityId) ?? [];
    list.push(doc);
    documentsByActivityId.set(doc.activityId, list);
  }

  const rows: ScheduleJornadaRow[] = [];

  for (const day of assignedDays) {
    const hourRange = formatShiftHourRangeForRow(day.shift, shiftEventTimes);
    const dayActivities = listUserActivitiesOnDate(activities, events, userId, day.date);

    if (dayActivities.length === 0) {
      rows.push({
        id: day.date,
        date: day.date,
        shift: day.shift,
        hourRange,
        hours: day.hours,
        activity: null,
        documents: [],
      });
      continue;
    }

    for (const activity of dayActivities) {
      rows.push({
        id: `${day.date}-${activity.id}`,
        date: day.date,
        shift: day.shift,
        hourRange,
        hours: activityHoursForUser(activity, events, userId, boundaries),
        activity,
        documents: documentsByActivityId.get(activity.id) ?? [],
      });
    }
  }

  return rows;
}
