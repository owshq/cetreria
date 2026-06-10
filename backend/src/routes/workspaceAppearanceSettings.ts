import express, { Router } from 'express';
import type { LoginBackgroundImage, WorkspaceAppearanceSettings } from '@shared/types';
import {
  MAX_LOGIN_BACKGROUND_IMAGES,
  mimeTypeToExtension,
  resolveLoginBackgroundImageUrl,
} from '@shared/types';
import { isAllowedDocumentSourceMimeType } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  findByFieldInWorkspace,
  insertDoc,
  updateDoc,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceAdminRequired, workspaceRequired } from '../middleware/workspace.js';
import {
  buildLoginBackgroundStorageKey,
  downloadLoginBackgroundFile,
  uploadLoginBackgroundFile,
} from '../services/loginBackgroundFiles.js';
import {
  findLoginBackgroundImage,
  getWorkspaceAppearanceSettings,
  removeLoginBackgroundImage,
  saveWorkspaceAppearanceSettings,
  validateExternalLoginBackgroundUrl,
} from '../services/workspaceAppearanceSettings.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

type AppearanceSettingsResponse = WorkspaceAppearanceSettings & {
  loginBackgroundImages: Array<LoginBackgroundImage & { resolvedUrl: string }>;
};

function withResolvedUrls(settings: WorkspaceAppearanceSettings): AppearanceSettingsResponse {
  return {
    ...settings,
    loginBackgroundImages: settings.loginBackgroundImages.map((image) => ({
      ...image,
      resolvedUrl: resolveLoginBackgroundImageUrl(image),
    })),
  };
}

async function getSettingsForWorkspace(
  workspaceId: string,
): Promise<WorkspaceAppearanceSettings | null> {
  const rows = await findByFieldInWorkspace<WorkspaceAppearanceSettings>(
    DB_NAMES.workspaceAppearanceSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  return rows[0] ?? null;
}

async function persistSettings(
  workspaceId: string,
  normalized: WorkspaceAppearanceSettings,
): Promise<WorkspaceAppearanceSettings> {
  const existing = await getSettingsForWorkspace(workspaceId);
  if (existing) {
    const updated = await updateDoc<WorkspaceAppearanceSettings>(
      DB_NAMES.workspaceAppearanceSettings,
      existing.id,
      normalized,
    );
    return updated ?? normalized;
  }
  await insertDoc(DB_NAMES.workspaceAppearanceSettings, normalized);
  return normalized;
}

function readRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

router.get('/', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const settings = await getWorkspaceAppearanceSettings(workspaceId);
  res.json(withResolvedUrls(settings));
});

router.put('/', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const body = req.body as Partial<WorkspaceAppearanceSettings>;
  const normalized = await saveWorkspaceAppearanceSettings(workspaceId, body);
  const saved = await persistSettings(workspaceId, normalized);
  res.json(withResolvedUrls(saved));
});

router.post('/login-backgrounds/external', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  let externalUrl: string;
  try {
    externalUrl = validateExternalLoginBackgroundUrl(url);
  } catch {
    res.status(400).json({ error: 'URL no valida. Usa http o https.' });
    return;
  }

  const current = await getWorkspaceAppearanceSettings(workspaceId);
  if (current.loginBackgroundImages.length >= MAX_LOGIN_BACKGROUND_IMAGES) {
    res.status(400).json({
      error: `Maximo ${MAX_LOGIN_BACKGROUND_IMAGES} imagenes en la galeria.`,
    });
    return;
  }

  const image: LoginBackgroundImage = {
    id: crypto.randomUUID(),
    source: 'external',
    externalUrl,
    createdAt: new Date().toISOString(),
  };

  const normalized = await saveWorkspaceAppearanceSettings(workspaceId, {
    loginBackgroundImages: [...current.loginBackgroundImages, image],
  });
  const saved = await persistSettings(workspaceId, normalized);
  res.status(201).json(withResolvedUrls(saved));
});

router.post(
  '/login-backgrounds/upload',
  workspaceAdminRequired,
  express.raw({
    type: (req) => {
      const contentType = req.headers['content-type'];
      return typeof contentType === 'string' && isAllowedDocumentSourceMimeType(contentType);
    },
    limit: '8mb',
  }),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const contentType = req.headers['content-type'];
    if (typeof contentType !== 'string' || !isAllowedDocumentSourceMimeType(contentType)) {
      res.status(400).json({
        error: 'Formato no valido. Usa JPEG, PNG o WebP.',
      });
      return;
    }

    const fileBytes = req.body;
    if (!Buffer.isBuffer(fileBytes) || fileBytes.length === 0) {
      res.status(400).json({ error: 'El archivo esta vacio.' });
      return;
    }

    const current = await getWorkspaceAppearanceSettings(workspaceId);
    if (current.loginBackgroundImages.length >= MAX_LOGIN_BACKGROUND_IMAGES) {
      res.status(400).json({
        error: `Maximo ${MAX_LOGIN_BACKGROUND_IMAGES} imagenes en la galeria.`,
      });
      return;
    }

    const imageId = crypto.randomUUID();
    const storageKey = buildLoginBackgroundStorageKey(workspaceId, imageId, contentType);
    const rawFilename = req.headers['x-filename'];
    const filename =
      typeof rawFilename === 'string' && rawFilename.trim()
        ? rawFilename.trim().slice(0, 180)
        : `fondo-login.${mimeTypeToExtension(contentType) ?? 'jpg'}`;

    try {
      await uploadLoginBackgroundFile(storageKey, fileBytes, contentType);
    } catch (err) {
      console.error('Error al subir fondo de login', err);
      res.status(500).json({ error: 'No se pudo guardar la imagen.' });
      return;
    }

    const image: LoginBackgroundImage = {
      id: imageId,
      source: 'uploaded',
      storageKey,
      mimeType: contentType.split(';')[0]?.trim().toLowerCase(),
      filename,
      createdAt: new Date().toISOString(),
    };

    const normalized = await saveWorkspaceAppearanceSettings(workspaceId, {
      loginBackgroundImages: [...current.loginBackgroundImages, image],
    });
    const saved = await persistSettings(workspaceId, normalized);
    res.status(201).json(withResolvedUrls(saved));
  },
);

router.delete('/login-backgrounds/:imageId', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  try {
    const normalized = await removeLoginBackgroundImage(
      workspaceId,
      readRouteParam(req.params.imageId),
    );
    const saved = await persistSettings(workspaceId, normalized);
    res.json(withResolvedUrls(saved));
  } catch (err) {
    if (err instanceof Error && err.message === 'LOGIN_BACKGROUND_NOT_FOUND') {
      res.status(404).json({ error: 'Imagen no encontrada.' });
      return;
    }
    console.error('Error al eliminar fondo de login', err);
    res.status(500).json({ error: 'No se pudo eliminar la imagen.' });
  }
});

router.get('/login-backgrounds/:imageId/file', workspaceAdminRequired, async (req, res) => {
  const workspaceId = req.workspaceId!;
  const image = await findLoginBackgroundImage(
    workspaceId,
    readRouteParam(req.params.imageId),
  );
  if (!image) {
    res.status(404).json({ error: 'Imagen no encontrada.' });
    return;
  }

  if (image.source === 'external') {
    res.redirect(image.externalUrl ?? '/');
    return;
  }

  if (!image.storageKey || !image.mimeType) {
    res.status(404).json({ error: 'Archivo no disponible.' });
    return;
  }

  const bytes = await downloadLoginBackgroundFile(image.storageKey);
  if (!bytes) {
    res.status(404).json({ error: 'Archivo no encontrado.' });
    return;
  }

  const ext = mimeTypeToExtension(image.mimeType) ?? 'jpg';
  const filename = image.filename ?? `fondo-login-${image.id}.${ext}`;
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', image.mimeType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  res.send(Buffer.from(bytes));
});

export default router;
