import type { Activity, ActivityType, CalendarEvent } from '@shared/types';
import { hoursFromTimeRange } from '../../../shared/dateUtils.js';
import { parseEventTypeIdFromTitle } from '../../../shared/activityTypes.js';
import { DB_NAMES } from '../config.js';
import { getById, insertDoc, listAll, updateDoc, withDbTransaction } from './repository.js';

function findMatchingActivity(event: CalendarEvent, activities: Activity[]): Activity | undefined {
  if (event.activityId) {
    const linked = activities.find((activity) => activity.id === event.activityId);
    if (linked) return linked;
  }

  if (!event.clientId) return undefined;

  return activities.find(
    (activity) =>
      activity.clientId === event.clientId &&
      activity.date === event.date &&
      activity.description === event.description,
  );
}

function activityFromEvent(
  event: CalendarEvent,
  activityTypes: ActivityType[],
): Omit<Activity, 'id' | 'createdAt'> {
  const type =
    parseEventTypeIdFromTitle(event.title, activityTypes) ||
    activityTypes.find((item) => item.id === 'at-7')?.id ||
    activityTypes[0]?.id ||
    'at-7';

  return {
    workspaceId: event.workspaceId,
    clientId: event.clientId!,
    userId: event.createdBy,
    date: event.date,
    type,
    description: event.description,
    hours: hoursFromTimeRange(event.startTime, event.endTime),
    attachments: [],
  };
}

export async function ensureEventActivityLinks(): Promise<void> {
  const [events, activities, activityTypes] = await Promise.all([
    listAll<CalendarEvent>(DB_NAMES.events),
    listAll<Activity>(DB_NAMES.activities),
    listAll<ActivityType>(DB_NAMES.activityTypes),
  ]);

  if (activityTypes.length === 0) return;

  let changed = false;

  await withDbTransaction(async () => {
    const activityList = [...activities];

    for (const event of events) {
      if (!event.clientId) continue;

      let activity = findMatchingActivity(event, activityList);

      if (!activity) {
        const created: Activity = {
          ...activityFromEvent(event, activityTypes),
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
        await insertDoc(DB_NAMES.activities, created);
        activityList.push(created);
        activity = created;
        changed = true;
      }

      if (event.activityId !== activity.id) {
        await updateDoc<CalendarEvent>(DB_NAMES.events, event.id, { activityId: activity.id });
        changed = true;
      }

      const linked = await getById<Activity>(DB_NAMES.activities, activity.id);
      if (!linked) continue;

      const parsedType = parseEventTypeIdFromTitle(event.title, activityTypes);
      if (parsedType && linked.type !== parsedType) {
        await updateDoc<Activity>(DB_NAMES.activities, linked.id, { type: parsedType });
        changed = true;
      }
    }
  });

  if (changed) {
    console.log('Eventos del calendario vinculados a actividades CRM.');
  }
}
