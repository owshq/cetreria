import type { Activity, CalendarEvent, Document, DocumentTypeGroup } from '@shared/types';
import {
  canUserAccessDocument,
  filterActivitiesAssignedToUser,
  filterDocumentsForUser,
  isUserAssignedToActivity,
} from '@shared/types';
import type { AuthUser } from '../middleware/auth.js';

export function activityIdToEventMap(events: CalendarEvent[]): Map<string, CalendarEvent> {
  const map = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (event.activityId) map.set(event.activityId, event);
  }
  return map;
}

/** Operarios: solo actividades en las que están asignados. Admin: todas. */
export function filterActivitiesForUser(
  activities: Activity[],
  events: CalendarEvent[],
  user: AuthUser,
): Activity[] {
  if (user.role === 'admin') return activities;
  return filterActivitiesAssignedToUser(activities, events, user.id);
}

export function canUserAccessActivity(
  user: AuthUser,
  activity: Activity,
  events: CalendarEvent[],
): boolean {
  if (user.role === 'admin') return true;
  return isUserAssignedToActivity(activity, events, user.id);
}

/** Operarios: eventos asignados o ligados a actividades suyas. Admin: todos. */
export function filterEventsForUser(
  events: CalendarEvent[],
  user: AuthUser,
  activities: Activity[] = [],
): CalendarEvent[] {
  if (user.role === 'admin') return events;
  return events.filter((event) => {
    if (event.assignedTo.includes(user.id)) return true;
    if (!event.activityId) return false;
    const activity = activities.find((item) => item.id === event.activityId);
    if (!activity) return false;
    return isUserAssignedToActivity(activity, events, user.id);
  });
}

export function filterDocumentsForUserInWorkspace(
  documents: Document[],
  activities: Activity[],
  events: CalendarEvent[],
  user: AuthUser,
  documentTypeGroups: DocumentTypeGroup[] = [],
): Document[] {
  return filterDocumentsForUser(documents, activities, events, user, documentTypeGroups);
}

export function canUserAccessDocumentRecord(
  user: AuthUser,
  document: Document,
  activities: Activity[],
  events: CalendarEvent[],
  documentTypeGroups: DocumentTypeGroup[] = [],
): boolean {
  return canUserAccessDocument(document, activities, events, user, documentTypeGroups);
}
