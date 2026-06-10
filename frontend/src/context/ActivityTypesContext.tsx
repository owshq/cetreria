import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ActivityType } from '@shared/types';
import { activityTypesService } from '@/api';
import { useWorkspace } from '@/context/useWorkspace';

type ActivityTypesContextValue = {
  activityTypes: ActivityType[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const ActivityTypesContext = createContext<ActivityTypesContextValue | null>(null);

export function ActivityTypesProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setActivityTypes([]);
      return;
    }
    const data = await activityTypesService.getAll();
    setActivityTypes(data);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setActivityTypes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh()
      .catch(() => {
        if (!cancelled) setActivityTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, workspaceId]);

  const value = useMemo(
    () => ({ activityTypes, loading, refresh }),
    [activityTypes, loading, refresh],
  );

  return (
    <ActivityTypesContext.Provider value={value}>{children}</ActivityTypesContext.Provider>
  );
}

export function useActivityTypes(): ActivityTypesContextValue {
  const context = useContext(ActivityTypesContext);
  if (!context) {
    throw new Error('useActivityTypes debe usarse dentro de ActivityTypesProvider');
  }
  return context;
}
