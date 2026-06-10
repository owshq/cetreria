import type { PublicLoginAppearance } from '@shared/types';
import {
  DEFAULT_LOGIN_BACKGROUND_EXTERNAL_URLS,
  DEFAULT_LOGIN_BACKGROUND_INTERVAL_MS,
} from '@shared/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const DEFAULT_PUBLIC_LOGIN_APPEARANCE: PublicLoginAppearance = {
  intervalMs: DEFAULT_LOGIN_BACKGROUND_INTERVAL_MS,
  images: DEFAULT_LOGIN_BACKGROUND_EXTERNAL_URLS.map((url, index) => ({
    id: `default-${index}`,
    source: 'external' as const,
    url,
  })),
};

export async function fetchPublicLoginAppearance(): Promise<PublicLoginAppearance> {
  try {
    const response = await fetch(`${API_BASE}/public/login-appearance`);
    if (!response.ok) return DEFAULT_PUBLIC_LOGIN_APPEARANCE;
    const data = (await response.json()) as PublicLoginAppearance;
    if (!Array.isArray(data.images) || data.images.length === 0) {
      return DEFAULT_PUBLIC_LOGIN_APPEARANCE;
    }
    return {
      intervalMs:
        typeof data.intervalMs === 'number' && data.intervalMs > 0
          ? data.intervalMs
          : DEFAULT_LOGIN_BACKGROUND_INTERVAL_MS,
      images: data.images.filter((image) => typeof image.url === 'string' && image.url),
    };
  } catch {
    return DEFAULT_PUBLIC_LOGIN_APPEARANCE;
  }
}
