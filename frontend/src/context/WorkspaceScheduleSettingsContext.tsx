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
  buildShiftEventTimes,
  describeShiftBoundaries,
  type WorkspaceScheduleSettings,
  type WorkspaceScheduleShiftBoundaries,
} from '@shared/types';
import { workspaceScheduleSettingsService } from '@/api/workspaceScheduleSettings';

type WorkspaceScheduleSettingsContextValue = {
  settings: WorkspaceScheduleSettings | null;
  boundaries: WorkspaceScheduleShiftBoundaries;
  shiftEventTimes: ReturnType<typeof buildShiftEventTimes>;
  shiftRangesLabel: ReturnType<typeof describeShiftBoundaries>;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<WorkspaceScheduleSettings>) => Promise<WorkspaceScheduleSettings>;
};

const WorkspaceScheduleSettingsContext =
  createContext<WorkspaceScheduleSettingsContextValue | null>(null);

export function WorkspaceScheduleSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WorkspaceScheduleSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await workspaceScheduleSettingsService.get();
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

  const update = useCallback(async (patch: Partial<WorkspaceScheduleSettings>) => {
    const saved = await workspaceScheduleSettingsService.update(patch);
    setSettings(saved);
    return saved;
  }, []);

  const boundaries = useMemo(
    () => ({
      nightToMorningAt: settings?.nightToMorningAt ?? '06:00',
      morningToAfternoonAt: settings?.morningToAfternoonAt ?? '14:00',
      afternoonToNightAt: settings?.afternoonToNightAt ?? '22:00',
    }),
    [settings],
  );

  const shiftEventTimes = useMemo(() => buildShiftEventTimes(boundaries), [boundaries]);
  const shiftRangesLabel = useMemo(() => describeShiftBoundaries(boundaries), [boundaries]);

  const value = useMemo(
    () => ({
      settings,
      boundaries,
      shiftEventTimes,
      shiftRangesLabel,
      loading,
      refresh,
      update,
    }),
    [settings, boundaries, shiftEventTimes, shiftRangesLabel, loading, refresh, update],
  );

  return (
    <WorkspaceScheduleSettingsContext.Provider value={value}>
      {children}
    </WorkspaceScheduleSettingsContext.Provider>
  );
}

export function useWorkspaceScheduleSettings(): WorkspaceScheduleSettingsContextValue {
  const context = useContext(WorkspaceScheduleSettingsContext);
  if (!context) {
    throw new Error(
      'useWorkspaceScheduleSettings debe usarse dentro de WorkspaceScheduleSettingsProvider',
    );
  }
  return context;
}
