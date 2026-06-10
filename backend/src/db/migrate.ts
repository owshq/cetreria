import type {
  Activity,
  ActivityWorkerSignature,
  CalendarEvent,
  Client,
  Document,
  MonthlyReport,
  User,
} from '../../../shared/types.js';
import { isValidUuid } from '../../../shared/ids.js';
import { hoursForAssigneeSlot } from '../../../shared/activityAssignees.js';
import { normalizeClientObservations } from '../../../shared/clientObservations.js';
import { DB_NAMES } from '../config.js';
import { refreshDbFromDisk } from './store.js';

type IdMap = Map<string, string>;

function ensureUniqueIds<T extends { id: string }>(items: T[]): { items: T[]; idMap: IdMap } {
  const idMap: IdMap = new Map();
  const used = new Set<string>();

  const migrated = items.map((item) => {
    let id = item.id;
    if (!isValidUuid(id) || used.has(id)) {
      const nextId = crypto.randomUUID();
      if (id) idMap.set(id, nextId);
      id = nextId;
    }
    used.add(id);
    return { ...item, id };
  });

  return { items: migrated, idMap };
}

function remapId(idMap: IdMap, value: string | undefined): string | undefined {
  if (!value) return value;
  return idMap.get(value) ?? value;
}

function remapIdList(idMap: IdMap, values: string[]): string[] {
  return values.map((value) => idMap.get(value) ?? value);
}

function migrateClient(client: Client & { web?: string }, userIdMap: IdMap): Client {
  const normalized = normalizeClientObservations(client);
  const website = (normalized.website ?? client.web ?? '').trim();
  const usedObsIds = new Set<string>();

  const observations = normalized.observations.map((obs) => {
    let id = obs.id;
    if (!isValidUuid(id) || usedObsIds.has(id)) {
      id = crypto.randomUUID();
    }
    usedObsIds.add(id);

    return {
      ...obs,
      id,
      userId: obs.userId ? (remapId(userIdMap, obs.userId) ?? obs.userId) : obs.userId,
    };
  });

  return { ...normalized, website, observations };
}

function ensureActivityDate(activity: Activity): Activity {
  if (activity.date) return activity;
  const fallback = activity.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return { ...activity, date: fallback };
}

type ActivityWithLegacySignature = Activity & {
  operatorSignature?: ActivityWorkerSignature;
};

function migrateActivityWorkerSignature(activity: Activity): Activity {
  const withOperator = (() => {
    const legacy = (activity as ActivityWithLegacySignature).operatorSignature;
    if (!legacy || activity.workerSignature) return activity;
    const { operatorSignature: _removed, ...rest } = activity as ActivityWithLegacySignature;
    return { ...rest, workerSignature: legacy };
  })();

  const signature = withOperator.workerSignature;
  if (!signature?.imageDataUrl?.trim()) return withOperator;

  const slots = withOperator.assigneeSlots ?? [];
  if (slots.some((slot) => slot.workerSignature?.imageDataUrl?.trim())) {
    return withOperator;
  }

  const userSlot = slots.find((slot) => slot.userId === signature.userId);
  if (!userSlot) return withOperator;

  const slotHours = slots
    .filter((slot) => slot.userId === signature.userId)
    .reduce((sum, slot) => sum + hoursForAssigneeSlot(slot), 0);

  const signatureWithHours = {
    ...signature,
    hours:
      typeof signature.hours === 'number' && signature.hours > 0
        ? signature.hours
        : slotHours > 0
          ? slotHours
          : withOperator.hours ?? 0,
  };

  return {
    ...withOperator,
    workerSignature: signatureWithHours,
    assigneeSlots: slots.map((slot) =>
      slot.userId === signature.userId
        ? { ...slot, workerSignature: signatureWithHours }
        : slot,
    ),
  };
}

function ensureDocumentDate(document: Document): Document {
  if (document.date) return document;
  const fallback = document.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return { ...document, date: fallback };
}

export async function migrateData(): Promise<void> {
  const db = await refreshDbFromDisk();
  let changed = false;

  const { items: users, idMap: userIdMap } = ensureUniqueIds(
    db.data[DB_NAMES.users] as unknown as User[],
  );
  if (JSON.stringify(users) !== JSON.stringify(db.data[DB_NAMES.users])) {
    changed = true;
  }
  db.data[DB_NAMES.users] = users as unknown as typeof db.data[typeof DB_NAMES.users];

  const { items: clients, idMap: clientIdMap } = ensureUniqueIds(
    db.data[DB_NAMES.clients] as unknown as Client[],
  );
  const normalizedClients = clients.map((client) => migrateClient(client, userIdMap));
  if (JSON.stringify(normalizedClients) !== JSON.stringify(db.data[DB_NAMES.clients])) {
    changed = true;
  }
  db.data[DB_NAMES.clients] = normalizedClients as unknown as typeof db.data[typeof DB_NAMES.clients];

  const { items: activities, idMap: activityIdMap } = ensureUniqueIds(
    db.data[DB_NAMES.activities] as unknown as Activity[],
  );
  const migratedActivities = activities
    .map((activity) => ensureActivityDate(activity))
    .map((activity) => migrateActivityWorkerSignature(activity))
    .map((activity) => ({
      ...activity,
      clientId: remapId(clientIdMap, activity.clientId) ?? activity.clientId,
      userId: remapId(userIdMap, activity.userId) ?? activity.userId,
    }));
  if (JSON.stringify(migratedActivities) !== JSON.stringify(db.data[DB_NAMES.activities])) {
    changed = true;
  }
  db.data[DB_NAMES.activities] =
    migratedActivities as unknown as typeof db.data[typeof DB_NAMES.activities];

  const { items: documents } = ensureUniqueIds(
    db.data[DB_NAMES.documents] as unknown as Document[],
  );
  const migratedDocuments = documents
    .map((document) => ensureDocumentDate(document))
    .map((document) => ({
      ...document,
      clientId: remapId(clientIdMap, document.clientId) ?? document.clientId,
      activityId: remapId(activityIdMap, document.activityId),
    }));
  if (JSON.stringify(migratedDocuments) !== JSON.stringify(db.data[DB_NAMES.documents])) {
    changed = true;
  }
  db.data[DB_NAMES.documents] =
    migratedDocuments as unknown as typeof db.data[typeof DB_NAMES.documents];

  const { items: events } = ensureUniqueIds(
    db.data[DB_NAMES.events] as unknown as CalendarEvent[],
  );
  const migratedEvents = events.map((event) => ({
    ...event,
    clientId: remapId(clientIdMap, event.clientId),
    activityId: remapId(activityIdMap, event.activityId),
    createdBy: remapId(userIdMap, event.createdBy) ?? event.createdBy,
    assignedTo: remapIdList(userIdMap, event.assignedTo),
  }));
  if (JSON.stringify(migratedEvents) !== JSON.stringify(db.data[DB_NAMES.events])) {
    changed = true;
  }
  db.data[DB_NAMES.events] = migratedEvents as unknown as typeof db.data[typeof DB_NAMES.events];

  const { items: reports } = ensureUniqueIds(
    db.data[DB_NAMES.reports] as unknown as MonthlyReport[],
  );
  const migratedReports = reports.map((report) => ({
    ...report,
    clientId: remapId(clientIdMap, report.clientId) ?? report.clientId,
    activities: report.activities.map((activity) => {
      const dated = ensureActivityDate(activity);
      const signed = migrateActivityWorkerSignature(dated);
      return {
        ...signed,
        id: remapId(activityIdMap, signed.id) ?? signed.id,
        clientId: remapId(clientIdMap, signed.clientId) ?? signed.clientId,
        userId: remapId(userIdMap, signed.userId) ?? signed.userId,
      };
    }),
  }));
  if (JSON.stringify(migratedReports) !== JSON.stringify(db.data[DB_NAMES.reports])) {
    changed = true;
  }
  db.data[DB_NAMES.reports] = migratedReports as unknown as typeof db.data[typeof DB_NAMES.reports];

  if (userIdMap.size > 0 || clientIdMap.size > 0 || activityIdMap.size > 0) {
    changed = true;
  }

  if (changed) {
    await db.write();
    console.log('Datos migrados: UUIDs de usuarios y referencias actualizadas.');
  }
}
