import { isValidUuid } from '../../../shared/ids.js';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  ClientGroup,
  Document,
  User,
  Workspace,
} from '@shared/types';

export type PreflightDbSnapshot = {
  clients: readonly Client[];
  activities: readonly Activity[];
  events: readonly CalendarEvent[];
  documents: readonly Document[];
  users?: readonly User[];
  workspaces?: readonly Workspace[];
  clientGroups?: readonly ClientGroup[];
  activityTypes?: readonly ActivityType[];
};

function clientEmailKey(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function assertNoDuplicateIds(
  label: string,
  items: readonly { id: string }[],
  violations: string[],
): void {
  const seen = new Map<string, number>();
  for (const item of items) {
    seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
  }
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    const sample = duplicates
      .slice(0, 5)
      .map(([id, count]) => `${id} (×${count})`)
      .join(', ');
    violations.push(`${duplicates.length} id(s) duplicado(s) en ${label}: ${sample}`);
  }
}

function assertValidEntityIds(
  label: string,
  items: readonly { id: string }[],
  violations: string[],
): void {
  const invalid = items.filter((item) => !isValidUuid(item.id));
  if (invalid.length > 0) {
    const sample = invalid
      .slice(0, 5)
      .map((item) => item.id)
      .join(', ');
    violations.push(`${invalid.length} ${label} con id UUID inválido: ${sample}`);
  }
}

function assertValidRefIds(
  label: string,
  refs: readonly (string | undefined)[],
  violations: string[],
): void {
  const invalid = refs.filter((ref): ref is string => !!ref && !isValidUuid(ref));
  if (invalid.length > 0) {
    const sample = [...new Set(invalid)].slice(0, 5).join(', ');
    violations.push(`${invalid.length} ${label} con referencia UUID inválida: ${sample}`);
  }
}

export function assertPreflightDbIntegrity(input: PreflightDbSnapshot): void {
  const violations: string[] = [];

  const workspaceIds = new Set((input.workspaces ?? []).map((workspace) => workspace.id));
  const userIds = new Set((input.users ?? []).map((user) => user.id));
  const clientIds = new Set(input.clients.map((client) => client.id));
  const activityIds = new Set(input.activities.map((activity) => activity.id));
  const clientGroupIds = new Set((input.clientGroups ?? []).map((group) => group.id));
  const activityTypeIds = new Set((input.activityTypes ?? []).map((type) => type.id));

  assertNoDuplicateIds('clients', input.clients, violations);
  assertNoDuplicateIds('activities', input.activities, violations);
  assertNoDuplicateIds('events', input.events, violations);
  assertNoDuplicateIds('documents', input.documents, violations);

  assertValidEntityIds('contacto(s)', input.clients, violations);
  assertValidEntityIds('actividad(es)', input.activities, violations);
  assertValidEntityIds('evento(s)', input.events, violations);
  assertValidEntityIds('documento(s)', input.documents, violations);

  assertValidRefIds(
    'referencia(s) clientId/activityId/workspaceId',
    [
      ...input.clients.map((client) => client.workspaceId),
      ...input.clients.map((client) => client.groupId),
      ...input.activities.map((activity) => activity.workspaceId),
      ...input.activities.map((activity) => activity.clientId),
      ...input.activities.map((activity) => activity.userId),
      ...input.events.map((event) => event.workspaceId),
      ...input.events.flatMap((event) => [event.clientId, event.activityId]),
      ...input.events.map((event) => event.createdBy),
      ...input.events.flatMap((event) => event.assignedTo),
      ...input.documents.map((document) => document.workspaceId),
      ...input.documents.map((document) => document.clientId),
      ...input.documents.map((document) => document.activityId),
    ],
    violations,
  );

  if (input.workspaces) {
    let orphanClientWorkspaces = 0;
    for (const client of input.clients) {
      if (client.workspaceId && !workspaceIds.has(client.workspaceId)) orphanClientWorkspaces++;
    }
    if (orphanClientWorkspaces > 0) {
      violations.push(`${orphanClientWorkspaces} contacto(s) con workspaceId inexistente`);
    }
  }

  if (input.clientGroups) {
    let orphanClientGroups = 0;
    for (const client of input.clients) {
      if (client.groupId && !clientGroupIds.has(client.groupId)) orphanClientGroups++;
    }
    if (orphanClientGroups > 0) {
      violations.push(`${orphanClientGroups} contacto(s) con groupId inexistente`);
    }
  }

  if (input.users) {
    let orphanActivityUsers = 0;
    for (const activity of input.activities) {
      if (activity.userId && !userIds.has(activity.userId)) orphanActivityUsers++;
    }
    if (orphanActivityUsers > 0) {
      violations.push(`${orphanActivityUsers} actividad(es) con userId inexistente`);
    }
  }

  if (input.activityTypes) {
    let orphanActivityTypes = 0;
    for (const activity of input.activities) {
      if (activity.type && !activityTypeIds.has(activity.type)) orphanActivityTypes++;
    }
    if (orphanActivityTypes > 0) {
      violations.push(`${orphanActivityTypes} actividad(es) con type (activity_types) inexistente`);
    }
  }

  const emailsByWorkspace = new Map<string, Map<string, string[]>>();
  for (const client of input.clients) {
    const emailKey = clientEmailKey(client.email);
    if (!emailKey) continue;
    const bucket = emailsByWorkspace.get(client.workspaceId) ?? new Map<string, string[]>();
    const ids = bucket.get(emailKey) ?? [];
    ids.push(client.id);
    bucket.set(emailKey, ids);
    emailsByWorkspace.set(client.workspaceId, bucket);
  }
  let duplicateEmailPairs = 0;
  const duplicateSamples: string[] = [];
  for (const [workspaceId, bucket] of emailsByWorkspace) {
    for (const [email, ids] of bucket) {
      if (ids.length < 2) continue;
      duplicateEmailPairs++;
      if (duplicateSamples.length < 5) {
        duplicateSamples.push(`${email} en workspace ${workspaceId} (${ids.length} contactos)`);
      }
    }
  }
  if (duplicateEmailPairs > 0) {
    violations.push(
      `${duplicateEmailPairs} email(s) duplicado(s) entre contactos: ${duplicateSamples.join('; ')}`,
    );
  }

  let legacyWorkerSignatures = 0;
  let orphanActivityClients = 0;
  for (const activity of input.activities) {
    if (activity.clientId && !clientIds.has(activity.clientId)) orphanActivityClients++;
    if ('operatorSignature' in activity) legacyWorkerSignatures++;
  }
  if (legacyWorkerSignatures > 0) {
    violations.push(
      `${legacyWorkerSignatures} actividad(es) con operatorSignature legacy; ejecuta migrateData`,
    );
  }
  if (orphanActivityClients > 0) {
    violations.push(`${orphanActivityClients} actividad(es) con clientId inexistente`);
  }

  let orphanEventClients = 0;
  let orphanEventActivities = 0;
  for (const event of input.events) {
    if (event.clientId && !clientIds.has(event.clientId)) orphanEventClients++;
    if (event.activityId && !activityIds.has(event.activityId)) orphanEventActivities++;
  }
  if (orphanEventClients > 0) {
    violations.push(`${orphanEventClients} evento(s) con clientId inexistente`);
  }
  if (orphanEventActivities > 0) {
    violations.push(`${orphanEventActivities} evento(s) con activityId inexistente`);
  }

  let orphanDocumentClients = 0;
  let orphanDocumentActivities = 0;
  let missingDocumentWorkspace = 0;
  let orphanDocumentWorkspaces = 0;
  for (const document of input.documents) {
    if (!document.workspaceId) missingDocumentWorkspace++;
    else if (input.workspaces && !workspaceIds.has(document.workspaceId)) {
      orphanDocumentWorkspaces++;
    }
    if (document.clientId && !clientIds.has(document.clientId)) orphanDocumentClients++;
    if (document.activityId && !activityIds.has(document.activityId)) {
      orphanDocumentActivities++;
    }
  }
  if (missingDocumentWorkspace > 0) {
    violations.push(`${missingDocumentWorkspace} documento(s) sin workspaceId`);
  }
  if (orphanDocumentWorkspaces > 0) {
    violations.push(`${orphanDocumentWorkspaces} documento(s) con workspaceId inexistente`);
  }
  if (orphanDocumentClients > 0) {
    violations.push(`${orphanDocumentClients} documento(s) con clientId inexistente`);
  }
  if (orphanDocumentActivities > 0) {
    violations.push(`${orphanDocumentActivities} documento(s) con activityId inexistente`);
  }

  if (violations.length > 0) {
    throw new Error(`Integridad de BD:\n- ${violations.join('\n- ')}`);
  }
}
