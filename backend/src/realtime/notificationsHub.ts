import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import type { Notification, NotificationWsMessage } from '@shared/types';
import { config } from '../config.js';
import type { AuthUser } from '../middleware/auth.js';

type Client = {
  ws: WebSocket;
  userId: string;
  workspaceId: string;
};

const clients = new Set<Client>();

function parseConnectionParams(url: string | undefined): {
  token: string | null;
  workspaceId: string | null;
} {
  if (!url) return { token: null, workspaceId: null };
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  return {
    token: params.get('token'),
    workspaceId: params.get('workspaceId'),
  };
}

function sendMessage(ws: WebSocket, message: NotificationWsMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

export function attachNotificationsWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/api/ws/notifications' });

  wss.on('connection', (ws, req) => {
    const { token, workspaceId } = parseConnectionParams(req.url);
    if (!token || !workspaceId) {
      ws.close(4401, 'Autenticación requerida');
      return;
    }

    let userId: string;
    try {
      userId = (jwt.verify(token, config.jwtSecret) as { id: string }).id;
    } catch {
      ws.close(4401, 'Token inválido');
      return;
    }

    const client: Client = { ws, userId, workspaceId };
    clients.add(client);

    ws.on('close', () => {
      clients.delete(client);
    });

    ws.on('error', () => {
      clients.delete(client);
    });
  });
}

export function broadcastNotifications(notifications: Notification[]): void {
  if (notifications.length === 0) return;

  const byRecipient = new Map<string, Notification[]>();
  for (const notification of notifications) {
    const key = `${notification.workspaceId}:${notification.userId}`;
    const list = byRecipient.get(key) ?? [];
    list.push(notification);
    byRecipient.set(key, list);
  }

  for (const client of clients) {
    const key = `${client.workspaceId}:${client.userId}`;
    const items = byRecipient.get(key);
    if (!items?.length) continue;
    sendMessage(client.ws, { type: 'notifications.created', notifications: items });
  }
}
