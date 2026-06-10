import { Router } from 'express';
import type { WorkspaceScheduleHoliday } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  insertDoc,
  listAllInWorkspace,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

function isAdminUser(req: import('express').Request): boolean {
  return req.user?.role === 'admin';
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

  const all = await listAllInWorkspace<WorkspaceScheduleHoliday>(
    DB_NAMES.workspaceScheduleHolidays,
    workspaceId,
  );
  const holidays = all.filter((entry) => entry.date >= from && entry.date <= to);
  res.json(holidays);
});

router.put('/bulk', async (req, res) => {
  if (!isAdminUser(req)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  const workspaceId = req.workspaceId!;
  const body = req.body as { dates?: Array<{ date?: string; active?: boolean }> };
  if (!Array.isArray(body.dates) || body.dates.length === 0) {
    res.status(400).json({ error: 'dates requerido' });
    return;
  }

  const all = await listAllInWorkspace<WorkspaceScheduleHoliday>(
    DB_NAMES.workspaceScheduleHolidays,
    workspaceId,
  );
  const now = new Date().toISOString();
  const saved: WorkspaceScheduleHoliday[] = [];

  for (const item of body.dates) {
    const date = parseDateParam(item.date);
    if (!date) {
      res.status(400).json({ error: 'Cada entrada requiere date válido (yyyy-MM-dd)' });
      return;
    }

    const existing = all.find((entry) => entry.date === date);
    const active = item.active !== false;

    if (!active) {
      if (existing) {
        await deleteDoc(DB_NAMES.workspaceScheduleHolidays, existing.id);
        const index = all.findIndex((entry) => entry.id === existing.id);
        if (index !== -1) all.splice(index, 1);
      }
      continue;
    }

    if (existing) {
      saved.push(existing);
      continue;
    }

    const created: WorkspaceScheduleHoliday = {
      id: crypto.randomUUID(),
      workspaceId,
      date,
      updatedAt: now,
      updatedBy: req.user!.id,
    };
    await insertDoc(DB_NAMES.workspaceScheduleHolidays, created);
    all.push(created);
    saved.push(created);
  }

  res.json(saved);
});

export default router;
