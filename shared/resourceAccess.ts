import type { Activity, CalendarEvent, Client, Document, DocumentTypeGroup, User } from './types.js';
import {
  filterActivitiesAssignedToUser,
  filterDocumentsForActivities,
  getAssignedClientIdsForUser,
  isUserAssignedToActivity,
} from './scheduleActivityAssignees.js';

export type ResourceAccessUser = Pick<User, 'id' | 'role'>;

/** Operarios no pueden ver ni crear facturas. */
export function isDocumentTypeBlockedForOperator(type: Document['type']): boolean {
  return type === 'invoice';
}

/** Valor persistido en BD; facturas siempre false. Tras bootstrap/migracion, isPublic esta definido. */
export function resolveDocumentTypeGroupIsPublic(group: DocumentTypeGroup): boolean {
  if (group.documentType === 'invoice') return false;
  return group.isPublic === true;
}

export function isDocumentTypePublicForOperators(
  documentType: Document['type'],
  groups: readonly DocumentTypeGroup[],
): boolean {
  const matching = groups.filter((group) => group.documentType === documentType);
  if (matching.length === 0) return false;
  return matching.some((group) => resolveDocumentTypeGroupIsPublic(group));
}

/**
 * Visibilidad de contactos para operarios: solo contactos ligados a actividades
 * en las que estan asignados (`canUserAccessClient` / `filterClientsForUser`).
 * Los grupos de contactos (`ClientGroup`) son taxonomia admin; no tienen isPublic
 * ni gobiernan ACL de operarios.
 */
export function canUserAccessClient(
  clientId: string,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  user: ResourceAccessUser,
): boolean {
  if (user.role === 'admin') return true;
  const assignedClientIds = getAssignedClientIdsForUser(activities, events, user.id);
  return assignedClientIds.includes(clientId);
}

export function filterClientsForUser(
  clients: readonly Client[],
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  user: ResourceAccessUser,
): Client[] {
  if (user.role === 'admin') return [...clients];
  const allowedIds = new Set(getAssignedClientIdsForUser(activities, events, user.id));
  return clients.filter((client) => allowedIds.has(client.id));
}

/** Operario: sin facturas; albaranes publicos del grupo o ligados a actividad asignada. */
export function canUserAccessDocument(
  document: Pick<Document, 'activityId' | 'type'>,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  user: ResourceAccessUser,
  documentTypeGroups: readonly DocumentTypeGroup[] = [],
): boolean {
  if (user.role === 'admin') return true;
  if (isDocumentTypeBlockedForOperator(document.type)) return false;

  if (isDocumentTypePublicForOperators(document.type, documentTypeGroups)) {
    return true;
  }

  if (!document.activityId) return false;
  const activity = activities.find((item) => item.id === document.activityId);
  if (!activity) return false;
  return isUserAssignedToActivity(activity, events, user.id);
}

export function filterDocumentsForUser(
  documents: readonly Document[],
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  user: ResourceAccessUser,
  documentTypeGroups: readonly DocumentTypeGroup[] = [],
): Document[] {
  if (user.role === 'admin') return [...documents];
  return documents.filter((document) =>
    canUserAccessDocument(document, activities, events, user, documentTypeGroups),
  );
}

/** Operarios no ven el grupo Facturas en navegacion. */
export function filterDocumentTypeGroupsForUser(
  groups: readonly DocumentTypeGroup[],
  user: ResourceAccessUser,
): DocumentTypeGroup[] {
  if (user.role === 'admin') return [...groups];
  return groups.filter((group) => !isDocumentTypeBlockedForOperator(group.documentType));
}

export function canOperatorCreateDocumentType(type: Document['type']): boolean {
  return !isDocumentTypeBlockedForOperator(type);
}

export {
  filterActivitiesAssignedToUser,
  filterDocumentsForActivities,
  getAssignedClientIdsForUser,
};
