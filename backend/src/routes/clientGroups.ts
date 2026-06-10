import { Router } from 'express';
import type { ClientGroup } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { insertDoc, listAllInWorkspace } from '../db/repository.js';
import {
  deleteClientGroupInWorkspace,
  readClientGroupsForWorkspaceFromStore,
} from '../db/clientGroups.js';
import { jsonFileStore } from '../db/jsonFileStore.js';
import { routeParam } from '../utils/routeParam.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', workspaceAdminRequired, async (req, res) => {
  const groups = await readClientGroupsForWorkspaceFromStore(req.workspaceId!, jsonFileStore);
  res.json(groups);
});

router.post('/', workspaceAdminRequired, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'El nombre del grupo es obligatorio' });
    return;
  }

  const existing = await listAllInWorkspace<ClientGroup>(DB_NAMES.clientGroups, req.workspaceId!);
  const duplicate = existing.some(
    (group) => group.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) {
    res.status(409).json({ error: 'Ya existe un grupo con ese nombre' });
    return;
  }

  const group: ClientGroup = {
    id: crypto.randomUUID(),
    workspaceId: req.workspaceId!,
    name,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
  await insertDoc(DB_NAMES.clientGroups, group);
  res.status(201).json(group);
});

router.delete('/:id', workspaceAdminRequired, async (req, res) => {
  const groupId = routeParam(req.params.id);
  const contactsAction =
    req.body?.contactsAction === 'delete_contacts' ? 'delete_contacts' : 'move_to_all';
  const result = await deleteClientGroupInWorkspace(req.workspaceId!, groupId, contactsAction);

  if (result === 'not_found') {
    res.status(404).json({ error: 'Grupo no encontrado' });
    return;
  }

  res.status(204).send();
});

export default router;
