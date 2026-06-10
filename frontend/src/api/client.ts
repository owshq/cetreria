import {
  readLocalStorageFor,
  removeLocalStorageFor,
  writeLocalStorageFor,
} from '@/lib/storageKeys';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Por encima de ~16 KB en Authorization el servidor responde HTTP 431. */
const MAX_STORED_TOKEN_LENGTH = 12_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function getToken(): string | null {
  const token = readLocalStorageFor('token');
  if (!token) return null;
  if (token.length > MAX_STORED_TOKEN_LENGTH) {
    removeLocalStorageFor('token');
    return null;
  }
  return token;
}

export function setToken(token: string | null) {
  if (token) {
    if (token.length > MAX_STORED_TOKEN_LENGTH) {
      console.warn(
        'Token JWT demasiado grande para enviarlo al servidor; no se guardará. Vuelve a iniciar sesión.',
      );
      removeLocalStorageFor('token');
      return;
    }
    writeLocalStorageFor('token', token);
  } else {
    removeLocalStorageFor('token');
  }
}

export function getWorkspaceId(): string | null {
  return readLocalStorageFor('workspace');
}

export function setWorkspaceId(workspaceId: string | null) {
  if (workspaceId) writeLocalStorageFor('workspace', workspaceId);
  else removeLocalStorageFor('workspace');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const workspaceId = getWorkspaceId();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (workspaceId && !path.startsWith('/auth/login') && !path.startsWith('/workspaces')) {
    headers.set('X-Workspace-Id', workspaceId);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Comprueba que el backend esté en marcha.',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status === 431
        ? 'El token de sesión ocupa demasiado espacio en la petición (suele ser un JWT antiguo con firma o avatar). Cierra sesión y vuelve a entrar.'
        : response.status === 502 || response.status === 503
          ? 'El servidor no está disponible. Comprueba que el backend esté en marcha.'
          : 'Error de API';
    throw new ApiError(data.error ?? fallback, response.status);
  }

  return data as T;
}

export async function apiFetchBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const token = getToken();
  const workspaceId = getWorkspaceId();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (workspaceId) headers.set('X-Workspace-Id', workspaceId);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Comprueba que el backend esté en marcha.',
      0,
    );
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const fallback =
      response.status === 431
        ? 'El token de sesión ocupa demasiado espacio en la petición (suele ser un JWT antiguo con firma o avatar). Cierra sesión y vuelve a entrar.'
        : 'Error de API';
    throw new ApiError(data.error ?? fallback, response.status);
  }

  return response.blob();
}
