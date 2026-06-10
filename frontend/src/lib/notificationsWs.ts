import { getToken, getWorkspaceId } from '@/api/client';

export function getNotificationsWebSocketUrl(): string | null {
  const token = getToken();
  const workspaceId = getWorkspaceId();
  if (!token || !workspaceId) return null;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({
    token,
    workspaceId,
  });

  return `${protocol}//${window.location.host}/api/ws/notifications?${params.toString()}`;
}
