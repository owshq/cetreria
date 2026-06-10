import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { WorkspaceSummary } from '@shared/types';
import { authService, workspacesService } from '@/api';
import { getWorkspaceId, setWorkspaceId } from '@/api/client';
import { APP_EVENTS } from '@/lib/appEvents';

export type WorkspaceContextValue = {
  workspaces: WorkspaceSummary[];
  currentWorkspace: WorkspaceSummary | null;
  setCurrentWorkspace: (workspace: WorkspaceSummary) => void;
  loading: boolean;
  error: string | null;
  refreshWorkspaces: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
}

function resolveCurrentWorkspace(
  workspaces: WorkspaceSummary[],
  savedId: string | null,
): WorkspaceSummary | null {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return null;
  return workspaces.find((workspace) => workspace.id === savedId) ?? workspaces[0] ?? null;
}

function initialWorkspaceState() {
  const workspaces = authService.getWorkspaces();
  const savedId = getWorkspaceId();
  const currentWorkspace = resolveCurrentWorkspace(workspaces, savedId);
  if (currentWorkspace?.id && currentWorkspace.id !== savedId) {
    setWorkspaceId(currentWorkspace.id);
  }
  const needsFetch =
    authService.isAuthenticated() && (!currentWorkspace || workspaces.length === 0);
  return { workspaces, currentWorkspace, needsFetch };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state] = useState(initialWorkspaceState);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>(state.workspaces);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<WorkspaceSummary | null>(
    state.currentWorkspace,
  );
  const [loading, setLoading] = useState(state.needsFetch);
  const [error, setError] = useState<string | null>(null);

  const applyWorkspace = useCallback((workspace: WorkspaceSummary | null) => {
    setCurrentWorkspaceState(workspace);
    setWorkspaceId(workspace?.id ?? null);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    if (!authService.isAuthenticated()) {
      setWorkspaces([]);
      applyWorkspace(null);
      setError(null);
      setLoading(false);
      return;
    }

    const hasCachedWorkspace = !!resolveCurrentWorkspace(
      authService.getWorkspaces(),
      getWorkspaceId(),
    );
    if (!hasCachedWorkspace) {
      setLoading(true);
    }
    setError(null);

    try {
      const next = await workspacesService.getAll();
      const normalized = Array.isArray(next) ? next : [];
      authService.setWorkspaces(normalized);
      setWorkspaces(normalized);
      const resolved = resolveCurrentWorkspace(normalized, getWorkspaceId());
      applyWorkspace(resolved);
      if (!resolved) {
        setError('No tienes acceso a ningún workspace. Vuelve a iniciar sesión.');
      }
    } catch {
      const cached = authService.getWorkspaces();
      setWorkspaces(cached);
      const current = resolveCurrentWorkspace(cached, getWorkspaceId());
      applyWorkspace(current);
      if (!current) {
        setError('No se pudo cargar el workspace. Cierra sesión e inicia de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyWorkspace]);

  const syncWorkspaceFromStorage = useCallback(() => {
    if (!authService.isAuthenticated()) {
      setWorkspaces([]);
      applyWorkspace(null);
      setError(null);
      setLoading(false);
      return;
    }
    const cached = authService.getWorkspaces();
    const resolved = resolveCurrentWorkspace(cached, getWorkspaceId());
    setWorkspaces(cached);
    applyWorkspace(resolved);
  }, [applyWorkspace]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  useEffect(() => {
    const onAuthSessionChanged = () => {
      syncWorkspaceFromStorage();
      void refreshWorkspaces();
    };
    window.addEventListener(APP_EVENTS.authSessionChanged, onAuthSessionChanged);
    return () => {
      window.removeEventListener(APP_EVENTS.authSessionChanged, onAuthSessionChanged);
    };
  }, [refreshWorkspaces, syncWorkspaceFromStorage]);

  const setCurrentWorkspace = useCallback(
    (workspace: WorkspaceSummary) => {
      applyWorkspace(workspace);
      window.location.reload();
    },
    [applyWorkspace],
  );

  const value = useMemo(
    () => ({
      workspaces,
      currentWorkspace,
      setCurrentWorkspace,
      loading,
      error,
      refreshWorkspaces,
    }),
    [workspaces, currentWorkspace, setCurrentWorkspace, loading, error, refreshWorkspaces],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
