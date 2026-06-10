import { Router } from 'express';
import type { InvoiceConceptSetting } from '@shared/types';
import {
  getInvoiceConceptLabel,
  normalizeConceptKey,
  normalizeInvoiceConceptDefaultPrice,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  findByFieldInWorkspace,
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

function parseConceptBody(body: {
  label?: string;
  emoji?: string;
  normalizedKey?: string;
  defaultPrice?: unknown;
}): {
  label: string;
  normalizedKey: string;
  emoji: string;
  defaultPrice: number;
} | null {
  const label = (body.label ?? body.normalizedKey ?? '').trim();
  const normalizedKey = normalizeConceptKey(label);
  const emoji = body.emoji?.trim();
  const defaultPrice = normalizeInvoiceConceptDefaultPrice(body.defaultPrice);

  if (!normalizedKey) return null;
  if (!emoji) return null;

  return { label, normalizedKey, emoji, defaultPrice };
}

async function findDuplicateKey(
  workspaceId: string,
  normalizedKey: string,
  excludeId?: string,
): Promise<InvoiceConceptSetting | undefined> {
  const matches = await findByFieldInWorkspace<InvoiceConceptSetting>(
    DB_NAMES.invoiceConceptSettings,
    'normalizedKey',
    normalizedKey,
    workspaceId,
  );
  return matches.find((item) => item.id !== excludeId);
}

router.get('/', async (req, res) => {
  const items = await listAllInWorkspace<InvoiceConceptSetting>(
    DB_NAMES.invoiceConceptSettings,
    req.workspaceId!,
  );
  res.json(
    items.sort((a, b) =>
      getInvoiceConceptLabel(a).localeCompare(getInvoiceConceptLabel(b), 'es'),
    ),
  );
});

router.post('/', workspaceAdminRequired, async (req, res) => {
  const parsed = parseConceptBody(req.body as { label?: string; emoji?: string });
  if (!parsed) {
    res.status(400).json({ error: 'Nombre y emoji son obligatorios' });
    return;
  }

  const duplicate = await findDuplicateKey(req.workspaceId!, parsed.normalizedKey);
  if (duplicate) {
    res.status(409).json({ error: 'Ya existe un concepto con ese nombre' });
    return;
  }

  const setting: InvoiceConceptSetting = {
    id: crypto.randomUUID(),
    workspaceId: req.workspaceId!,
    label: parsed.label,
    normalizedKey: parsed.normalizedKey,
    emoji: parsed.emoji,
    defaultPrice: parsed.defaultPrice,
  };
  await insertDoc(DB_NAMES.invoiceConceptSettings, setting);
  res.status(201).json(setting);
});

router.put('/:id', workspaceAdminRequired, async (req, res) => {
  const id = routeParam(req.params.id);
  const existing = await getByIdInWorkspace<InvoiceConceptSetting>(
    DB_NAMES.invoiceConceptSettings,
    id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Concepto no encontrado' });
    return;
  }

  const body = req.body as { label?: string; emoji?: string; defaultPrice?: unknown };
  const nextLabel = body.label?.trim() || getInvoiceConceptLabel(existing);
  const nextEmoji = body.emoji?.trim() || existing.emoji;
  const normalizedKey = normalizeConceptKey(nextLabel);
  const defaultPrice =
    body.defaultPrice !== undefined
      ? normalizeInvoiceConceptDefaultPrice(body.defaultPrice)
      : normalizeInvoiceConceptDefaultPrice(existing.defaultPrice);

  if (!normalizedKey || !nextEmoji) {
    res.status(400).json({ error: 'Nombre y emoji son obligatorios' });
    return;
  }

  const duplicate = await findDuplicateKey(req.workspaceId!, normalizedKey, id);
  if (duplicate) {
    res.status(409).json({ error: 'Ya existe un concepto con ese nombre' });
    return;
  }

  const updated = await updateDoc<InvoiceConceptSetting>(DB_NAMES.invoiceConceptSettings, id, {
    label: nextLabel,
    normalizedKey,
    emoji: nextEmoji,
    defaultPrice,
  });
  res.json(updated);
});

router.delete('/:id', workspaceAdminRequired, async (req, res) => {
  const existing = await getByIdInWorkspace<InvoiceConceptSetting>(
    DB_NAMES.invoiceConceptSettings,
    routeParam(req.params.id),
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Concepto no encontrado' });
    return;
  }

  const ok = await deleteDoc(DB_NAMES.invoiceConceptSettings, routeParam(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Concepto no encontrado' });
    return;
  }
  res.status(204).send();
});

/** Compatibilidad: asignar emoji por clave normalizada (informes, combobox). */
router.put('/', workspaceAdminRequired, async (req, res) => {
  const body = req.body as { normalizedKey?: string; label?: string; emoji?: string };
  const label = (body.label ?? body.normalizedKey ?? '').trim();
  const normalizedKey = normalizeConceptKey(label);
  const emoji = body.emoji?.trim();

  if (!normalizedKey) {
    res.status(400).json({ error: 'Concepto no válido' });
    return;
  }
  if (!emoji) {
    res.status(400).json({ error: 'El emoji es obligatorio' });
    return;
  }

  const existing = (
    await findByFieldInWorkspace<InvoiceConceptSetting>(
      DB_NAMES.invoiceConceptSettings,
      'normalizedKey',
      normalizedKey,
      req.workspaceId!,
    )
  )[0];

  if (existing) {
    const updated = await updateDoc<InvoiceConceptSetting>(
      DB_NAMES.invoiceConceptSettings,
      existing.id,
      { emoji, label: label || getInvoiceConceptLabel(existing) },
    );
    res.json(updated);
    return;
  }

  const setting: InvoiceConceptSetting = {
    id: crypto.randomUUID(),
    workspaceId: req.workspaceId!,
    label: label || normalizedKey,
    normalizedKey,
    emoji,
  };
  await insertDoc(DB_NAMES.invoiceConceptSettings, setting);
  res.status(201).json(setting);
});

export default router;
