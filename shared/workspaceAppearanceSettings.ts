import { isValidUuid } from './ids.js';
import {
  DEFAULT_WORKSPACE_HEADING_FONT_ID,
  DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
  normalizeWorkspaceHeadingFontId,
  normalizeWorkspaceSubtitleFontId,
} from './workspaceTypography.js';

export type LoginBackgroundImageSource = 'external' | 'uploaded';

export type LoginBackgroundImage = {
  id: string;
  source: LoginBackgroundImageSource;
  /** URL externa cuando source === 'external'. */
  externalUrl?: string;
  /** Clave en almacenamiento cuando source === 'uploaded'. */
  storageKey?: string;
  mimeType?: string;
  filename?: string;
  createdAt: string;
};

export type WorkspaceAppearanceSettings = {
  id: string;
  workspaceId: string;
  loginBackgroundImages: LoginBackgroundImage[];
  loginBackgroundIntervalMs: number;
  headingFontId: string;
  subtitleFontId: string;
};

export type PublicLoginBackgroundImage = {
  id: string;
  source: LoginBackgroundImageSource;
  url: string;
  filename?: string;
};

export type PublicLoginAppearance = {
  images: PublicLoginBackgroundImage[];
  intervalMs: number;
  headingFontId: string;
  subtitleFontId: string;
};

const unsplash = (photoId: string) =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1920&q=80`;

export const DEFAULT_LOGIN_BACKGROUND_EXTERNAL_URLS = [
  unsplash('photo-1643810774784-bd6510664eaa'),
  unsplash('photo-1767551510980-e3489d20bdcf'),
  unsplash('photo-1748661382623-1797c447f1eb'),
  unsplash('photo-1712841355673-b593765b7af7'),
  unsplash('photo-1634847553399-722e688f997a'),
  unsplash('photo-1637089860275-536802bb1bbc'),
  unsplash('photo-1644252172153-e916a6cdd781'),
  unsplash('photo-1633001111711-838ae665ca8e'),
  unsplash('photo-1647348488352-7159b5b3dc47'),
  unsplash('photo-1678678502662-fcc4b94985c6'),
] as const;

export const DEFAULT_LOGIN_BACKGROUND_INTERVAL_MS = 4000;
export const MAX_LOGIN_BACKGROUND_IMAGES = 20;
export const MIN_LOGIN_BACKGROUND_INTERVAL_MS = 2000;
export const MAX_LOGIN_BACKGROUND_INTERVAL_MS = 30000;

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function createDefaultLoginBackgroundImages(
  now: () => string = () => new Date().toISOString(),
): LoginBackgroundImage[] {
  return DEFAULT_LOGIN_BACKGROUND_EXTERNAL_URLS.map((externalUrl) => ({
    id: crypto.randomUUID(),
    source: 'external' as const,
    externalUrl,
    createdAt: now(),
  }));
}

export function defaultWorkspaceAppearanceSettings(
  workspaceId: string,
): WorkspaceAppearanceSettings {
  return {
    id: workspaceId,
    workspaceId,
    loginBackgroundImages: createDefaultLoginBackgroundImages(),
    loginBackgroundIntervalMs: DEFAULT_LOGIN_BACKGROUND_INTERVAL_MS,
    headingFontId: DEFAULT_WORKSPACE_HEADING_FONT_ID,
    subtitleFontId: DEFAULT_WORKSPACE_SUBTITLE_FONT_ID,
  };
}

function normalizeLoginBackgroundImage(
  raw: Partial<LoginBackgroundImage> | null | undefined,
): LoginBackgroundImage | null {
  if (!raw || typeof raw.id !== 'string' || !isValidUuid(raw.id)) return null;
  if (raw.source !== 'external' && raw.source !== 'uploaded') return null;

  const createdAt =
    typeof raw.createdAt === 'string' && raw.createdAt.trim()
      ? raw.createdAt
      : new Date().toISOString();

  if (raw.source === 'external') {
    const externalUrl = typeof raw.externalUrl === 'string' ? raw.externalUrl.trim() : '';
    if (!isHttpUrl(externalUrl)) return null;
    return {
      id: raw.id,
      source: 'external',
      externalUrl,
      createdAt,
    };
  }

  const storageKey = typeof raw.storageKey === 'string' ? raw.storageKey.trim() : '';
  const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType.trim() : '';
  if (!storageKey || !mimeType) return null;

  return {
    id: raw.id,
    source: 'uploaded',
    storageKey,
    mimeType,
    filename: typeof raw.filename === 'string' ? raw.filename.trim() : undefined,
    createdAt,
  };
}

export function normalizeWorkspaceAppearanceSettings(
  raw: Partial<WorkspaceAppearanceSettings> | null | undefined,
  workspaceId: string,
): WorkspaceAppearanceSettings {
  const defaults = defaultWorkspaceAppearanceSettings(workspaceId);
  if (!raw) return defaults;

  const images = Array.isArray(raw.loginBackgroundImages)
    ? raw.loginBackgroundImages
        .map((item) => normalizeLoginBackgroundImage(item))
        .filter((item): item is LoginBackgroundImage => item != null)
        .slice(0, MAX_LOGIN_BACKGROUND_IMAGES)
    : defaults.loginBackgroundImages;

  const intervalMs =
    typeof raw.loginBackgroundIntervalMs === 'number' &&
    Number.isFinite(raw.loginBackgroundIntervalMs)
      ? Math.min(
          MAX_LOGIN_BACKGROUND_INTERVAL_MS,
          Math.max(MIN_LOGIN_BACKGROUND_INTERVAL_MS, Math.round(raw.loginBackgroundIntervalMs)),
        )
      : defaults.loginBackgroundIntervalMs;

  return {
    id: raw.id ?? workspaceId,
    workspaceId,
    loginBackgroundImages: images.length > 0 ? images : defaults.loginBackgroundImages,
    loginBackgroundIntervalMs: intervalMs,
    headingFontId: normalizeWorkspaceHeadingFontId(raw.headingFontId),
    subtitleFontId: normalizeWorkspaceSubtitleFontId(raw.subtitleFontId),
  };
}

export function resolveLoginBackgroundImageUrl(
  image: LoginBackgroundImage,
  apiBasePath = '/api',
): string {
  if (image.source === 'external') {
    return image.externalUrl ?? '';
  }
  const base = apiBasePath.replace(/\/$/, '');
  return `${base}/public/login-backgrounds/${image.id}`;
}

export function toPublicLoginAppearance(
  settings: WorkspaceAppearanceSettings,
  apiBasePath = '/api',
): PublicLoginAppearance {
  return {
    intervalMs: settings.loginBackgroundIntervalMs,
    headingFontId: settings.headingFontId,
    subtitleFontId: settings.subtitleFontId,
    images: settings.loginBackgroundImages.map((image) => ({
      id: image.id,
      source: image.source,
      url: resolveLoginBackgroundImageUrl(image, apiBasePath),
      filename: image.filename,
    })),
  };
}

export function isAllowedLoginBackgroundExternalUrl(url: string): boolean {
  return isHttpUrl(url.trim());
}
