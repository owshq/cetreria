import { APP_EVENTS } from '@/lib/appEvents';
import {
  readWorkspaceScopedStorage,
  removeWorkspaceScopedStorage,
  writeWorkspaceScopedStorage,
} from '@/lib/workspaceStorage';

export const DEFAULT_APP_FAVICON = '/favicon.png';

const FAVICON_STORAGE_PART = 'app_favicon';

export function getAppFaviconUrl(): string {
  return readWorkspaceScopedStorage(FAVICON_STORAGE_PART) ?? DEFAULT_APP_FAVICON;
}

export function hasCustomAppFavicon(): boolean {
  return readWorkspaceScopedStorage(FAVICON_STORAGE_PART) !== null;
}

export function applyAppFavicon(url: string = getAppFaviconUrl()): void {
  document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
    link.setAttribute('href', url);
    if (url.startsWith('data:')) {
      const mime = url.match(/^data:([^;]+)/)?.[1];
      if (mime) {
        link.setAttribute('type', mime);
      }
      return;
    }
    if (url.endsWith('.png')) {
      link.setAttribute('type', 'image/png');
    } else {
      link.removeAttribute('type');
    }
  });
}

export function setAppFavicon(url: string): void {
  writeWorkspaceScopedStorage(url, FAVICON_STORAGE_PART);
  applyAppFavicon(url);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appFaviconUpdated));
}

export function resetAppFavicon(): void {
  removeWorkspaceScopedStorage(FAVICON_STORAGE_PART);
  applyAppFavicon(DEFAULT_APP_FAVICON);
  window.dispatchEvent(new CustomEvent(APP_EVENTS.appFaviconUpdated));
}
