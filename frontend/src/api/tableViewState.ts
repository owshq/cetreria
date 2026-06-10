import { apiFetch } from './client';

export type TableViewStatePayload = {
  config: unknown;
  activeSavedViewId: string | null;
};

export const tableViewStateService = {
  getByPageKey: (pageKey: string): Promise<TableViewStatePayload> =>
    apiFetch(`/table-view-state/${encodeURIComponent(pageKey)}`),

  saveByPageKey: (pageKey: string, payload: TableViewStatePayload): Promise<TableViewStatePayload> =>
    apiFetch(`/table-view-state/${encodeURIComponent(pageKey)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
