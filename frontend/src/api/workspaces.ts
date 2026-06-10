import type { WorkspaceSummary } from '@shared/types';
import { apiFetch } from './client';

export const workspacesService = {
  getAll: (): Promise<WorkspaceSummary[]> =>
    apiFetch('/workspaces', { signal: AbortSignal.timeout(10_000) }),
};
