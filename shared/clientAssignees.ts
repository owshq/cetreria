export type ClientAssignUsersMode = 'set' | 'add' | 'remove';

export function normalizeClientAssignedUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

export function mergeClientAssignedUserIds(
  existing: readonly string[] | undefined,
  userIds: readonly string[],
  mode: ClientAssignUsersMode,
): string[] {
  const nextIds = normalizeClientAssignedUserIds(userIds);
  if (mode === 'set') return nextIds;

  const current = new Set(normalizeClientAssignedUserIds(existing));
  if (mode === 'add') {
    for (const id of nextIds) current.add(id);
    return [...current];
  }

  for (const id of nextIds) current.delete(id);
  return [...current];
}

export function isClientExplicitlyAssignedToUser(
  client: Pick<{ assignedUserIds?: string[] }, 'assignedUserIds'>,
  userId: string,
): boolean {
  return normalizeClientAssignedUserIds(client.assignedUserIds).includes(userId);
}
