import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_WORKSPACE_FEATURE_FLAGS,
  type WorkspaceFeatureSettings,
} from '@shared/types';
import { workspaceFeatureSettingsService } from '@/api/workspaceFeatureSettings';

type WorkspaceFeatureSettingsContextValue = {
  settings: WorkspaceFeatureSettings | null;
  workerSignaturesEnabled: boolean;
  shiftSchedulingEnabled: boolean;
  activityWorkReportsEnabled: boolean;
  invoiceConceptFreeCreationEnabled: boolean;
  verifactuEnabled: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<WorkspaceFeatureSettings>) => Promise<WorkspaceFeatureSettings>;
};

const WorkspaceFeatureSettingsContext =
  createContext<WorkspaceFeatureSettingsContextValue | null>(null);

export function WorkspaceFeatureSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceFeatureSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await workspaceFeatureSettingsService.get();
    setSettings(data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch(() => {
        if (!cancelled) setSettings(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const update = useCallback(async (patch: Partial<WorkspaceFeatureSettings>) => {
    const saved = await workspaceFeatureSettingsService.update(patch);
    setSettings(saved);
    return saved;
  }, []);

  const workerSignaturesEnabled =
    settings?.workerSignaturesEnabled ?? DEFAULT_WORKSPACE_FEATURE_FLAGS.workerSignaturesEnabled;
  const shiftSchedulingEnabled =
    settings?.shiftSchedulingEnabled ?? DEFAULT_WORKSPACE_FEATURE_FLAGS.shiftSchedulingEnabled;
  const activityWorkReportsEnabled =
    settings?.activityWorkReportsEnabled ??
    DEFAULT_WORKSPACE_FEATURE_FLAGS.activityWorkReportsEnabled;
  const invoiceConceptFreeCreationEnabled =
    settings?.invoiceConceptFreeCreationEnabled ??
    DEFAULT_WORKSPACE_FEATURE_FLAGS.invoiceConceptFreeCreationEnabled;
  const verifactuEnabled =
    settings?.verifactuEnabled ?? DEFAULT_WORKSPACE_FEATURE_FLAGS.verifactuEnabled;

  const value = useMemo(
    () => ({
      settings,
      workerSignaturesEnabled,
      shiftSchedulingEnabled,
      activityWorkReportsEnabled,
      invoiceConceptFreeCreationEnabled,
      verifactuEnabled,
      loading,
      refresh,
      update,
    }),
    [
      settings,
      workerSignaturesEnabled,
      shiftSchedulingEnabled,
      activityWorkReportsEnabled,
      invoiceConceptFreeCreationEnabled,
      verifactuEnabled,
      loading,
      refresh,
      update,
    ],
  );

  return (
    <WorkspaceFeatureSettingsContext.Provider value={value}>
      {children}
    </WorkspaceFeatureSettingsContext.Provider>
  );
}

export function useWorkspaceFeatureSettings(): WorkspaceFeatureSettingsContextValue {
  const context = useContext(WorkspaceFeatureSettingsContext);
  if (!context) {
    throw new Error(
      'useWorkspaceFeatureSettings debe usarse dentro de WorkspaceFeatureSettingsProvider',
    );
  }
  return context;
}
