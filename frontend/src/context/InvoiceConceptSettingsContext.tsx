import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { InvoiceConceptSetting } from '@shared/types';
import { invoiceConceptSettingsService } from '@/api';
import { useWorkspace } from '@/context/useWorkspace';

type InvoiceConceptSettingsContextValue = {
  settings: InvoiceConceptSetting[];
  loading: boolean;
  refresh: () => Promise<void>;
  upsertEmoji: (normalizedKey: string, emoji: string) => Promise<void>;
};

const InvoiceConceptSettingsContext = createContext<InvoiceConceptSettingsContextValue | null>(
  null,
);

export function InvoiceConceptSettingsProvider({ children }: { children: ReactNode }) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const [settings, setSettings] = useState<InvoiceConceptSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setSettings([]);
      return;
    }
    const data = await invoiceConceptSettingsService.getAll();
    setSettings(data);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setSettings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh()
      .catch(() => {
        if (!cancelled) setSettings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh, workspaceId]);

  const upsertEmoji = useCallback(async (normalizedKey: string, emoji: string) => {
    const saved = await invoiceConceptSettingsService.upsert(normalizedKey, emoji);
    setSettings((current) => {
      const index = current.findIndex((item) => item.normalizedKey === saved.normalizedKey);
      if (index === -1) return [...current, saved];
      return current.map((item, itemIndex) => (itemIndex === index ? saved : item));
    });
  }, []);

  const value = useMemo(
    () => ({ settings, loading, refresh, upsertEmoji }),
    [settings, loading, refresh, upsertEmoji],
  );

  return (
    <InvoiceConceptSettingsContext.Provider value={value}>
      {children}
    </InvoiceConceptSettingsContext.Provider>
  );
}

export function useInvoiceConceptSettings(): InvoiceConceptSettingsContextValue {
  const context = useContext(InvoiceConceptSettingsContext);
  if (!context) {
    throw new Error(
      'useInvoiceConceptSettings debe usarse dentro de InvoiceConceptSettingsProvider',
    );
  }
  return context;
}
