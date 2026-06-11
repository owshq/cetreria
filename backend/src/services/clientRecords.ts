import type { Client } from '@shared/types';
import {
  normalizeClientAssignedUserIds,
  normalizeClientCreatedAt,
  normalizeClientCreatedAtPrecision,
  normalizeClientCustomFields,
  normalizeClientObservations,
} from '@shared/types';

export function normalizeClientRecord(
  client: Client & { website?: string; web?: string; groupId?: string },
  workspaceId?: string,
): Client {
  const normalized = normalizeClientObservations(client);
  const website = (normalized.website ?? client.web ?? '').trim();

  return {
    ...normalized,
    workspaceId: normalized.workspaceId ?? workspaceId ?? '',
    groupId: normalized.groupId ?? client.groupId ?? '',
    name: normalized.name?.trim() ?? '',
    logoUrl: normalized.logoUrl?.trim() || undefined,
    email: normalized.email?.trim() ?? '',
    phone: normalized.phone?.trim() ?? '',
    address: normalized.address?.trim() ?? '',
    city: normalized.city?.trim() ?? '',
    postalCode: normalized.postalCode?.trim() ?? '',
    country: normalized.country?.trim() ?? '',
    state: normalized.state?.trim() ?? '',
    website,
    technicalInfo: normalized.technicalInfo?.trim() ?? '',
    status: normalized.status ?? 'active',
    ...(() => {
      const createdAtPrecision = normalizeClientCreatedAtPrecision(
        normalized.createdAtPrecision,
        normalized.createdAt,
      );
      return {
        createdAt: normalizeClientCreatedAt(normalized.createdAt, createdAtPrecision),
        createdAtPrecision,
      };
    })(),
    observations: normalized.observations ?? [],
    customFields: normalizeClientCustomFields(normalized.customFields),
    assignedUserIds: normalizeClientAssignedUserIds(normalized.assignedUserIds),
  };
}

export const CLIENT_PROTECTED_FIELDS = ['id', 'workspaceId', 'observations'] as const;

export function mergeClientUpdates(
  existing: Client,
  updates: Partial<Client>,
  workspaceId: string,
): Client {
  const {
    id: _id,
    workspaceId: _workspaceId,
    observations: _observations,
    ...safeUpdates
  } = updates;

  const createdAtPrecision =
    updates.createdAtPrecision !== undefined
      ? normalizeClientCreatedAtPrecision(
          updates.createdAtPrecision,
          updates.createdAt ?? existing.createdAt,
        )
      : updates.createdAt !== undefined
        ? normalizeClientCreatedAtPrecision(undefined, updates.createdAt)
        : existing.createdAtPrecision;

  const createdAt =
    updates.createdAt !== undefined
      ? normalizeClientCreatedAt(updates.createdAt, createdAtPrecision ?? 'day')
      : existing.createdAt;

  return normalizeClientRecord(
    {
      ...existing,
      ...safeUpdates,
      id: existing.id,
      workspaceId: existing.workspaceId ?? workspaceId,
      createdAt,
      createdAtPrecision,
      observations: existing.observations,
    },
    workspaceId,
  );
}
