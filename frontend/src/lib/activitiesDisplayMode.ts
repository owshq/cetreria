import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';

export type ActivitiesDisplayMode = 'calendar' | 'table';

const VIEW_IDS: ActivitiesDisplayMode[] = ['calendar', 'table'];

export function isActivitiesDisplayMode(value: string | null): value is ActivitiesDisplayMode {
  return value != null && VIEW_IDS.includes(value as ActivitiesDisplayMode);
}

export function readStoredActivitiesDisplayMode(): ActivitiesDisplayMode {
  const stored = readWorkspaceScopedStorage(storageKeys.activitiesDisplayMode);
  if (stored === 'shifts') return 'calendar';
  if (stored && isActivitiesDisplayMode(stored)) return stored;

  const legacy = readWorkspaceScopedStorage(storageKeys.scheduleAllDisplayView);
  if (legacy === 'table' || legacy === 'calendar') return legacy;
  if (legacy === 'shifts') return 'calendar';

  return 'calendar';
}

export function writeStoredActivitiesDisplayMode(view: ActivitiesDisplayMode): void {
  writeWorkspaceScopedStorage(view, storageKeys.activitiesDisplayMode);
}

export const ACTIVITIES_DISPLAY_MODE_LABELS: Record<
  ActivitiesDisplayMode,
  { label: string; short: string }
> = {
  calendar: { label: 'Calendario', short: 'Cal.' },
  table: { label: 'Tabla', short: 'Tab.' },
};
