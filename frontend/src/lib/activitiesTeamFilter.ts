/** Identificador de filtro «Todos los operarios» (solo admin). */
export const ACTIVITIES_ALL_USERS_ID = '__all__';

export function isAllTeamUsers(userId: string): boolean {
  return userId === ACTIVITIES_ALL_USERS_ID;
}

export function teamUserIdFromUrlParam(value: string | null): string | null {
  if (value === 'all') return ACTIVITIES_ALL_USERS_ID;
  return value;
}

export function teamUserIdToUrlParam(userId: string): string {
  return isAllTeamUsers(userId) ? 'all' : userId;
}

/** Segmentos reservados en `/activities/:id` que en realidad son filtros de equipo. */
export function isActivitiesTeamFilterPathSegment(value: string): boolean {
  return value === 'all';
}

export function activitiesListPathForTeamFilterSegment(segment: string): string | null {
  if (!isActivitiesTeamFilterPathSegment(segment)) return null;
  return `/activities?userId=${segment}`;
}
