import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleMinus, Lock } from 'lucide-react';
import { authService } from '@/api';
import { ViewFilterIcon } from '@/components/icons/ViewFilterIcon';
import { usePopupEscape } from '@/context/PopupStackContext';
import EmojiPicker from '@/components/EmojiPicker';
import { Input } from '@/components/forms';
import LinearFilterRows from '@/components/LinearFilterRows';
import SelectMenu from '@/components/SelectMenu';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { DEFAULT_VIEW_EMOJI } from '@/lib/emojiCategories';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ui from '@/styles/shared.module.css';
import { DATE_GROUP_GRANULARITY_OPTIONS } from '@/lib/dateGroupGranularity';
import {
  describeLinearFilters,
  getBoardableColumns,
  getSortableColumns,
  sanitizeFilterRules,
  sanitizeVisibleColumnIds,
  canDeleteSavedTableView,
  type DisplayColumnDef,
  type SavedTableView,
  type TableViewConfig,
} from '@/lib/viewConfig';
import type { TableViewColumnDef } from '@/lib/tableViews';
import styles from './ViewFilterModal.module.css';

type ViewFilterMenuProps<T, Ctx = undefined> = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onApply: () => void;
  draftConfig: TableViewConfig | null;
  onDraftChange: (config: TableViewConfig) => void;
  displayColumns: DisplayColumnDef[];
  dataColumns: TableViewColumnDef<T, Ctx>[];
  savedViews: SavedTableView[];
  onSaveView: (name: string, description: string, icon: string, isPrivate: boolean) => void;
  onLoadView: (view: SavedTableView) => void;
  onDeleteView: (viewId: string) => void;
  onRestoreFilters: () => void;
  activeFilterCount: number;
  hasViewChanges: boolean;
  hasDraftChanges: boolean;
  showViewIndicator: boolean;
  canRestoreView: boolean;
  defaultFilterColumnId: string;
  activeSavedViewId?: string | null;
  embedded?: boolean;
  part?: 'full' | 'trigger' | 'panel';
  panelPlacement?: 'portal' | 'secondarySidebar';
};

export default function ViewFilterMenu<T, Ctx = undefined>({
  open,
  onOpen,
  onClose,
  onApply,
  draftConfig,
  onDraftChange,
  displayColumns,
  dataColumns,
  savedViews,
  onSaveView,
  onLoadView,
  onDeleteView,
  onRestoreFilters,
  activeFilterCount,
  hasViewChanges,
  hasDraftChanges,
  showViewIndicator,
  canRestoreView,
  defaultFilterColumnId,
  activeSavedViewId = null,
  embedded = false,
  part = 'full',
  panelPlacement = 'portal',
}: ViewFilterMenuProps<T, Ctx>) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const currentUser = authService.getCurrentUser();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [viewIcon, setViewIcon] = useState(DEFAULT_VIEW_EMOJI);
  const [viewPrivate, setViewPrivate] = useState(true);

  const config = draftConfig;
  const groupableColumns = dataColumns.filter((column) => column.groupable);
  const boardableColumns = getBoardableColumns(dataColumns);
  const sortableColumns = getSortableColumns(dataColumns);
  const activeGroupColumnId =
    config?.layout === 'board'
      ? config.boardGroupBy ?? boardableColumns[0]?.id ?? null
      : config?.groupBy ?? null;
  const activeGroupColumn = activeGroupColumnId
    ? dataColumns.find((column) => column.id === activeGroupColumnId)
    : undefined;
  const showDateGroupGranularity = activeGroupColumn?.valueType === 'date';
  const toggleableDisplayColumns = displayColumns.filter((column) => !column.locked);

  usePopupEscape(open, onClose);

  useEffect(() => {
    if (!open) {
      setSaveFormOpen(false);
      setViewName('');
      setViewIcon(DEFAULT_VIEW_EMOJI);
      setViewPrivate(true);
    }
  }, [open]);

  const patchConfig = (patch: Partial<TableViewConfig>) => {
    if (!config) return;
    onDraftChange({ ...config, ...patch });
  };

  const toggleVisibleColumn = (columnId: string) => {
    if (!config) return;
    const visible = config.visibleColumnIds.includes(columnId)
      ? config.visibleColumnIds.filter((id) => id !== columnId)
      : [...config.visibleColumnIds, columnId];
    patchConfig({ visibleColumnIds: visible });
  };

  const showAllColumns = () => {
    if (!config) return;
    patchConfig({
      visibleColumnIds: sanitizeVisibleColumnIds(
        displayColumns,
        toggleableDisplayColumns.map((column) => column.id),
      ),
    });
  };

  const visibleToggleableCount = toggleableDisplayColumns.filter((column) =>
    config?.visibleColumnIds.includes(column.id),
  ).length;

  const setLayout = (layout: TableViewConfig['layout']) => {
    if (!config) return;
    const boardGroupBy =
      layout === 'board'
        ? config.boardGroupBy ?? boardableColumns[0]?.id ?? config.groupBy
        : config.boardGroupBy;
    patchConfig({ layout, boardGroupBy });
  };

  const handleToggle = () => {
    if (open) onClose();
    else onOpen();
  };

  const handleApply = () => {
    onApply();
    onClose();
  };

  const handleSave = () => {
    if (!config || !viewName.trim()) return;
    onSaveView(
      viewName.trim(),
      describeLinearFilters(config.filterRules, dataColumns),
      viewIcon,
      viewPrivate,
    );
    setSaveFormOpen(false);
    setViewName('');
    onClose();
  };

  const handleSaveClick = () => {
    if (!saveFormOpen) {
      setSaveFormOpen(true);
      return;
    }
    handleSave();
  };

  const useInlineSecondarySidebar = panelPlacement === 'secondarySidebar' && !isMobile;
  const useExpandedFooterActions = useInlineSecondarySidebar || isMobile;
  const showApplySaveActions = hasDraftChanges || saveFormOpen;
  const footerActionBtnClass = useExpandedFooterActions ? styles.footerActionBtn : undefined;

  const panelBody =
    open && config ? (
      <>
        {(panelPlacement !== 'secondarySidebar' || isMobile) && (
          <ModalHeader
            title="Vistas y filtros"
            onClose={onClose}
            closeLabel="Cerrar vistas y filtros"
            className={styles.panelHeader}
          />
        )}
        <div
          className={cx(
            styles.body,
            panelPlacement === 'secondarySidebar' && styles.bodySecondarySidebar,
          )}
          {...scrollRegionProps}
        >
          {savedViews.length > 0 && (panelPlacement !== 'secondarySidebar' || isMobile) && (
            <section>
              <div className={styles.sectionLabel}>Vistas</div>
              <div className={styles.savedRow}>
                {savedViews.map((view) => {
                  const isActive = activeSavedViewId === view.id;
                  return (
                  <div key={view.id} className={styles.savedChipWrap}>
                    <button
                      type="button"
                      className={cx(styles.savedChip, isActive && styles.savedChipActive)}
                      onClick={() => onLoadView(view)}
                      aria-pressed={isActive}
                    >
                      <span
                        className={cx(
                          styles.savedChipCheck,
                          isActive && styles.savedChipCheckActive,
                        )}
                        aria-hidden
                      >
                        {isActive && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className={styles.savedChipLabel}>
                        {view.icon} {view.name}
                      </span>
                      {view.isPrivate && (
                        <Lock
                          size={10}
                          strokeWidth={2}
                          className={styles.savedChipLock}
                          aria-label="Vista privada"
                        />
                      )}
                    </button>
                    {canDeleteSavedTableView(view, currentUser) ? (
                    <button
                      type="button"
                      className={ui.btnIcon}
                      aria-label={`Eliminar ${view.name}`}
                      onClick={() => onDeleteView(view.id)}
                    >
                      <CircleMinus size={14} />
                    </button>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <div className={styles.sectionLabel}>Mostrar</div>
            <div className={styles.layoutSegment} role="group" aria-label="Tipo de vista">
              <button
                type="button"
                className={cx(styles.layoutOption, config.layout === 'table' && styles.layoutOptionActive)}
                onClick={() => setLayout('table')}
              >
                Tabla
              </button>
              <button
                type="button"
                className={cx(styles.layoutOption, config.layout === 'board' && styles.layoutOptionActive)}
                onClick={() => setLayout('board')}
                disabled={boardableColumns.length === 0}
              >
                Tablero
              </button>
            </div>
          </section>

          <section className={styles.dualRow}>
            <div>
              <div className={styles.fieldLabel}>
                {config.layout === 'board' ? 'Columnas del tablero' : 'Agrupar por'}
              </div>
              <SelectMenu
                value={
                  config.layout === 'board'
                    ? config.boardGroupBy ?? boardableColumns[0]?.id ?? 'none'
                    : config.groupBy ?? 'none'
                }
                onChange={(value) => {
                  if (config.layout === 'board') {
                    patchConfig({ boardGroupBy: value === 'none' ? null : value });
                  } else {
                    patchConfig({ groupBy: value === 'none' ? null : value });
                  }
                }}
                options={[
                  { value: 'none', label: 'Sin agrupar', emoji: '📋' },
                  ...(config.layout === 'board' ? boardableColumns : groupableColumns).map((column) => ({
                    value: column.id,
                    label: column.label,
                    emoji: column.emoji,
                  })),
                ]}
                ariaLabel="Agrupar por"
                className={styles.select}
              />
              {showDateGroupGranularity && (
                <>
                  <div className={styles.fieldLabel}>Periodo</div>
                  <SelectMenu
                    value={config.dateGroupGranularity}
                    onChange={(value) =>
                      patchConfig({
                        dateGroupGranularity: value as TableViewConfig['dateGroupGranularity'],
                      })
                    }
                    options={DATE_GROUP_GRANULARITY_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                      emoji: option.emoji,
                    }))}
                    ariaLabel="Agrupar fechas por periodo"
                    className={styles.select}
                  />
                </>
              )}
            </div>
            <div>
              <div className={styles.fieldLabel}>Ordenar por</div>
              <SelectMenu
                value={config.sortBy ?? 'none'}
                onChange={(value) =>
                  patchConfig({
                    sortBy: value === 'none' ? null : value,
                  })
                }
                options={[
                  { value: 'none', label: 'Sin ordenar', emoji: '↕️' },
                  ...sortableColumns.map((column) => ({
                    value: column.id,
                    label: column.label,
                    emoji: column.emoji,
                  })),
                ]}
                ariaLabel="Ordenar por"
                className={styles.select}
              />
              {config.sortBy && (
                <div className={styles.sortDirectionWrap}>
                  <SelectMenu
                    value={config.sortDirection}
                    onChange={(value) =>
                      patchConfig({ sortDirection: value as TableViewConfig['sortDirection'] })
                    }
                    options={[
                      { value: 'asc', label: 'Ascendente' },
                      { value: 'desc', label: 'Descendente' },
                    ]}
                    ariaLabel="Dirección de orden"
                    className={styles.select}
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <div className={styles.sectionLabel}>Filtrar por</div>
            <LinearFilterRows
              stacked={panelPlacement === 'secondarySidebar'}
              columns={dataColumns}
              defaultColumnId={defaultFilterColumnId}
              rules={config.filterRules}
              onChange={(filterRules) =>
                patchConfig({
                  filterRules: sanitizeFilterRules(
                    filterRules,
                    dataColumns,
                    defaultFilterColumnId,
                  ),
                })
              }
            />
          </section>

          <section>
            <div className={styles.variableHeader}>
              <div className={styles.variableHeaderMain}>
                <div className={styles.sectionLabel}>Variables visibles</div>
                <span className={styles.variableCount}>
                  {visibleToggleableCount}/{toggleableDisplayColumns.length}
                </span>
              </div>
              <div className={styles.variableActions}>
                <button
                  type="button"
                  className={styles.variableActionBtn}
                  onClick={showAllColumns}
                  disabled={visibleToggleableCount === toggleableDisplayColumns.length}
                >
                  Todas
                </button>
              </div>
            </div>
            <div className={styles.variableList}>
              {toggleableDisplayColumns.map((column) => {
                const active = config.visibleColumnIds.includes(column.id);
                return (
                  <button
                    key={column.id}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    aria-label={`${column.label}${active ? ', visible' : ', oculta'}`}
                    className={cx(styles.variableItem, active && styles.variableItemActive)}
                    onClick={() => toggleVisibleColumn(column.id)}
                  >
                    <span className={styles.variableItemEmoji} aria-hidden>
                      {column.emoji ?? '▢'}
                    </span>
                    <span className={styles.variableItemLabel}>{column.label}</span>
                    <span
                      className={cx(styles.variableCheck, active && styles.variableCheckActive)}
                      aria-hidden
                    >
                      {active && <Check size={12} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {saveFormOpen && (
          <div className={styles.saveForm}>
            <div className={styles.sectionLabel}>Icono y nombre de la vista</div>
            <div className={styles.iconNameRow}>
              <EmojiPicker
                value={viewIcon}
                onChange={setViewIcon}
                ariaLabel="Icono de la vista"
                placement="top"
              />
              <Input
                type="text"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                className={styles.textInput}
                placeholder="Nombre de la vista"
                autoFocus
              />
            </div>
          </div>
        )}

        <div className={styles.panelBottomOptions}>
          <label className={styles.headerEmojiToggle}>
            <input
              type="checkbox"
              checked={config.showHeaderEmojis}
              onChange={(event) => patchConfig({ showHeaderEmojis: event.target.checked })}
            />
            <span>Emojis en columnas</span>
          </label>
          {saveFormOpen && (
            <>
              <label className={styles.privateToggle}>
                <input
                  type="checkbox"
                  checked={viewPrivate}
                  onChange={(event) => setViewPrivate(event.target.checked)}
                />
                <Lock size={12} strokeWidth={2} aria-hidden />
                <span>Vista privada</span>
              </label>
              {viewPrivate && (
                <p className={styles.privateHint}>
                  Solo tú podrás ver esta vista en el espacio de trabajo.
                </p>
              )}
            </>
          )}
        </div>

        <ModalFooter className={styles.footer}>
          {canRestoreView && (
            <button
              type="button"
              className={cx(styles.restoreFiltersBtn, footerActionBtnClass)}
              onClick={onRestoreFilters}
            >
              Restaurar vista
            </button>
          )}
          <ModalActions
            className={cx(useExpandedFooterActions && styles.footerActionsExpanded)}
          >
            {showApplySaveActions && !saveFormOpen && (
              <button
                type="button"
                className={cx(modalBtnPrimary, footerActionBtnClass)}
                onClick={handleApply}
              >
                Aplicar
              </button>
            )}
            {showApplySaveActions && (
              <button
                type="button"
                className={cx(
                  saveFormOpen ? modalBtnPrimary : modalBtnSecondary,
                  footerActionBtnClass,
                )}
                onClick={handleSaveClick}
                disabled={saveFormOpen && !viewName.trim()}
              >
                Guardar
              </button>
            )}
            <button
              type="button"
              className={cx(modalBtnSecondary, footerActionBtnClass)}
              onClick={onClose}
            >
              Cancelar
            </button>
          </ModalActions>
        </ModalFooter>
      </>
    ) : null;

  const trigger = (
    <div className={cx(styles.root, embedded && styles.rootEmbedded)} ref={rootRef}>
      <div className={cx(styles.triggerRow, embedded && styles.triggerRowEmbedded)}>
        <button
          type="button"
          className={cx(
            embedded ? styles.triggerEmbedded : styles.trigger,
            embedded && showViewIndicator && styles.triggerEmbeddedWithIndicator,
            open && (embedded ? styles.triggerEmbeddedOpen : styles.triggerOpen),
          )}
          onClick={handleToggle}
          aria-label={
            showViewIndicator
              ? 'Vistas y filtros (cambios sin guardar)'
              : 'Vistas y filtros'
          }
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <ViewFilterIcon className={styles.triggerIcon} />
          {activeFilterCount > 0 && (
            <span className={ui.toolbarFilterCount}>{activeFilterCount}</span>
          )}
          {showViewIndicator && activeFilterCount === 0 && (
            <span className={cx(styles.changeDot, embedded && styles.changeDotEmbedded)} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );

  const panel =
    open && config ? (
      <aside
        ref={panelRef}
        className={cx(
          styles.panel,
          useInlineSecondarySidebar
            ? styles.panelSecondarySidebar
            : isMobile
              ? styles.panelMobile
              : styles.panelSidebar,
        )}
        role="dialog"
        data-popup-layer=""
        aria-label="Vistas y filtros"
      >
        {panelBody}
      </aside>
    ) : null;

  const portaledPanel =
    typeof document !== 'undefined' && panel
      ? createPortal(
          <>
            <button
              type="button"
              className={cx(styles.backdrop, isMobile && styles.backdropMobile)}
              onClick={onClose}
              aria-label="Cerrar vistas y filtros"
            />
            {panel}
          </>,
          document.body,
        )
      : null;

  if (part === 'trigger') {
    return trigger;
  }

  if (part === 'panel') {
    if (!panel) return null;
    return useInlineSecondarySidebar ? panel : portaledPanel;
  }

  return (
    <>
      {trigger}
      {useInlineSecondarySidebar ? panel : portaledPanel}
    </>
  );
}
