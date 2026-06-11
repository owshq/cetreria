import type { Activity, CalendarEvent, Client } from '@shared/types';
import {
  findEventForActivity,
  getActivityAssigneeIds,
  getAssignedClientIdsForUser,
  normalizeClientAssignedUserIds,
} from '@shared/types';
import { isAllTeamUsers } from '@/lib/activitiesTeamFilter';

/** Operarios con acceso al contacto por actividades o eventos (sin incluir asignacion explicita). */
export function getClientActivityOperatorIds(
  clientId: string,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
): string[] {
  const ids = new Set<string>();

  for (const activity of activities) {
    if (activity.clientId !== clientId) continue;
    const event = findEventForActivity(activity, events as CalendarEvent[]);
    for (const assigneeId of getActivityAssigneeIds(activity, event)) {
      ids.add(assigneeId);
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function buildClientOperatorIdsMap(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  clients: readonly Pick<Client, 'id' | 'assignedUserIds'>[] = [],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const activity of activities) {
    const event = findEventForActivity(activity, events as CalendarEvent[]);
    const assigneeIds = getActivityAssigneeIds(activity, event);
    if (assigneeIds.length === 0) continue;

    let operatorIds = map.get(activity.clientId);
    if (!operatorIds) {
      operatorIds = new Set<string>();
      map.set(activity.clientId, operatorIds);
    }
    for (const assigneeId of assigneeIds) {
      operatorIds.add(assigneeId);
    }
  }

  for (const client of clients) {
    const explicitIds = normalizeClientAssignedUserIds(client.assignedUserIds);
    if (explicitIds.length === 0) continue;
    let operatorIds = map.get(client.id);
    if (!operatorIds) {
      operatorIds = new Set<string>();
      map.set(client.id, operatorIds);
    }
    for (const userId of explicitIds) {
      operatorIds.add(userId);
    }
  }

  return map;
}

function getClientIdsForOperator(
  operatorId: string,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  clients: readonly Pick<Client, 'id' | 'assignedUserIds'>[],
): Set<string> {
  const ids = new Set(getAssignedClientIdsForUser(activities, events, operatorId));
  for (const client of clients) {
    if (normalizeClientAssignedUserIds(client.assignedUserIds).includes(operatorId)) {
      ids.add(client.id);
    }
  }
  return ids;
}

export function filterClientsByOperator<T extends { id: string }>(
  clients: readonly T[],
  operatorId: string,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  allClients: readonly Pick<Client, 'id' | 'assignedUserIds'>[] = clients,
): T[] {
  if (isAllTeamUsers(operatorId)) return [...clients];
  const allowedIds = getClientIdsForOperator(operatorId, activities, events, allClients);
  return clients.filter((client) => allowedIds.has(client.id));
}

export function clientHasOperator(
  clientId: string,
  operatorId: string,
  clientOperatorIds: Map<string, Set<string>>,
): boolean {
  if (isAllTeamUsers(operatorId)) return true;
  return clientOperatorIds.get(clientId)?.has(operatorId) ?? false;
}
