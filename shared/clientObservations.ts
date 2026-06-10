import type { Client, ClientObservation, User } from './types.js';

export type ObservationOwnerUser = Pick<User, 'id' | 'role'> | null | undefined;

function sanitizeObservation(
  item: unknown,
  client: { id: string; createdAt: string },
  index: number,
): ClientObservation | null {
  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    return {
      id: `legacy-${client.id}-${index}`,
      text,
      userId: '',
      userName: 'Sistema',
      createdAt: client.createdAt,
    };
  }

  if (!item || typeof item !== 'object') return null;

  const observation = item as Partial<ClientObservation>;
  const text = typeof observation.text === 'string' ? observation.text.trim() : '';
  if (!text) return null;

  return {
    id:
      typeof observation.id === 'string' && observation.id
        ? observation.id
        : `legacy-${client.id}-${index}`,
    text,
    userId: typeof observation.userId === 'string' ? observation.userId : '',
    userName: typeof observation.userName === 'string' ? observation.userName : 'Sistema',
    createdAt:
      typeof observation.createdAt === 'string' && observation.createdAt
        ? observation.createdAt
        : client.createdAt,
  };
}

export function normalizeClientObservations(
  client: Omit<Client, 'observations'> & { observations?: Client['observations'] | string },
): Client {
  if (Array.isArray(client.observations)) {
    const observations = client.observations
      .map((item, index) => sanitizeObservation(item, client, index))
      .filter((item): item is ClientObservation => item !== null);
    return { ...client, observations };
  }

  if (typeof client.observations === 'string' && client.observations.trim()) {
    return {
      ...client,
      observations: [
        {
          id: `legacy-${client.id}`,
          text: client.observations.trim(),
          userId: '',
          userName: 'Sistema',
          createdAt: client.createdAt,
        },
      ],
    };
  }

  return { ...client, observations: [] };
}

export function canDeleteClientObservation(
  user: ObservationOwnerUser,
  observation: ClientObservation,
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return observation.userId === user.id;
}
