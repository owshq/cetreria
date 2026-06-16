import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS,
  computePollingDelayMs,
  resolveNotificationsRealtimeTransport,
  shouldStopPollingAfterError,
  shouldStopWebSocketReconnect,
} from './notificationsRealtime.js';

describe('notificationsRealtime transport policy', () => {
  it('usa websocket solo en dev', () => {
    assert.equal(resolveNotificationsRealtimeTransport(true), 'websocket');
    assert.equal(resolveNotificationsRealtimeTransport(false), 'polling');
  });

  it('detiene reconexion WS tras el maximo de intentos', () => {
    assert.equal(shouldStopWebSocketReconnect(0), false);
    assert.equal(
      shouldStopWebSocketReconnect(NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS - 1),
      false,
    );
    assert.equal(
      shouldStopWebSocketReconnect(NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS),
      true,
    );
    assert.equal(shouldStopWebSocketReconnect(99), true);
  });

  it('no reintenta polling tras 401/403/404', () => {
    assert.equal(shouldStopPollingAfterError(401), true);
    assert.equal(shouldStopPollingAfterError(403), true);
    assert.equal(shouldStopPollingAfterError(404), true);
    assert.equal(shouldStopPollingAfterError(500), false);
    assert.equal(shouldStopPollingAfterError(0), false);
  });

  it('aplica backoff acotado en errores de polling', () => {
    assert.equal(computePollingDelayMs(0), 45_000);
    assert.equal(computePollingDelayMs(1), 90_000);
    assert.equal(computePollingDelayMs(4), 300_000);
    assert.equal(computePollingDelayMs(10), 300_000);
  });
});

describe('notificationsRealtime retry budget (sin loop infinito)', () => {
  it('WS: reconexiones acotadas a max intentos', () => {
    let attempts = 0;
    while (!shouldStopWebSocketReconnect(attempts)) {
      attempts += 1;
    }
    assert.equal(attempts, NOTIFICATIONS_WS_MAX_RECONNECT_ATTEMPTS);
  });

  it('polling: errores 401 detienen el ciclo', () => {
    const statuses = [500, 503, 401];
    let stopped = false;
    let consecutiveErrors = 0;

    for (const status of statuses) {
      if (shouldStopPollingAfterError(status)) {
        stopped = true;
        break;
      }
      consecutiveErrors += 1;
    }

    assert.equal(stopped, true);
    assert.equal(consecutiveErrors, 2);
  });
});
