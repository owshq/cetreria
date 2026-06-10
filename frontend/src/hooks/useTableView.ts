import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { savedTableViewsService } from '@/api/savedTableViews';
import { tableViewStateService } from '@/api/tableViewState';
import {
  applyViewFilters,
  buildBoardGroups,
  buildViewRows,
  areFilterRulesEqual,
  areViewConfigsEqual,
  buildViewStatePayload,
  canDeleteSavedTableView,
  countActiveFilterRules,
  createEmptyViewState,
  createPreparedDefaultViewConfig,
  loadLegacyViewStateFromStorage,
  loadSavedViews,
  normalizeSavedViewsList,
  parseRemoteViewState,
  applyPinnedColumnLayout,
  pinLockedColumns,
  sanitizeColumnWidths,
  sanitizeFilterRules,
  sanitizeVisibleColumnIds,
  sanitizePinnedColumnIds,
  sortViewItems,
  stripInactiveFilterRules,
  viewDiffersFromDefault,
  type DisplayColumnDef,
  type SavedTableView,
  type TableViewConfig,
  type TableViewRow,
} from '@/lib/viewConfig';
import { authService } from '@/api/auth';
import type { TableViewColumnDef, TableViewGroup } from '@/lib/tableViews';

function prepareViewConfig<T, Ctx>(
  source: TableViewConfig,
  displayColumns: DisplayColumnDef[],
  dataColumns: TableViewColumnDef<T, Ctx>[],
  defaultFilterColumnId: string,
): TableViewConfig {
  return {
    ...source,
    filterRules: sanitizeFilterRules(source.filterRules, dataColumns, defaultFilterColumnId),
    visibleColumnIds: sanitizeVisibleColumnIds(displayColumns, source.visibleColumnIds),
    columnOrder: pinLockedColumns(displayColumns, source.columnOrder, source.pinnedColumnIds),
    columnWidths: sanitizeColumnWidths(displayColumns, source.columnWidths),
    pinnedColumnIds: sanitizePinnedColumnIds(displayColumns, source.pinnedColumnIds),
  };
}

function stripPinnedFromViewConfig(
  config: TableViewConfig,
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  return applyPinnedColumnLayout(config, null, displayColumns);
}

function mergeViewConfigWithPinnedColumn(
  next: TableViewConfig,
  pinnedColumnIds: string[],
  displayColumns: DisplayColumnDef[],
): TableViewConfig {
  return applyPinnedColumnLayout(next, pinnedColumnIds, displayColumns);
}

function buildViewAnchorConfig<T, Ctx>(
  activeSavedViewId: string | null,
  savedViews: SavedTableView[],
  sessionConfig: TableViewConfig,
  displayColumns: DisplayColumnDef[],
  dataColumns: TableViewColumnDef<T, Ctx>[],
  defaultFilterColumnId: string,
  migrateConfig: (config: TableViewConfig) => TableViewConfig,
): TableViewConfig {
  if (activeSavedViewId) {
    const view = savedViews.find((entry) => entry.id === activeSavedViewId);
    if (view) {
      return prepareViewConfig(
        migrateConfig(structuredClone(view.config)),
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      );
    }
  }

  return prepareViewConfig(
    migrateConfig(structuredClone(sessionConfig)),
    displayColumns,
    dataColumns,
    defaultFilterColumnId,
  );
}

export type DeleteViewConfirmState = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export function useTableView<T, Ctx = undefined>(
  pageKey: string,
  displayColumns: DisplayColumnDef[],
  dataColumns: TableViewColumnDef<T, Ctx>[],
  ctx: Ctx,
  defaultFilterColumnId = '',
  migrateConfig: (config: TableViewConfig) => TableViewConfig = (config) => config,
) {
  const emptyViewState = createEmptyViewState(displayColumns);

  const [config, setConfig] = useState<TableViewConfig>(() =>
    prepareViewConfig(
      migrateConfig(emptyViewState.config),
      displayColumns,
      dataColumns,
      defaultFilterColumnId,
    ),
  );
  const [savedViews, setSavedViews] = useState<SavedTableView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | null>(null);
  const [draftConfig, setDraftConfig] = useState<TableViewConfig | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewBaseline, setViewBaseline] = useState<TableViewConfig>(() =>
    prepareViewConfig(
      migrateConfig(emptyViewState.config),
      displayColumns,
      dataColumns,
      defaultFilterColumnId,
    ),
  );
  const [deleteViewConfirm, setDeleteViewConfirm] = useState<DeleteViewConfirmState | null>(null);
  const viewStateHydratedRef = useRef(false);
  const skipNextViewStateSaveRef = useRef(false);

  const queryConfig = useMemo(
    () =>
      prepareViewConfig(
        modalOpen && draftConfig ? draftConfig : config,
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      ),
    [modalOpen, draftConfig, config, displayColumns, dataColumns, defaultFilterColumnId],
  );

  const syncViewsToServer = useCallback(
    async (views: SavedTableView[]) => {
      await savedTableViewsService.saveByPageKey(pageKey, views);
    },
    [pageKey],
  );

  const applyPersistedViewState = useCallback(
    (
      persisted: ReturnType<typeof parseRemoteViewState>,
      views: SavedTableView[],
    ) => {
      const migratedConfig = migrateConfig(persisted.config);
      const prepared = prepareViewConfig(
        migratedConfig,
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      );
      const nextActiveId = persisted.activeSavedViewId;
      const baseline = buildViewAnchorConfig(
        nextActiveId,
        views,
        migratedConfig,
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
        migrateConfig,
      );

      skipNextViewStateSaveRef.current = true;
      setActiveSavedViewId(nextActiveId);
      setConfig(prepared);
      setViewBaseline(baseline);
    },
    [displayColumns, dataColumns, defaultFilterColumnId, migrateConfig],
  );

  useEffect(() => {
    let cancelled = false;
    viewStateHydratedRef.current = false;

    (async () => {
      const localViews = loadSavedViews(pageKey, displayColumns);
      let views = localViews;

      try {
        const { views: raw } = await savedTableViewsService.getByPageKey(pageKey);
        const normalizedRemote = normalizeSavedViewsList(raw, displayColumns);
        if (cancelled) return;

        if (normalizedRemote.length === 0 && localViews.length > 0) {
          views = localViews;
          setSavedViews(localViews);
          try {
            await savedTableViewsService.saveByPageKey(pageKey, localViews);
          } catch {
            // Sin servidor: vistas solo en memoria esta sesión.
          }
        } else {
          views = normalizedRemote;
          setSavedViews(normalizedRemote);
        }
      } catch {
        if (!cancelled) {
          views = localViews;
          setSavedViews(localViews);
        }
      }

      if (cancelled) return;

      try {
        const remote = await tableViewStateService.getByPageKey(pageKey);
        if (cancelled) return;

        if (remote.config) {
          applyPersistedViewState(
            parseRemoteViewState(remote.config, remote.activeSavedViewId, displayColumns),
            views,
          );
          return;
        }

        const legacy = loadLegacyViewStateFromStorage(
          pageKey,
          displayColumns,
          defaultFilterColumnId,
        );
        if (legacy) {
          applyPersistedViewState(legacy, views);
          try {
            await tableViewStateService.saveByPageKey(
              pageKey,
              buildViewStatePayload(legacy.config, legacy.activeSavedViewId),
            );
          } catch {
            // Sin servidor: se mantiene el estado en memoria de esta sesión.
          }
        }
      } catch {
        const legacy = loadLegacyViewStateFromStorage(
          pageKey,
          displayColumns,
          defaultFilterColumnId,
        );
        if (!cancelled && legacy) {
          applyPersistedViewState(legacy, views);
        }
      } finally {
        if (!cancelled) viewStateHydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageKey, displayColumns, defaultFilterColumnId, applyPersistedViewState]);

  useEffect(() => {
    if (!viewStateHydratedRef.current) return;

    if (skipNextViewStateSaveRef.current) {
      skipNextViewStateSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      void tableViewStateService
        .saveByPageKey(pageKey, buildViewStatePayload(config, activeSavedViewId))
        .catch(() => {
          // El estado sigue en memoria; se reintentará en el próximo cambio.
        });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pageKey, config, activeSavedViewId]);

  useEffect(() => {
    if (!viewStateHydratedRef.current) return;
    if (!activeSavedViewId) return;
    if (savedViews.some((view) => view.id === activeSavedViewId)) return;

    setActiveSavedViewId(null);
    setViewBaseline(
      prepareViewConfig(
        structuredClone(config),
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      ),
    );
  }, [activeSavedViewId, savedViews, config, displayColumns, dataColumns, defaultFilterColumnId]);

  const activeFilterCount = useMemo(
    () => countActiveFilterRules(config.filterRules),
    [config.filterRules],
  );

  const hasViewChanges = useMemo(() => {
    const source = modalOpen && draftConfig ? draftConfig : config;
    return !areFilterRulesEqual(
      stripInactiveFilterRules(source.filterRules),
      stripInactiveFilterRules(viewBaseline.filterRules),
    );
  }, [config, viewBaseline, modalOpen, draftConfig]);

  const hasDraftChanges = useMemo(() => {
    if (!modalOpen || !draftConfig) return false;
    return !areViewConfigsEqual(draftConfig, config, displayColumns);
  }, [modalOpen, draftConfig, config, displayColumns]);

  const differsFromDefault = useMemo(() => {
    const source = modalOpen && draftConfig ? draftConfig : config;
    return viewDiffersFromDefault(source, displayColumns);
  }, [config, draftConfig, modalOpen, displayColumns]);

  /** Bolita en el botón de filtros: solo filtros manuales distintos de la vista guardada (o base). */
  const showViewIndicator = hasViewChanges;

  const canRestoreView = useMemo(() => {
    const source = modalOpen && draftConfig ? draftConfig : config;
    return !areViewConfigsEqual(source, viewBaseline, displayColumns);
  }, [config, draftConfig, modalOpen, viewBaseline, displayColumns]);

  const applyView = useCallback(
    (items: T[]) => applyViewFilters(items, queryConfig, dataColumns, ctx),
    [queryConfig, dataColumns, ctx],
  );

  const buildRows = useCallback(
    (items: T[]): TableViewRow<T>[] => buildViewRows(items, queryConfig, dataColumns, ctx),
    [queryConfig, dataColumns, ctx],
  );

  const buildBoard = useCallback(
    (items: T[]): TableViewGroup<T>[] => buildBoardGroups(items, queryConfig, dataColumns, ctx),
    [queryConfig, dataColumns, ctx],
  );

  const sortedItems = useCallback(
    (items: T[]) =>
      sortViewItems(applyViewFilters(items, queryConfig, dataColumns, ctx), queryConfig, dataColumns, ctx),
    [queryConfig, dataColumns, ctx],
  );

  const openModal = useCallback(() => {
    setDraftConfig(structuredClone(config));
    setModalOpen(true);
  }, [config]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setDraftConfig(null);
  }, []);

  const applyDraft = useCallback(() => {
    if (!draftConfig) return;
    const prepared = prepareViewConfig(draftConfig, displayColumns, dataColumns, defaultFilterColumnId);
    const nextConfig = mergeViewConfigWithPinnedColumn(
      {
        ...prepared,
        filterRules: stripInactiveFilterRules(prepared.filterRules),
      },
      config.pinnedColumnIds,
      displayColumns,
    );
    setConfig(nextConfig);
    setModalOpen(false);
    setDraftConfig(null);
  }, [draftConfig, config.pinnedColumnIds, displayColumns, dataColumns, defaultFilterColumnId]);

  const updateDraft = useCallback((next: TableViewConfig) => {
    setDraftConfig(next);
  }, []);

  const resetView = useCallback(() => {
    const defaultConfig = prepareViewConfig(
      createPreparedDefaultViewConfig(displayColumns),
      displayColumns,
      dataColumns,
      defaultFilterColumnId,
    );
    setActiveSavedViewId(null);
    setConfig((current) =>
      mergeViewConfigWithPinnedColumn(defaultConfig, current.pinnedColumnIds, displayColumns),
    );
    setDraftConfig((current) =>
      structuredClone(
        mergeViewConfigWithPinnedColumn(defaultConfig, current?.pinnedColumnIds ?? config.pinnedColumnIds, displayColumns),
      ),
    );
    setViewBaseline(structuredClone(defaultConfig));
  }, [config.pinnedColumnIds, displayColumns, dataColumns, defaultFilterColumnId]);

  const restoreFilters = useCallback(() => {
    const restored = prepareViewConfig(
      structuredClone(viewBaseline),
      displayColumns,
      dataColumns,
      defaultFilterColumnId,
    );
    setConfig((current) =>
      mergeViewConfigWithPinnedColumn(restored, current.pinnedColumnIds, displayColumns),
    );
    setDraftConfig((current) =>
      structuredClone(
        mergeViewConfigWithPinnedColumn(
          restored,
          current?.pinnedColumnIds ?? config.pinnedColumnIds,
          displayColumns,
        ),
      ),
    );
  }, [viewBaseline, config.pinnedColumnIds, displayColumns, dataColumns, defaultFilterColumnId]);

  const saveView = useCallback(
    (name: string, description: string, icon: string, isPrivate = false) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const source = draftConfig ?? config;
      const prepared = prepareViewConfig(source, displayColumns, dataColumns, defaultFilterColumnId);
      const userId = authService.getCurrentUser()?.id;
      const view: SavedTableView = {
        id: crypto.randomUUID(),
        name: trimmed,
        description: description.trim(),
        icon: icon || '🔎',
        config: stripPinnedFromViewConfig(
          {
            ...prepared,
            filterRules: stripInactiveFilterRules(prepared.filterRules),
          },
          displayColumns,
        ),
        createdBy: userId,
        ...(isPrivate && userId ? { isPrivate: true, userId } : null),
      };
      setSavedViews((current) => {
        const next = [...current, view];
        void syncViewsToServer(next).catch(() => {
          alert('No se pudo guardar la vista en el servidor.');
        });
        return next;
      });
      const savedConfig = mergeViewConfigWithPinnedColumn(
        structuredClone(view.config),
        config.pinnedColumnIds,
        displayColumns,
      );
      setActiveSavedViewId(view.id);
      setConfig(savedConfig);
      setViewBaseline(structuredClone(view.config));
      setModalOpen(false);
      setDraftConfig(null);
    },
    [pageKey, draftConfig, config, displayColumns, dataColumns, defaultFilterColumnId, syncViewsToServer],
  );

  const loadView = useCallback(
    (view: SavedTableView) => {
      const loaded = prepareViewConfig(
        migrateConfig(structuredClone(view.config)),
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      );

      if (activeSavedViewId === view.id) {
        const defaultConfig = prepareViewConfig(
          createPreparedDefaultViewConfig(displayColumns),
          displayColumns,
          dataColumns,
          defaultFilterColumnId,
        );
        setActiveSavedViewId(null);
        setConfig((current) =>
          mergeViewConfigWithPinnedColumn(defaultConfig, current.pinnedColumnIds, displayColumns),
        );
        setDraftConfig((current) =>
          modalOpen
            ? structuredClone(
                mergeViewConfigWithPinnedColumn(
                  defaultConfig,
                  current?.pinnedColumnIds ?? config.pinnedColumnIds,
                  displayColumns,
                ),
              )
            : null,
        );
        setViewBaseline(structuredClone(defaultConfig));
        return;
      }

      setActiveSavedViewId(view.id);
      setConfig((current) =>
        mergeViewConfigWithPinnedColumn(loaded, current.pinnedColumnIds, displayColumns),
      );
      setDraftConfig((current) =>
        structuredClone(
          mergeViewConfigWithPinnedColumn(loaded, current?.pinnedColumnIds ?? config.pinnedColumnIds, displayColumns),
        ),
      );
      setViewBaseline(structuredClone(loaded));
    },
    [
      activeSavedViewId,
      modalOpen,
      config.pinnedColumnIds,
      displayColumns,
      dataColumns,
      defaultFilterColumnId,
      migrateConfig,
    ],
  );

  const requestDeleteView = useCallback(
    (viewId: string) => {
      const view = savedViews.find((entry) => entry.id === viewId);
      if (!view) return;
      if (!canDeleteSavedTableView(view, authService.getCurrentUser())) {
        window.alert('No puedes eliminar una vista creada por otro usuario.');
        return;
      }
      setDeleteViewConfirm({ id: viewId, name: view.name, isPrivate: !!view.isPrivate });
    },
    [savedViews],
  );

  const cancelDeleteView = useCallback(() => {
    setDeleteViewConfirm(null);
  }, []);

  const confirmDeleteView = useCallback(() => {
    if (!deleteViewConfirm) return;

    const viewId = deleteViewConfirm.id;
    const removed = savedViews.find((view) => view.id === viewId);
    const isActive = removed != null && removed.id === activeSavedViewId;

    setSavedViews((current) => {
      const next = current.filter((view) => view.id !== viewId);
      void syncViewsToServer(next).catch(() => {
        alert('No se pudo eliminar la vista en el servidor.');
      });
      return next;
    });

    if (isActive) {
      const defaultConfig = prepareViewConfig(
        createPreparedDefaultViewConfig(displayColumns),
        displayColumns,
        dataColumns,
        defaultFilterColumnId,
      );
      setActiveSavedViewId(null);
      setConfig((current) =>
        mergeViewConfigWithPinnedColumn(defaultConfig, current.pinnedColumnIds, displayColumns),
      );
      setDraftConfig((current) =>
        modalOpen
          ? structuredClone(
              mergeViewConfigWithPinnedColumn(
                defaultConfig,
                current?.pinnedColumnIds ?? config.pinnedColumnIds,
                displayColumns,
              ),
            )
          : null,
      );
      setViewBaseline(structuredClone(defaultConfig));
    }

    setDeleteViewConfirm(null);
  }, [
    deleteViewConfirm,
    savedViews,
    config,
    activeSavedViewId,
    displayColumns,
    dataColumns,
    defaultFilterColumnId,
    modalOpen,
    syncViewsToServer,
  ]);

  const updateColumnLayout = useCallback(
    (patch: Pick<TableViewConfig, 'columnOrder' | 'columnWidths' | 'visibleColumnIds' | 'pinnedColumnIds'>) => {
      setConfig((current) => {
        const pinnedColumnIds =
          patch.pinnedColumnIds !== undefined ? patch.pinnedColumnIds : current.pinnedColumnIds;
        return {
          ...current,
          ...patch,
          ...(patch.columnOrder || patch.pinnedColumnIds !== undefined
            ? {
                columnOrder: pinLockedColumns(
                  displayColumns,
                  patch.columnOrder ?? current.columnOrder,
                  pinnedColumnIds,
                ),
              }
            : null),
          ...(patch.pinnedColumnIds !== undefined ? { pinnedColumnIds } : null),
          ...(patch.columnWidths
            ? { columnWidths: sanitizeColumnWidths(displayColumns, patch.columnWidths) }
            : null),
        };
      });
    },
    [displayColumns],
  );

  return {
    config,
    viewConfig: queryConfig,
    setConfig,
    draftConfig,
    modalOpen,
    openModal,
    closeModal,
    applyDraft,
    updateDraft,
    activeFilterCount,
    hasViewChanges,
    hasDraftChanges,
    showViewIndicator,
    canRestoreView,
    differsFromDefault,
    activeSavedViewId,
    savedViews,
    applyView,
    buildRows,
    buildBoard,
    sortedItems,
    resetView,
    restoreFilters,
    saveView,
    loadView,
    requestDeleteView,
    deleteViewConfirm,
    confirmDeleteView,
    cancelDeleteView,
    updateColumnLayout,
  };
};
