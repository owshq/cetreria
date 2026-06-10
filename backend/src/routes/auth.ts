import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { User } from '@shared/types';
import { normalizeUserSignatureInput } from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listAll, updateDoc } from '../db/repository.js';
import { authRequired, signToken } from '../middleware/auth.js';
import { getWorkspacesForUser } from '../services/workspaces.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'Email y contraseña requeridos' });
    return;
  }

  const users = await listAll<User>(DB_NAMES.users);
  const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  const { password: _, ...safeUser } = user;
  const token = signToken(safeUser);
  const workspaces = await getWorkspacesForUser(user.id);
  res.json({ user: safeUser, token, workspaces });
});

router.get('/me', authRequired, async (req, res) => {
  const users = await listAll<User>(DB_NAMES.users);
  const user = users.find((u) => u.id === req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

router.put('/me', authRequired, async (req, res) => {
  const body = req.body as {
    name?: string;
    email?: string;
    password?: string;
    currentPassword?: string;
    avatarUrl?: string | null;
    signatureDataUrl?: string | null;
  };

  const users = await listAll<User>(DB_NAMES.users);
  const existing = users.find((u) => u.id === req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const payload: Partial<User> = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      res.status(400).json({ error: 'El nombre es obligatorio' });
      return;
    }
    payload.name = name;
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: 'El email es obligatorio' });
      return;
    }
    if (users.some((u) => u.id !== existing.id && u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'Email ya registrado' });
      return;
    }
    payload.email = email;
  }

  if (body.avatarUrl !== undefined) {
    payload.avatarUrl = body.avatarUrl?.trim() || undefined;
  }

  if (body.signatureDataUrl !== undefined) {
    const normalized = normalizeUserSignatureInput(body.signatureDataUrl);
    if (body.signatureDataUrl !== null && normalized === undefined) {
      res.status(400).json({ error: 'Formato de firma no válido' });
      return;
    }
    payload.signatureDataUrl = normalized ?? undefined;
  }

  if (body.password) {
    if (!body.currentPassword) {
      res.status(400).json({ error: 'La contraseña actual es obligatoria para cambiarla' });
      return;
    }
    if (!(await bcrypt.compare(body.currentPassword, existing.password))) {
      res.status(401).json({ error: 'Contraseña actual incorrecta' });
      return;
    }
    payload.password = await bcrypt.hash(body.password, 10);
  }

  const updated = await updateDoc<User>(DB_NAMES.users, existing.id, payload);
  if (!updated) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }

  const { password: _, ...safeUser } = updated;
  const token = signToken(safeUser);
  res.json({ user: safeUser, token });
});

export default router;
