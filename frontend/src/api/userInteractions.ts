import { apiFetch } from './client';

export type UserInteractionPayload = {
  payload: unknown;
};

export const userInteractionsService = {
  getByKey: (interactionKey: string): Promise<UserInteractionPayload> =>
    apiFetch(`/user-interactions/${encodeURIComponent(interactionKey)}`),

  saveByKey: (interactionKey: string, payload: unknown): Promise<UserInteractionPayload> =>
    apiFetch(`/user-interactions/${encodeURIComponent(interactionKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ payload }),
    }),
};
