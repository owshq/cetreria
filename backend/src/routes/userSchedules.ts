import { Router, type Request } from 'express';
import type { UserScheduleEntry } from '@shared/types';
import { isShiftCode, type ShiftCode } from '@shared/types';
import {
  buildEntriesMapForUser,
  getUserMaxVacationDays,
  validateVacationAssignment,
} from '../services/scheduleVacation.js';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  insertDoc,
  listAllInWorkspace,
  updateDoc,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { getWorkspaceMemberIds } from '../services/workspaces.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

function isAdminUser(req: Request): boolean {
  return req.user?.role === 'admin';
}

async function assertWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const memberIds = await getWorkspaceMemberIds(workspaceId);
  return memberIds.includes(userId);
}

function parseDateParam(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) {
    res.status(400).json({ error: 'Parámetros from y to requeridos (yyyy-MM-dd)' });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: 'from no puede ser posterior a to' });
    return;
  }

  const requestedUserId =
    typeof req.query.userId === 'string' && req.query.userId.trim()
      ? req.query.userId.trim()
      : req.user!.id;

  if (!isAdminUser(req) && requestedUserId !== req.user!.id) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  if (!(await assertWorkspaceMember(workspaceId, requestedUserId))) {
    res.status(404).json({ error: 'Usuario no encontrado en este workspace' });
    return;
  }

  const all = await listAllInWorkspace<UserScheduleEntry>(DB_NAMES.userSchedules, workspaceId);
  const entries = all.filter(
    (entry) =>
      entry.userId === requestedUserId && entry.date >= from && entry.date <= to,
  );
  res.json(entries);
});

/** Lista de entradas de varios usuarios (solo admin, para cuadrante). */
router.get('/workspace', async (req, res) => {
  if (!isAdminUser(req)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const workspaceId = req.workspaceId!;
  const from = parseDateParam(req.query.from);
  const to = parseDateParam(req.query.to);
  if (!from || !to) {
    res.status(400).json({ error: 'Parámetros from y to requeridos (yyyy-MM-dd)' });
    return;
  }
  if (from > to) {
    res.status(400).json({ error: 'from no puede ser posterior a to' });
    return;
  }

  const memberIds = new Set(await getWorkspaceMemberIds(workspaceId));
  const all = await listAllInWorkspace<UserScheduleEntry>(DB_NAMES.userSchedules, workspaceId);
  const entries = all.filter(
    (entry) => memberIds.has(entry.userId) && entry.date >= from && entry.date <= to,
  );
  res.json(entries);
});

router.put('/bulk', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as {
    entries?: Array<{ userId?: string; date?: string; shift?: string | null }>;
  };

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    res.status(400).json({ error: 'entries requerido' });
    return;
  }

  const all = await listAllInWorkspace<UserScheduleEntry>(DB_NAMES.userSchedules, workspaceId);
  const saved: UserScheduleEntry[] = [];
  const now = new Date().toISOString();

  for (const item of body.entries) {
    const userId = item.userId?.trim();
    const date = parseDateParam(item.date);
    if (!userId || !date) {
      res.status(400).json({ error: 'Cada entrada requiere userId y date válidos' });
      return;
    }

    if (!isAdminUser(req) && userId !== req.user!.id) {
      res.status(403).json({ error: 'Permiso denegado' });
      return;
    }

    if (!(await assertWorkspaceMember(workspaceId, userId))) {
      res.status(404).json({ error: 'Usuario no encontrado en este workspace' });
      return;
    }

    const existing = all.find(
      (entry) => entry.userId === userId && entry.date === date,
    );

    if (item.shift === null || item.shift === undefined || item.shift === '') {
      if (existing) {
        await deleteDoc(DB_NAMES.userSchedules, existing.id);
        const index = all.findIndex((entry) => entry.id === existing.id);
        if (index !== -1) all.splice(index, 1);
      }
      continue;
    }

    if (!isShiftCode(item.shift)) {
      res.status(400).json({ error: 'Turno no válido' });
      return;
    }

    const shift: ShiftCode = item.shift;

    const maxVacationDays = await getUserMaxVacationDays(userId);
    if (shift === 'V' && maxVacationDays <= 0) {
      res.status(400).json({ error: 'Este usuario no tiene días de vacaciones asignados' });
      return;
    }

    const entriesByDate = buildEntriesMapForUser(all, userId);
    const vacationError = validateVacationAssignment(
      entriesByDate,
      userId,
      date,
      shift,
      maxVacationDays,
    );
    if (vacationError) {
      res.status(400).json({ error: vacationError });
      return;
    }

    if (existing) {
      const updated = await updateDoc<UserScheduleEntry>(DB_NAMES.userSchedules, existing.id, {
        shift,
        updatedAt: now,
        updatedBy: req.user!.id,
      });
      if (updated) {
        Object.assign(existing, updated);
        saved.push(updated);
      }
      continue;
    }

    const created: UserScheduleEntry = {
      id: crypto.randomUUID(),
      workspaceId,
      userId,
      date,
      shift,
      updatedAt: now,
      updatedBy: req.user!.id,
    };
    await insertDoc(DB_NAMES.userSchedules, created);
    all.push(created);
    saved.push(created);
  }

  res.json(saved);
});

export default router;
