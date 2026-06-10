import type { User, WorkspaceSummary } from '@shared/types';
import { APP_EVENTS } from '@/lib/appEvents';
import {
  readLocalStorageFor,
  removeLocalStorageFor,
  writeLocalStorageFor,
} from '@/lib/storageKeys';
import { invalidateResourceCache } from './resourceCache';
import { apiFetch, getToken, setToken, setWorkspaceId } from './client';

export type ProfileUpdatePayload = {
  name?: string;
  email?: string;
  password?: string;
  currentPassword?: string;
  avatarUrl?: string | null;
  signatureDataUrl?: string | null;
};

function storeWorkspaces(workspaces: WorkspaceSummary[]) {
  const normalized = Array.isArray(workspaces) ? workspaces : [];
  writeLocalStorageFor('workspaces', JSON.stringify(normalized));
  const savedId = readLocalStorageFor('workspace');
  const current =
    normalized.find((workspace) => workspace.id === savedId) ?? normalized[0] ?? null;
  setWorkspaceId(current?.id ?? null);
}

function readStoredWorkspaces(): WorkspaceSummary[] {
  const raw = readLocalStorageFor('workspaces');
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      removeLocalStorageFor('workspaces');
      return [];
    }
    return parsed as WorkspaceSummary[];
  } catch {
    removeLocalStorageFor('workspaces');
    return [];
  }
}

export const authService = {
  async login(email: string, password: string): Promise<Omit<User, 'password'>> {
    const { user, token, workspaces } = await apiFetch<{
      user: Omit<User, 'password'>;
      token: string;
      workspaces: WorkspaceSummary[];
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    invalidateResourceCache();
    setToken(token);
    writeLocalStorageFor('user', JSON.stringify(user));
    storeWorkspaces(workspaces ?? []);
    window.dispatchEvent(new CustomEvent(APP_EVENTS.authSessionChanged));
    return user;
  },

  async updateProfile(updates: ProfileUpdatePayload): Promise<Omit<User, 'password'>> {
    const { user, token } = await apiFetch<{ user: Omit<User, 'password'>; token: string }>(
      '/auth/me',
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      },
    );
    setToken(token);
    writeLocalStorageFor('user', JSON.stringify(user));
    window.dispatchEvent(new CustomEvent(APP_EVENTS.userUpdated, { detail: user }));
    return user;
  },

  logout() {
    invalidateResourceCache();
    setToken(null);
    setWorkspaceId(null);
    removeLocalStorageFor('user');
    removeLocalStorageFor('workspaces');
    window.dispatchEvent(new CustomEvent(APP_EVENTS.authSessionChanged));
  },

  syncSessionUser(user: Omit<User, 'password'>) {
    writeLocalStorageFor('user', JSON.stringify(user));
    window.dispatchEvent(new CustomEvent(APP_EVENTS.userUpdated, { detail: user }));
  },

  async refreshCurrentUser(): Promise<Omit<User, 'password'> | null> {
    if (!this.isAuthenticated()) return null;

    const { user } = await apiFetch<{ user: Omit<User, 'password'> }>('/auth/me');
    this.syncSessionUser(user);
    return user;
  },

  getCurrentUser(): Omit<User, 'password'> | null {
    const userData = readLocalStorageFor('user');
    return userData ? JSON.parse(userData) : null;
  },

  getWorkspaces(): WorkspaceSummary[] {
    return readStoredWorkspaces();
  },

  setWorkspaces(workspaces: WorkspaceSummary[]) {
    storeWorkspaces(workspaces);
  },

  isAuthenticated(): boolean {
    return !!readLocalStorageFor('user') && !!getToken();
  },
};
