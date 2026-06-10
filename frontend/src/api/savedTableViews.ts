import { apiFetch } from './client';

export const savedTableViewsService = {
  getByPageKey: (pageKey: string): Promise<{ views: unknown[] }> =>
    apiFetch(`/saved-table-views/${encodeURIComponent(pageKey)}`),

  saveByPageKey: (pageKey: string, views: unknown[]): Promise<void> =>
    apiFetch(`/saved-table-views/${encodeURIComponent(pageKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ views }),
    }),
};
