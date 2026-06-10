import { readLocalStorageFor } from '@/lib/storageKeys';
import { getWorkspaceId } from './client';

const DEFAULT_TTL_MS = 15_000;

type CacheEntry = { expires: number; data: unknown };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function readCacheUserScope(): string {
  const raw = readLocalStorageFor('user');
  if (!raw) return 'anon';

  try {
    const user = JSON.parse(raw) as { id?: string; role?: string };
    const id = typeof user.id === 'string' && user.id ? user.id : 'unknown';
    const role = typeof user.role === 'string' && user.role ? user.role : 'unknown';
    return `${id}:${role}`;
  } catch {
    return 'invalid';
  }
}

export function resourceCacheKey(path: string): string {
  const workspaceId = getWorkspaceId() ?? '';
  const userScope = readCacheUserScope();
  return `${workspaceId}:${userScope}:${path}`;
}

export function getCachedResource<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    return Promise.resolve(hit.data as T);
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = loader()
    .then((data) => {
      cache.set(key, { expires: Date.now() + ttlMs, data });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function primeResourceCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, { expires: Date.now() + ttlMs, data });
}

export function invalidateDocumentsBootstrapCache(): void {
  invalidateResourceCache(resourceCacheKey('/documents/bootstrap'));
}

export function invalidateResourceCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    inflight.clear();
    return;
  }

  for (const key of [...cache.keys(), ...inflight.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}
