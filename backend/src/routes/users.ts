import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { User, WorkspaceMember } from '@shared/types';
import {
  mapUserRoleToWorkspaceRole,
  normalizeMaxVacationDays,
  normalizeUserRoleLabel,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { deleteDoc, insertDoc, listAll, updateDoc, withDbTransaction } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';
import { notifyTeamMemberAdded } from '../services/notifications.js';
import { addUserToWorkspace, getWorkspaceMemberIds } from '../services/workspaces.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

async function getWorkspaceUsers(workspaceId: string): Promise<Omit<User, 'password'>[]> {
  const memberIds = await getWorkspaceMemberIds(workspaceId);
  const users = await listAll<User>(DB_NAMES.users);
  return users
    .filter((user) => memberIds.includes(user.id))
    .map(({ password: _, ...user }) => user);
}

/** Lista reducida para asignar actividades (miembros del workspace). */
router.get('/assignees', async (req, res) => {
  const users = await getWorkspaceUsers(req.workspaceId!);
  res.json(users.map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl })));
});

router.use(workspaceAdminRequired);

router.get('/', async (req, res) => {
  res.json(await getWorkspaceUsers(req.workspaceId!));
});

router.post('/', async (req, res) => {
  const body = req.body as Omit<User, 'id'>;
  if (!body.name || !body.email || !body.password || !body.role) {
    res.status(400).json({ error: 'Datos incompletos' });
    return;
  }

  const users = await listAll<User>(DB_NAMES.users);
  if (users.some((u) => u.email === body.email)) {
    res.status(409).json({ error: 'Email ya registrado' });
    return;
  }

  const user: User = {
    ...body,
    id: crypto.randomUUID(),
    password: await bcrypt.hash(body.password, 10),
    roleLabel: normalizeUserRoleLabel(body.role, body.roleLabel),
    maxVacationDays: normalizeMaxVacationDays(body.maxVacationDays),
  };
  await insertDoc(DB_NAMES.users, user);
  await addUserToWorkspace(user, req.workspaceId!, mapUserRoleToWorkspaceRole(user.role));
  await notifyTeamMemberAdded(req.workspaceId!, req.user!, { id: user.id, name: user.name });

  const { password: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.put('/:id', async (req, res) => {
  const memberIds = await getWorkspaceMemberIds(req.workspaceId!);
  if (!memberIds.includes(req.params.id)) {
    res.status(404).json({ error: 'Usuario no encontrado en este workspace' });
    return;
  }

  const updates = req.body as Partial<User>;
  const users = await listAll<User>(DB_NAMES.users);
  const existing = users.find((u) => u.id === req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const payload: Partial<User> = { ...updates };
  if (updates.password) {
    payload.password = await bcrypt.hash(updates.password, 10);
  }

  const nextRole = updates.role ?? existing.role;
  if (updates.role !== undefined || updates.roleLabel !== undefined) {
    payload.roleLabel = normalizeUserRoleLabel(nextRole, updates.roleLabel ?? existing.roleLabel);
  }

  if (updates.maxVacationDays !== undefined) {
    payload.maxVacationDays = normalizeMaxVacationDays(updates.maxVacationDays);
  }

  const updated = await updateDoc<User>(DB_NAMES.users, req.params.id, payload);
  if (!updated) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const { password: _, ...safeUser } = updated;
  res.json(safeUser);
});

router.delete('/:id', async (req, res) => {
  const members = await listAll<WorkspaceMember>(DB_NAMES.workspaceMembers);
  const membership = members.find(
    (member) => member.workspaceId === req.workspaceId! && member.userId === req.params.id,
  );
  if (!membership) {
    res.status(404).json({ error: 'Usuario no encontrado en este workspace' });
    return;
  }

  await withDbTransaction(async () => {
    await deleteDoc(DB_NAMES.workspaceMembers, membership.id);

    const remainingMemberships = members.filter(
      (member) => member.userId === req.params.id && member.id !== membership.id,
    );
    if (remainingMemberships.length === 0) {
      await deleteDoc(DB_NAMES.users, req.params.id);
    }
  });

  res.status(204).send();
});

export default router;
