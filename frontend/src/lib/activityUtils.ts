import type { Activity, ActivityType, CalendarEvent, Client } from '@shared/types';
import {
  getActivityAssigneeIds,
  getActivityTypeLabel,
  isActivityPast,
} from '@shared/types';

export function findEventForActivity(activity: Activity, events: CalendarEvent[]) {
  return (
    events.find((event) => event.activityId === activity.id) ??
    events.find(
      (event) =>
        event.clientId === activity.clientId &&
        event.date === activity.date &&
        event.description === activity.description,
    )
  );
}

export function findActivityForEvent(
  event: CalendarEvent,
  activities: Activity[],
): Activity | undefined {
  if (event.activityId) {
    return activities.find((activity) => activity.id === event.activityId);
  }
  return activities.find(
    (activity) =>
      activity.clientId === event.clientId &&
      activity.date === event.date &&
      activity.description === event.description,
  );
}

export function isPastActivity(activity: Activity, events?: CalendarEvent[]) {
  const event = events ? findEventForActivity(activity, events) : undefined;
  return isActivityPast({ activity, event });
}

/** Evento mínimo para mostrar una actividad sin cita en calendario (sidebar, búsqueda, etc.). */
export function buildCalendarEventStubFromActivity(
  activity: Activity,
  clientsMap: Map<string, Client>,
  activityTypes: ActivityType[],
): CalendarEvent {
  const typeLabel = activity.type
    ? getActivityTypeLabel(activity.type, activityTypes)
    : 'Actividad';
  const clientName = clientsMap.get(activity.clientId)?.name ?? '';
  const title = clientName ? `${typeLabel} - ${clientName}` : typeLabel;
  const assignedTo = getActivityAssigneeIds(activity, null);

  return {
    id: `activity-${activity.id}`,
    workspaceId: activity.workspaceId,
    title,
    description: activity.description,
    date: activity.date,
    startTime: '',
    endTime: '',
    assignedTo,
    createdBy: activity.userId ?? assignedTo[0] ?? '',
    clientId: activity.clientId,
    activityId: activity.id,
    history: [],
  };
}

export type ActivitySidebarItem = {
  event: CalendarEvent;
  activity: Activity | undefined;
};

export function buildActivitiesSidebarItems(
  eventsInView: CalendarEvent[],
  activitiesInView: Activity[],
  allActivities: Activity[],
  allEvents: CalendarEvent[],
  clientsMap: Map<string, Client>,
  activityTypes: ActivityType[],
): ActivitySidebarItem[] {
  const coveredActivityIds = new Set<string>();

  const itemsFromEvents = eventsInView.map((event) => {
    const activity = findActivityForEvent(event, allActivities);
    if (activity?.id) coveredActivityIds.add(activity.id);
    return { event, activity };
  });

  const itemsFromActivities = activitiesInView
    .filter((activity) => !coveredActivityIds.has(activity.id))
    .map((activity) => {
      const linkedEvent = findEventForActivity(activity, allEvents);
      const event =
        linkedEvent ?? buildCalendarEventStubFromActivity(activity, clientsMap, activityTypes);
      return { event, activity };
    });

  return [...itemsFromEvents, ...itemsFromActivities].sort((a, b) => {
    const dateCompare = a.event.date.localeCompare(b.event.date);
    if (dateCompare !== 0) return dateCompare;
    const startA = a.event.startTime || '00:00';
    const startB = b.event.startTime || '00:00';
    return startA.localeCompare(startB);
  });
}
