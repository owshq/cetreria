import { Router } from 'express';
import { DEFAULT_WORKSPACE_ID } from '@shared/types';
import {
  mimeTypeToExtension,
  toPublicLoginAppearance,
} from '@shared/types';
import {
  findLoginBackgroundImage,
  getWorkspaceAppearanceSettings,
} from '../services/workspaceAppearanceSettings.js';
import { downloadLoginBackgroundFile } from '../services/loginBackgroundFiles.js';

const router = Router();

router.get('/login-appearance', async (_req, res) => {
  const settings = await getWorkspaceAppearanceSettings(DEFAULT_WORKSPACE_ID);
  res.json(toPublicLoginAppearance(settings));
});

function readRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

router.get('/login-backgrounds/:imageId', async (req, res) => {
  const image = await findLoginBackgroundImage(
    DEFAULT_WORKSPACE_ID,
    readRouteParam(req.params.imageId),
  );
  if (!image || image.source !== 'uploaded' || !image.storageKey || !image.mimeType) {
    res.status(404).json({ error: 'Imagen no encontrada.' });
    return;
  }

  const bytes = await downloadLoginBackgroundFile(image.storageKey);
  if (!bytes) {
    res.status(404).json({ error: 'Archivo no encontrado.' });
    return;
  }

  const ext = mimeTypeToExtension(image.mimeType) ?? 'jpg';
  const filename = image.filename ?? `fondo-login-${image.id}.${ext}`;
  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(Buffer.from(bytes));
});

export default router;
