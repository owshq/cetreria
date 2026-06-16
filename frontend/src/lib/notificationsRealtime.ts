/** Intervalo base de polling en produccion (sin WebSocket). */
export const NOTIFICATIONS_POLL_INTERVAL_MS = 45_000;

/** Tope de backoff tras errores de polling. */
export const NOTIFICATIONS_POLL_ERROR_MAX_MS = 300_000;

/** Reintentos WS en dev antes de abandonar. */
export const NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS = 3;

export const NOTIFICATIONS_WS_RECONNECT_DELAY_MS = 3_000;

export type NotificationsRealtimeTransport = 'websocket' | 'polling';

export function resolveNotificationsRealtimeTransport(
  isDev: boolean,
): NotificationsRealtimeTransport {
  return isDev ? 'websocket' : 'polling';
}

export function shouldStopWebSocketReconnect(attempt: number): boolean {
  return attempt >= NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS;
}

export function computePollingDelayMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return NOTIFICATIONS_POLL_INTERVAL_MS;
  const backoff = NOTIFICATIONS_POLL_INTERVAL_MS * 2 ** Math.min(consecutiveErrors, 4);
  return Math.min(backoff, NOTIFICATIONS_POLL_ERROR_MAX_MS);
}

export function shouldStopPollingAfterError(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}
