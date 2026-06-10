import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { userInteractionsService } from '@/api/userInteractions';
import {
  buildSecondarySidebarSectionHeightsPayload,
  parseSecondarySidebarSectionHeightsPayload,
  readLegacyStoredSectionHeights,
  readStoredSectionHeights,
  secondarySidebarSectionsInteractionKey,
  sectionIdsFromSpecs,
  writeStoredSectionHeights,
  type SecondarySidebarSectionSpec,
} from '@/lib/secondarySidebarSectionSizes';

export function useSecondarySidebarSectionHeights(
  storageKey: string,
  specs: SecondarySidebarSectionSpec[],
  enabled: boolean,
) {
  const sectionIdsKey = specs.map((spec) => spec.id).join('|');
  const sectionIds = useMemo(() => sectionIdsFromSpecs(specs), [sectionIdsKey]);
  const interactionKey = secondarySidebarSectionsInteractionKey(storageKey);

  const [hydrated, setHydrated] = useState(false);
  const [storageRevision, setStorageRevision] = useState(0);
  const storedHeightsRef = useRef<number[] | null>(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    if (!enabled || specs.length <= 1) {
      storedHeightsRef.current = null;
      setHydrated(true);
      return;
    }

    let cancelled = false;
    setHydrated(false);
    storedHeightsRef.current = null;

    const cachedHeights = readStoredSectionHeights(storageKey, sectionIds);
    if (cachedHeights) {
      storedHeightsRef.current = cachedHeights;
      skipNextPersistRef.current = true;
      setHydrated(true);
      setStorageRevision((revision) => revision + 1);
    }

    void (async () => {
      try {
        const remote = await userInteractionsService.getByKey(interactionKey);
        if (cancelled) return;

        const remoteHeights = parseSecondarySidebarSectionHeightsPayload(
          remote.payload,
          sectionIds,
        );

        if (remoteHeights) {
          storedHeightsRef.current = remoteHeights;
          writeStoredSectionHeights(storageKey, remoteHeights, sectionIds);
        } else if (cachedHeights) {
          const payload = buildSecondarySidebarSectionHeightsPayload(
            cachedHeights,
            sectionIds,
          );
          await userInteractionsService.saveByKey(interactionKey, payload);
        } else {
          const legacyHeights = readLegacyStoredSectionHeights(storageKey);
          const resizableCount = Math.max(0, sectionIds.length - 1);
          if (legacyHeights && legacyHeights.length === resizableCount) {
            storedHeightsRef.current = legacyHeights;
            const payload = buildSecondarySidebarSectionHeightsPayload(
              legacyHeights,
              sectionIds,
            );
            writeStoredSectionHeights(storageKey, legacyHeights, sectionIds);
            await userInteractionsService.saveByKey(interactionKey, payload);
          }
        }
      } catch {
        // Mantener caché local si la API falla.
      } finally {
        if (!cancelled) {
          skipNextPersistRef.current = true;
          setHydrated(true);
          setStorageRevision((revision) => revision + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, interactionKey, sectionIds, sectionIdsKey, storageKey, specs.length]);

  const persistHeights = useCallback(
    (heights: number[]) => {
      if (!enabled || specs.length <= 1) return;

      const payload = buildSecondarySidebarSectionHeightsPayload(heights, sectionIds);
      storedHeightsRef.current = heights;
      writeStoredSectionHeights(storageKey, heights, sectionIds);

      void userInteractionsService.saveByKey(interactionKey, payload).catch(() => {
        // El caché local sigue disponible; se reintentará en el próximo resize.
      });
    },
    [enabled, interactionKey, sectionIds, specs.length, storageKey],
  );

  return {
    hydrated,
    storageRevision,
    storedHeightsRef,
    skipNextPersistRef,
    persistHeights,
  };
};
