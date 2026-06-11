import { Router } from 'express';
import type { Activity, CalendarEvent, Client, ClientObservation } from '@shared/types';
import {
  canDeleteClientObservation,
  canUserAccessClient,
  filterClientsForUser,
  mergeClientAssignedUserIds,
  normalizeClientAssignedUserIds,
  type ClientAssignUsersMode,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  getByIdInWorkspace,
  insertDoc,
  listAllInWorkspace,
  updateDoc,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { routeParam } from '../utils/routeParam.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';
import { mergeClientUpdates, normalizeClientRecord } from '../services/clientRecords.js';
import { getClientGroupInWorkspace, resolveClientGroupId } from '../db/clientGroups.js';
import {
  notifyClientChanged,
  notifyClientObservation,
} from '../services/notifications.js';
import { getWorkspaceMemberIds } from '../services/workspaces.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function loadClientAccessContext(workspaceId: string) {
  const [activities, events] = await Promise.all([
    listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
    listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
  ]);
  return { activities, events };
}

const CLIENT_ASSIGN_MODES = new Set<ClientAssignUsersMode>(['set', 'add', 'remove']);

async function resolveValidAssigneeIds(workspaceId: string, userIds: string[]): Promise<string[]> {
  const memberIds = new Set(await getWorkspaceMemberIds(workspaceId));
  return normalizeClientAssignedUserIds(userIds).filter((id) => memberIds.has(id));
}

router.post('/bulk-assign-users', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const clientIds = normalizeClientAssignedUserIds(req.body?.clientIds);
  const mode = req.body?.mode as ClientAssignUsersMode;
  if (!CLIENT_ASSIGN_MODES.has(mode)) {
    res.status(400).json({ error: 'Modo de asignacion no valido' });
    return;
  }
  if (clientIds.length === 0) {
    res.status(400).json({ error: 'Selecciona al menos un contacto' });
    return;
  }

  const userIds = await resolveValidAssigneeIds(
    workspaceId,
    normalizeClientAssignedUserIds(req.body?.userIds),
  );
  if (mode === 'add' && userIds.length === 0) {
    res.status(400).json({ error: 'Selecciona al menos un operario valido' });
    return;
  }
  if (mode === 'remove' && userIds.length === 0) {
    res.status(400).json({ error: 'Selecciona al menos un operario valido' });
    return;
  }

  const updatedClients: Client[] = [];
  for (const clientId of clientIds) {
    const existing = await getByIdInWorkspace<Client>(DB_NAMES.clients, clientId, workspaceId);
    if (!existing) continue;

    const merged = mergeClientUpdates(
      normalizeClientRecord(existing, workspaceId),
      {
        assignedUserIds: mergeClientAssignedUserIds(existing.assignedUserIds, userIds, mode),
      },
      workspaceId,
    );
    const updated = await updateDoc<Client>(DB_NAMES.clients, clientId, merged);
    if (!updated) continue;
    const normalizedUpdated = normalizeClientRecord(updated, workspaceId);
    updatedClients.push(normalizedUpdated);
    await notifyClientChanged(workspaceId, req.user!, 'client.updated', normalizedUpdated);
  }

  if (updatedClients.length === 0) {
    res.status(404).json({ error: 'No se encontraron contactos validos' });
    return;
  }

  res.json(updatedClients);
});

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const [clients, { activities, events }] = await Promise.all([
    listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
    loadClientAccessContext(workspaceId),
  ]);
  const visible = filterClientsForUser(clients, activities, events, req.user!);
  res.json(visible.map((client) => normalizeClientRecord(client, workspaceId)));
});

router.get('/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), workspaceId);
  if (!client) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }
  const { activities, events } = await loadClientAccessContext(workspaceId);
  if (!canUserAccessClient(client.id, activities, events, req.user!, client)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }
  res.json(normalizeClientRecord(client, req.workspaceId!));
});

router.post('/', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as Omit<Client, 'id' | 'observations' | 'workspaceId'>;
  const groupId = await resolveClientGroupId(workspaceId, body.groupId);
  const client = normalizeClientRecord(
    {
      ...body,
      groupId,
      id: crypto.randomUUID(),
      workspaceId,
      observations: [],
    },
    workspaceId,
  );
  await insertDoc(DB_NAMES.clients, client);
  await notifyClientChanged(workspaceId, req.user!, 'client.created', client);
  res.status(201).json(client);
});

router.put('/:id', workspaceAdminRequired, async (req, res) => {
  const existing = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), req.workspaceId!);
  if (!existing) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

  const merged = mergeClientUpdates(existing, req.body as Partial<Client>, req.workspaceId!);
  if (req.body?.groupId !== undefined) {
    const group = await getClientGroupInWorkspace(req.workspaceId!, String(req.body.groupId));
    if (!group) {
      res.status(400).json({ error: 'Grupo de contactos no válido' });
      return;
    }
    merged.groupId = group.id;
  }
  const updated = await updateDoc<Client>(DB_NAMES.clients, routeParam(req.params.id), merged);
  if (!updated) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }
  const normalizedUpdated = normalizeClientRecord(updated, req.workspaceId!);
  await notifyClientChanged(req.workspaceId!, req.user!, 'client.updated', normalizedUpdated);
  res.json(normalizedUpdated);
});

router.delete('/:id', workspaceAdminRequired, async (req, res) => {
  const existing = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), req.workspaceId!);
  if (!existing) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

  const ok = await deleteDoc(DB_NAMES.clients, routeParam(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }
  res.status(204).send();
});

router.post('/:id/observations', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'La observación no puede estar vacía' });
    return;
  }

  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), workspaceId);
  if (!client) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

  const { activities, events } = await loadClientAccessContext(workspaceId);
  if (!canUserAccessClient(client.id, activities, events, req.user!, client)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const normalized = normalizeClientRecord(client, workspaceId);
  const observation: ClientObservation = {
    id: crypto.randomUUID(),
    text,
    userId: req.user!.id,
    userName: req.user!.name,
    createdAt: new Date().toISOString(),
  };

  const merged = mergeClientUpdates(
    normalized,
    { observations: [...normalized.observations, observation] },
    workspaceId,
  );
  const updated = await updateDoc<Client>(DB_NAMES.clients, routeParam(req.params.id), merged);
  const normalizedUpdated = normalizeClientRecord(updated!, workspaceId);
  await notifyClientObservation(workspaceId, req.user!, normalizedUpdated);

  res.status(201).json(normalizedUpdated);
});

router.delete('/:id/observations', workspaceAdminRequired, async (req, res) => {
  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), req.workspaceId!);
  if (!client) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

  const normalized = normalizeClientRecord(client, req.workspaceId!);
  const merged = mergeClientUpdates(normalized, { observations: [] }, req.workspaceId!);
  const updated = await updateDoc<Client>(DB_NAMES.clients, routeParam(req.params.id), merged);

  res.json(normalizeClientRecord(updated!, req.workspaceId!));
});

router.delete('/:id/observations/:obsId', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, routeParam(req.params.id), workspaceId);
  if (!client) {
    res.status(404).json({ error: 'Contacto no encontrado' });
    return;
  }

  const { activities, events } = await loadClientAccessContext(workspaceId);
  if (!canUserAccessClient(client.id, activities, events, req.user!, client)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const normalized = normalizeClientRecord(client, workspaceId);
  const observation = normalized.observations.find((item) => item.id === req.params.obsId);
  if (!observation) {
    res.status(404).json({ error: 'Observación no encontrada' });
    return;
  }

  if (!canDeleteClientObservation(req.user, observation)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const merged = mergeClientUpdates(
    normalized,
    { observations: normalized.observations.filter((item) => item.id !== req.params.obsId) },
    workspaceId,
  );
  const updated = await updateDoc<Client>(DB_NAMES.clients, routeParam(req.params.id), merged);

  res.json(normalizeClientRecord(updated!, workspaceId!));
});

export default router;
