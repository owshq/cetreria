import { authService } from '@/api';
import { getWorkspaceId } from '@/api/client';
import { legacyStorageKeys, storageKeys } from '@/lib/storageKeys';

function getWorkspaceScope(): string {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) return 'default';

  const workspaces = authService.getWorkspaces();
  const current = workspaces.find((workspace) => workspace.id === workspaceId);
  return current?.slug ?? workspaceId;
}

const legacyScopedPartNames: Record<string, readonly string[]> = {
  [storageKeys.settingsTab]: legacyStorageKeys.settingsTab,
  [storageKeys.dashboardPeriod]: legacyStorageKeys.dashboardPeriod,
  [storageKeys.reportsPeriod]: legacyStorageKeys.reportsPeriod,
  [storageKeys.calendarViewMode]: legacyStorageKeys.calendarViewMode,
  [storageKeys.tableViewsV2]: legacyStorageKeys.tableViewsV2,
  [storageKeys.tableViewsV3]: legacyStorageKeys.tableViewsV3,
};

function partVariants(parts: string[]): string[][] {
  const variants: string[][] = [parts];

  const aliases = legacyScopedPartNames[parts[0]];
  if (aliases) {
    for (const alias of aliases) {
      variants.push([alias, ...parts.slice(1)]);
    }
  }

  return variants;
}

function scopedKeyCandidates(...parts: string[]): string[] {
  const scopes = new Set<string>(['default']);
  scopes.add(getWorkspaceScope());

  const workspaceId = getWorkspaceId();
  if (workspaceId) scopes.add(workspaceId);

  const keys: string[] = [];
  for (const scope of scopes) {
    for (const variant of partVariants(parts)) {
      keys.push(`${scope}:${variant.join(':')}`);
    }
  }

  return keys;
}

/** Prefija claves con el slug del workspace activo (p. ej. `principal:settings_tab`). */
export function workspaceStorageKey(...parts: string[]): string {
  return scopedKeyCandidates(...parts)[0];
}

export function readWorkspaceScopedStorage(...parts: string[]): string | null {
  const candidates = scopedKeyCandidates(...parts);
  const primaryKey = candidates[0];

  try {
    for (const key of candidates) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        if (key !== primaryKey) {
          localStorage.setItem(primaryKey, value);
          localStorage.removeItem(key);
        }
        return value;
      }
    }
  } catch {
    // Ignore quota / private mode errors.
  }

  return null;
}

export function writeWorkspaceScopedStorage(value: string, ...parts: string[]): void {
  try {
    localStorage.setItem(workspaceStorageKey(...parts), value);
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function removeWorkspaceScopedStorage(...parts: string[]): void {
  try {
    localStorage.removeItem(workspaceStorageKey(...parts));
  } catch {
    // Ignore quota / private mode errors.
  }
}
