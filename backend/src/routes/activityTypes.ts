import { Router } from 'express';
import type { ActivityType } from '@shared/types';
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

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/', async (req, res) => {
  res.json(await listAllInWorkspace<ActivityType>(DB_NAMES.activityTypes, req.workspaceId!));
});

router.post('/', workspaceAdminRequired, async (req, res) => {
  const body = req.body as Omit<ActivityType, 'id' | 'workspaceId'>;
  if (!body.name?.trim() || !body.icon?.trim() || !body.color?.trim()) {
    res.status(400).json({ error: 'Nombre, icono y color son obligatorios' });
    return;
  }

  const type: ActivityType = {
    id: crypto.randomUUID(),
    workspaceId: req.workspaceId!,
    name: body.name.trim(),
    icon: body.icon.trim(),
    color: body.color.trim(),
    createsDeliveryNote: body.createsDeliveryNote !== false,
  };
  await insertDoc(DB_NAMES.activityTypes, type);
  res.status(201).json(type);
});

router.put('/:id', workspaceAdminRequired, async (req, res) => {
  const existing = await getByIdInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    routeParam(req.params.id),
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Tipo no encontrado' });
    return;
  }

  const body = req.body as Partial<Omit<ActivityType, 'id' | 'workspaceId'>>;
  const updated = await updateDoc<ActivityType>(DB_NAMES.activityTypes, routeParam(req.params.id), {
    name: body.name?.trim() ?? existing.name,
    icon: body.icon?.trim() ?? existing.icon,
    color: body.color?.trim() ?? existing.color,
    createsDeliveryNote:
      body.createsDeliveryNote !== undefined
        ? body.createsDeliveryNote !== false
        : existing.createsDeliveryNote,
  });
  res.json(updated);
});

router.delete('/:id', workspaceAdminRequired, async (req, res) => {
  const existing = await getByIdInWorkspace<ActivityType>(
    DB_NAMES.activityTypes,
    routeParam(req.params.id),
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Tipo no encontrado' });
    return;
  }

  const ok = await deleteDoc(DB_NAMES.activityTypes, routeParam(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Tipo no encontrado' });
    return;
  }
  res.status(204).send();
});

export default router;
