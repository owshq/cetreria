import type {
  LoginBackgroundImage,
  WorkspaceAppearanceSettings,
} from '@shared/types';
import {
  isAllowedLoginBackgroundExternalUrl,
  normalizeWorkspaceAppearanceSettings,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { findByFieldInWorkspace } from '../db/repository.js';
import { deleteLoginBackgroundFile } from './loginBackgroundFiles.js';

async function getRawSettings(
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

export async function getWorkspaceAppearanceSettings(
  workspaceId: string,
): Promise<WorkspaceAppearanceSettings> {
  const existing = await getRawSettings(workspaceId);
  return normalizeWorkspaceAppearanceSettings(existing, workspaceId);
}

export async function saveWorkspaceAppearanceSettings(
  workspaceId: string,
  body: Partial<WorkspaceAppearanceSettings>,
): Promise<WorkspaceAppearanceSettings> {
  const existing = await getRawSettings(workspaceId);
  const merged = existing ? { ...existing, ...body } : body;
  return normalizeWorkspaceAppearanceSettings(merged, workspaceId);
}

export async function findLoginBackgroundImage(
  workspaceId: string,
  imageId: string,
): Promise<LoginBackgroundImage | null> {
  const settings = await getWorkspaceAppearanceSettings(workspaceId);
  return settings.loginBackgroundImages.find((image) => image.id === imageId) ?? null;
}

export async function removeLoginBackgroundImage(
  workspaceId: string,
  imageId: string,
): Promise<WorkspaceAppearanceSettings> {
  const existing = await getRawSettings(workspaceId);
  const current = normalizeWorkspaceAppearanceSettings(existing, workspaceId);
  const target = current.loginBackgroundImages.find((image) => image.id === imageId);
  if (!target) {
    throw new Error('LOGIN_BACKGROUND_NOT_FOUND');
  }

  if (target.source === 'uploaded' && target.storageKey) {
    await deleteLoginBackgroundFile(target.storageKey);
  }

  const nextImages = current.loginBackgroundImages.filter((image) => image.id !== imageId);
  return saveWorkspaceAppearanceSettings(workspaceId, {
    loginBackgroundImages: nextImages,
  });
}

export function validateExternalLoginBackgroundUrl(url: string): string {
  const trimmed = url.trim();
  if (!isAllowedLoginBackgroundExternalUrl(trimmed)) {
    throw new Error('LOGIN_BACKGROUND_URL_INVALID');
  }
  return trimmed;
}
