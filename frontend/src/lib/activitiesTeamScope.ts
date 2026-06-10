import type { Activity, CalendarEvent } from '@shared/types';
import { findEventForActivity, getActivityAssigneeIds } from '@shared/types';
import { findActivityForEvent } from '@/lib/activityUtils';
import { isAllTeamUsers } from '@/lib/activitiesTeamFilter';

export function activityMatchesTeamUser(
  activity: Activity,
  events: CalendarEvent[],
  teamUserId: string,
  teamAssigneeIds: Set<string>,
): boolean {
  if (isAllTeamUsers(teamUserId)) {
    return true;
  }
  const event = findEventForActivity(activity, events);
  const ids = getActivityAssigneeIds(activity, event);
  return ids.includes(teamUserId);
}

export function eventMatchesTeamUser(
  event: CalendarEvent,
  activities: Activity[],
  teamUserId: string,
  teamAssigneeIds: Set<string>,
): boolean {
  if (isAllTeamUsers(teamUserId)) {
    return true;
  }
  const activity = findActivityForEvent(event, activities);
  if (activity) {
    const ids = getActivityAssigneeIds(activity, event);
    return ids.includes(teamUserId);
  }
  const assigned = event.assignedTo ?? [];
  return assigned.includes(teamUserId);
}
