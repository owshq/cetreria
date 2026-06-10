import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useCloseAllPopups, usePopupEscape } from '@/context/PopupStackContext';
import {
  Plus,
  X,
  Mail,
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleMinus,
  ExternalLink,
  CheckSquare,
  Square,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { format } from 'date-fns';
import { clientsService, clientGroupsService, authService } from '@/api';
import type { Client, ClientGroup } from '@shared/types';
import { clientCreatedAtToFormValues, customFieldsToEntries, entriesToCustomFields } from '@shared/types';
import { downloadClientsCsv } from '@/lib/clientCsv';
import EmailComposeModal from '@/components/EmailComposeModal';
import { buildClientsEmailDefaults, openClientsBulkEmail } from '@/lib/clientEmail';
import {
  CLIENT_STATUS_DOT,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
} from '@/lib/clientStatus';
import { formatDeleteSavedViewConfirmMessage } from '@/lib/viewConfig';
import ui from '@/styles/shared.module.css';
import ContentLoading from '@/components/ContentLoading';
import EmptyState from '@/components/EmptyState';
import ViewFilterModal from '@/components/ViewFilterModal';
import SavedViewsNav from '@/components/SavedViewsNav';
import BoardView from '@/components/BoardView';
import TableGroupRow from '@/components/TableGroupRow';
import ConfigurableTable from '@/components/ConfigurableTable';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import ClientImportModal from '@/components/ClientImportModal';
import ClientGroupModal from '@/components/ClientGroupModal';
import ClientFormSections, { type ClientFormData } from '@/components/ClientFormSections';
import { SearchField } from '@/components/forms';
import { getContactsSearchPlaceholder } from '@/lib/searchPlaceholder';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import ConfirmDialog from '@/components/ConfirmDialog';
import DeleteClientGroupDialog from '@/components/DeleteClientGroupDialog';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import ClientsGroupNav from '@/components/ClientsGroupNav';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useWorkspace } from '@/context/useWorkspace';
import { useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useTableView } from '@/hooks/useTableView';
import {
  CLIENT_DISPLAY_COLUMNS,
  CLIENTS_VIEW_PAGE_KEY,
  CLIENT_TABLE_VIEW_COLUMNS,
} from '@/lib/clientTableView';
import { matchesTableSearch } from '@/lib/tableViews';
import { renderClientBoardCard, renderClientCell } from '@/lib/clientViewCells';
import { cx } from '@/lib/cx';
import type { TableViewRow } from '@/lib/tableViews';
import tableStyles from '@/components/ConfigurableTable.module.css';
import {
  resolveTableDataCellClassName,
  resolveTableDataCellStyle,
} from '@/lib/tableColumnLayout';
import styles from './Clients.module.css';

function defaultClientForm(groupId = ''): ClientFormData {
  const { createdAt, createdAtPrecision } = clientCreatedAtToFormValues();
  return {
    name: '',
    logoUrl: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    website: '',
    technicalInfo: '',
    status: 'active',
    groupId,
    createdAt,
    createdAtPrecision,
    customFieldEntries: [],
  };
}

function resolveDefaultGroupId(groups: ClientGroup[]): string {
  return groups.find((group) => group.isDefault)?.id ?? groups[0]?.id ?? '';
}

function resolveFormGroupId(groups: ClientGroup[], activeGroupId: string): string {
  const defaultId = resolveDefaultGroupId(groups);
  if (activeGroupId !== 'all') return activeGroupId;
  return defaultId;
}

export default function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const closeAllPopups = useCloseAllPopups();
  const [clients, setClients] = useState<Client[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<'all' | string>('all');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formData, setFormData] = useState(defaultClientForm);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; client: Client } | null>(null);
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number; client: Client } | null>(null);
  const [toolbarOptionsMenu, setToolbarOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<ClientGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [emailComposeClients, setEmailComposeClients] = useState<Client[] | null>(null);
  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav } =
    useSecondaryNavCollapsed('clients');
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [tablePageRef, navMobileHidden] = useHideOnScrollDown(isMobile && !loading);

  const loadGroups = async () => {
    const list = await clientGroupsService.getAll();
    setGroups(list);
    return list;
  };

  const loadClients = async () => {
    const list = await clientsService.getAll();
    setClients(list);
  };

  useEffect(() => {
    if (!currentWorkspace?.id) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      await Promise.allSettled([loadClients()]);
      if (cancelled) return;

      try {
        const list = await clientGroupsService.getAll();
        if (!cancelled) setGroups(list);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentWorkspace?.id]);

  const resetForm = () => {
    setFormData(defaultClientForm(resolveFormGroupId(groups, activeGroupId)));
  };

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setSearchParams({}, { replace: true });
      if (!isAdmin) return;
      resetForm();
      setShowModal(true);
    }
  }, [searchParams, setSearchParams, isAdmin]);

  const groupFilteredClients = useMemo(() => {
    if (activeGroupId === 'all') return clients;
    return clients.filter((client) => client.groupId === activeGroupId);
  }, [clients, activeGroupId]);

  const searchedClients = groupFilteredClients.filter((client) =>
    matchesTableSearch(client, searchTerm, CLIENT_TABLE_VIEW_COLUMNS, undefined),
  );

  const {
    config,
    viewConfig,
    draftConfig,
    modalOpen,
    openModal,
    closeModal: closeViewModal,
    applyDraft,
    updateDraft,
    activeFilterCount,
    hasViewChanges,
    hasDraftChanges,
    showViewIndicator,
    canRestoreView,
    savedViews,
    applyView,
    buildRows,
    buildBoard,
    saveView,
    loadView,
    requestDeleteView,
    deleteViewConfirm,
    confirmDeleteView,
    cancelDeleteView,
    restoreFilters,
    updateColumnLayout,
    activeSavedViewId,
  } = useTableView(
    CLIENTS_VIEW_PAGE_KEY,
    CLIENT_DISPLAY_COLUMNS,
    CLIENT_TABLE_VIEW_COLUMNS,
    undefined,
    'name',
  );

  const showSecondaryNav = !secondaryNavCollapsed && !modalOpen;
  useLayoutSecondarySidebarWidth(!secondaryNavCollapsed || modalOpen);

  const toolbarClientsCount = useMemo(
    () => applyView(groupFilteredClients).length,
    [applyView, groupFilteredClients],
  );

  const searchPlaceholder = useMemo(
    () => getContactsSearchPlaceholder(toolbarClientsCount),
    [toolbarClientsCount],
  );

  const filteredClients = applyView(searchedClients);
  const tableRows = viewConfig.layout === 'table' ? buildRows(searchedClients) : [];
  const boardGroups = viewConfig.layout === 'board' ? buildBoard(searchedClients) : [];
  const boardGroupedByStatus = (viewConfig.boardGroupBy ?? viewConfig.groupBy) === 'status';

  const {
    visibleItems: visibleRows,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList<TableViewRow<Client>>(tableRows, [searchTerm, config]);

  const visibleIds = visibleRows
    .filter((row): row is { kind: 'item'; item: Client } => row.kind === 'item')
    .map((row) => row.item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleSelectVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  };

  const toggleSelectGroup = (ids: string[]) => {
    if (ids.length === 0) return;
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...ids])]);
  };

  const clearSelection = () => setSelectedIds([]);

  const selectedClients = useMemo(
    () => clients.filter((client) => selectedIds.includes(client.id)),
    [clients, selectedIds],
  );

  useEffect(() => {
    const validIds = new Set(clients.map((client) => client.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [clients]);

  const handleBulkView = () => {
    if (selectedClients.length !== 1) return;
    navigate(`/clients/${selectedClients[0].id}`);
  };

  const handleBulkEmail = () => {
    if (selectedClients.length === 0) return;
    setEmailComposeClients(selectedClients);
  };

  const handleClientsEmailSend = (payload: {
    to: string;
    cc: string;
    subject: string;
    body: string;
  }) => {
    if (!emailComposeClients) return;
    if (openClientsBulkEmail(emailComposeClients, payload)) {
      setEmailComposeClients(null);
    }
  };

  const handleBulkDownload = () => {
    if (!isAdmin || selectedClients.length === 0) return;
    const filename = `contactos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadClientsCsv(selectedClients, filename);
  };

  const handleBulkDelete = () => {
    if (!isAdmin || selectedClients.length === 0) return;
    setDeleteConfirm({ ids: selectedClients.map((client) => client.id) });
  };

  const bulkActionCountLabel = `${selectedIds.length} seleccionado${selectedIds.length === 1 ? '' : 's'}`;

  const bulkActionButtons =
    selectedIds.length > 0 ? (
      <div className={styles.bulkActionButtons}>
        {selectedIds.length === 1 && (
          <button
            type="button"
            onClick={handleBulkView}
            className={ui.btnIcon}
            title="Ver detalle"
          >
            <ExternalLink size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={handleBulkEmail}
          className={ui.btnIcon}
          title="Enviar por correo"
          aria-label="Enviar por correo"
        >
          <Mail size={16} />
        </button>
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={handleBulkDownload}
              className={ui.btnIcon}
              title="Descargar"
            >
              <ArrowDownToLine size={16} />
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className={ui.btnIconDanger}
              title="Eliminar"
            >
              <CircleMinus size={16} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={clearSelection}
          className={styles.bulkActionClear}
          title="Quitar selección"
          aria-label="Quitar selección"
        >
          <X size={16} />
        </button>
      </div>
    ) : null;

  const bulkActionToolbar =
    selectedIds.length > 0 ? (
      <div className={styles.bulkActionBar} role="toolbar" aria-label="Acciones masivas">
        <span className={styles.bulkActionCount}>{bulkActionCountLabel}</span>
        {bulkActionButtons}
      </div>
    ) : null;

  const handleDelete = (id: string) => {
    if (!isAdmin) return;
    setDeleteConfirm({ ids: [id] });
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting || !isAdmin) return;
    setDeleting(true);
    try {
      await Promise.all(deleteConfirm.ids.map((id) => clientsService.delete(id)));
      setSelectedIds((current) => current.filter((id) => !deleteConfirm.ids.includes(id)));
      setDeleteConfirm(null);
      await loadClients();
    } catch {
      alert('No se pudieron eliminar los contactos.');
    } finally {
      setDeleting(false);
    }
  };

  const deleteConfirmMessage = useMemo(() => {
    if (!deleteConfirm) return '';
    const count = deleteConfirm.ids.length;
    if (count === 1) {
      const client = clients.find((item) => item.id === deleteConfirm.ids[0]);
      if (client) {
        return `¿Eliminar a ${client.name}? Esta acción no se puede deshacer.`;
      }
      return '¿Eliminar este contacto? Esta acción no se puede deshacer.';
    }
    return `¿Eliminar ${count} contactos? Esta acción no se puede deshacer.`;
  }, [deleteConfirm, clients]);

  const deleteConfirmTitle = deleteConfirm && deleteConfirm.ids.length > 1
    ? 'Eliminar contactos'
    : 'Eliminar contacto';

  const populateFormFromClient = (client: Client) => {
    const { createdAt, createdAtPrecision } = clientCreatedAtToFormValues(client);
    setFormData({
      name: client.name,
      logoUrl: client.logoUrl ?? '',
      email: client.email,
      phone: client.phone,
      address: client.address,
      city: client.city ?? '',
      postalCode: client.postalCode ?? '',
      country: client.country ?? '',
      state: client.state ?? '',
      website: client.website ?? '',
      technicalInfo: client.technicalInfo,
      status: client.status,
      groupId: client.groupId,
      createdAt,
      createdAtPrecision,
      customFieldEntries: customFieldsToEntries(client.customFields),
    });
  };

  const openNewModal = () => {
    if (!isAdmin) return;
    setEditingClient(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    if (!isAdmin) return;
    setEditingClient(client);
    populateFormFromClient(client);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
    resetForm();
  };

  usePopupEscape(showModal && isAdmin, closeModal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const { customFieldEntries, logoUrl, ...clientPayload } = formData;
    const payload = {
      ...clientPayload,
      logoUrl: logoUrl || undefined,
      customFields: entriesToCustomFields(customFieldEntries),
    };

    if (editingClient) {
      await clientsService.update(editingClient.id, payload);
    } else {
      const newClient = await clientsService.create(payload);
      await loadClients();
      closeAllPopups();
      closeModal();
      navigate(`/clients/${newClient.id}`);
      return;
    }

    await loadClients();
    closeAllPopups();
    closeModal();
  };

  const handleStatusChange = async (client: Client, status: Client['status']) => {
    if (!isAdmin || client.status === status) return;
    await clientsService.update(client.id, { status });
    await loadClients();
  };

  const handleDownloadCsv = () => {
    if (!isAdmin || clients.length === 0) return;
    const filename = `contactos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadClientsCsv(filteredClients, filename);
  };

  const handleDownloadGroup = (group: ClientGroup) => {
    if (!isAdmin) return;
    const groupClients = clients.filter((client) => client.groupId === group.id);
    const safeName =
      group.name
        .trim()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase() || 'grupo';
    const filename = `${safeName}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadClientsCsv(groupClients, filename);
  };

  const handleDeleteGroup = (group: ClientGroup) => {
    if (!isAdmin) return;
    setDeleteGroupConfirm(group);
  };

  const executeDeleteGroup = async (contactsAction: 'move_to_all' | 'delete_contacts') => {
    if (!deleteGroupConfirm || deletingGroup || !isAdmin) return;
    setDeletingGroup(true);
    try {
      await clientGroupsService.delete(deleteGroupConfirm.id, contactsAction);
      if (activeGroupId === deleteGroupConfirm.id) {
        setActiveGroupId('all');
      }
      setSelectedIds([]);
      setDeleteGroupConfirm(null);
      await Promise.all([loadGroups(), loadClients()]);
    } catch {
      alert('No se pudo eliminar el grupo.');
    } finally {
      setDeletingGroup(false);
    }
  };

  const deleteGroupContactCount = deleteGroupConfirm
    ? clients.filter((client) => client.groupId === deleteGroupConfirm.id).length
    : 0;

  const handleImportClick = () => {
    if (!isAdmin) return;
    setShowImportModal(true);
  };

  const openToolbarOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isAdmin) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setToolbarOptionsMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const toolbarOptionsItems: ContextMenuItem[] = isAdmin
    ? [
        {
          id: 'import',
          label: 'Importar',
          icon: <ArrowUpFromLine size={16} />,
          onSelect: handleImportClick,
        },
        {
          id: 'download',
          label: 'Descargar',
          icon: <ArrowDownToLine size={16} />,
          disabled: clients.length === 0 || filteredClients.length === 0,
          onSelect: handleDownloadCsv,
        },
      ]
    : [];

  const handleSelectGroup = (groupId: string) => {
    setActiveGroupId(groupId);
    setSelectedIds([]);
  };

  const groupNavProps = {
    groups,
    activeGroupId,
    onSelectGroup: handleSelectGroup,
    isAdmin,
    onCreateGroup: () => setShowGroupModal(true),
    onDownloadGroup: handleDownloadGroup,
    onDeleteGroup: handleDeleteGroup,
    savedViews,
    activeSavedViewId,
    onSelectView: loadView,
  };

  if (loading) {
    return (
      <div className={styles.clientsPage}>
        <SecondarySidebarPortal>
          <aside
            id="clients-secondary-nav"
            className={cx(
              styles.clientsNav,
              secondaryNavCollapsed && styles.clientsNavCollapsed,
            )}
            aria-label="Grupos de contactos"
            aria-hidden={secondaryNavCollapsed ? true : undefined}
            aria-busy
          >
            {!secondaryNavCollapsed && (
              <>
                <div className={styles.clientsNavHeader}>
                  <p className={styles.clientsNavTitle}>Contactos</p>
                  <SecondaryNavToggle
                    expanded
                    onToggle={toggleSecondaryNav}
                    controlsId="clients-secondary-nav"
                    className={styles.clientsNavToggle}
                  />
                </div>
                <ClientsGroupNav
                  {...groupNavProps}
                  loading
                  stacked
                  afterNav={
                    <SavedViewsNav
                      views={savedViews}
                      activeViewId={activeSavedViewId}
                      onSelect={loadView}
                      onDelete={requestDeleteView}
                      stacked
                    />
                  }
                />
              </>
            )}
          </aside>
        </SecondarySidebarPortal>
        <ContentLoading className={styles.clientsContentLoading} />
      </div>
    );
  }

  const defaultGroupId = resolveDefaultGroupId(groups);

  const viewFilterProps = {
    open: modalOpen,
    onOpen: openModal,
    onClose: closeViewModal,
    onApply: applyDraft,
    draftConfig,
    onDraftChange: updateDraft,
    displayColumns: CLIENT_DISPLAY_COLUMNS,
    dataColumns: CLIENT_TABLE_VIEW_COLUMNS,
    savedViews,
    onSaveView: saveView,
    onLoadView: loadView,
    onDeleteView: requestDeleteView,
    onRestoreFilters: restoreFilters,
    activeFilterCount,
    hasViewChanges,
    hasDraftChanges,
    showViewIndicator,
    canRestoreView,
    defaultFilterColumnId: 'name' as const,
    activeSavedViewId,
    panelPlacement: 'secondarySidebar' as const,
  };

  return (
    <div className={styles.clientsPage}>
      <SecondarySidebarPortal>
      <aside
        id="clients-secondary-nav"
        className={cx(
          styles.clientsNav,
          modalOpen && styles.clientsNavFiltersOpen,
          !showSecondaryNav && !modalOpen && styles.clientsNavCollapsed,
        )}
        aria-label={modalOpen ? 'Vistas y filtros' : 'Grupos de contactos'}
        aria-hidden={!showSecondaryNav && !modalOpen ? true : undefined}
      >
        {modalOpen ? (
          <>
            <SavedViewsNav
              views={savedViews}
              activeViewId={activeSavedViewId}
              onSelect={loadView}
              onDelete={requestDeleteView}
              filtersOpen
            />
            <ViewFilterModal {...viewFilterProps} part="panel" />
          </>
        ) : (
          <>
            <div className={styles.clientsNavHeader}>
              <p className={styles.clientsNavTitle}>Contactos</p>
              <SecondaryNavToggle
                expanded
                onToggle={toggleSecondaryNav}
                controlsId="clients-secondary-nav"
                className={styles.clientsNavToggle}
              />
            </div>
            <ClientsGroupNav
              {...groupNavProps}
              stacked
              afterNav={
                <SavedViewsNav
                  views={savedViews}
                  activeViewId={activeSavedViewId}
                  onSelect={loadView}
                  onDelete={requestDeleteView}
                  stacked
                />
              }
            />
          </>
        )}
      </aside>
      </SecondarySidebarPortal>

      <div className={styles.clientsContent}>
      <div ref={tablePageRef} className={ui.tablePage}>
        <div className={styles.clientsToolbarStack}>
        <div className={cx(ui.tableToolbar, styles.clientsTableToolbar)}>
          <div className={ui.filtersRow}>
            {secondaryNavCollapsed && !modalOpen && (
              <SecondaryNavToggle
                expanded={false}
                onToggle={toggleSecondaryNav}
                controlsId="clients-secondary-nav"
                className={styles.secondaryNavExpandBtn}
              />
            )}
            <SearchField
              wrapperClassName={ui.searchWrapper}
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              trailing={
                <>
                  {isMobile && (
                    <ClientsGroupNav
                      {...groupNavProps}
                      compact
                      compactPlacement="toolbar"
                    />
                  )}
                  <ViewFilterModal {...viewFilterProps} part="trigger" embedded />
                </>
              }
            />
            {isAdmin && isMobile && (
              <button
                type="button"
                onClick={openToolbarOptionsMenu}
                className={cx(ui.navMobileOptionsBtn, styles.clientsToolbarOptionsBtn)}
                aria-label="Opciones"
                title="Opciones"
                aria-haspopup="menu"
                aria-expanded={toolbarOptionsMenu !== null}
              >
                <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
              </button>
            )}
            {isAdmin && !isMobile && (
              <div className={cx(ui.toolbarBtnGroup, ui.toolbarEnd)}>
                <button
                  type="button"
                  onClick={openToolbarOptionsMenu}
                  className={ui.toolbarIconBtn}
                  aria-label="Opciones"
                  title="Opciones"
                  aria-haspopup="menu"
                  aria-expanded={toolbarOptionsMenu !== null}
                >
                  <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={openNewModal}
                  className={ui.toolbarBtnPrimary}
                  aria-label="Nuevo contacto"
                  title="Nuevo contacto"
                >
                  <Plus size={16} />
                  Contacto
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {bulkActionToolbar}

        <div className={cx(ui.tableBody, styles.clientsTableBody)}>
          {viewConfig.layout === 'board' ? (
            <>
            <BoardView
              groups={boardGroups}
              getItemKey={(client) => client.id}
              renderCard={(client) =>
                renderClientBoardCard(client, { hideStatus: boardGroupedByStatus })
              }
              onCardClick={(client) => navigate(`/clients/${client.id}`)}
              emptyDescription={
                isAdmin
                  ? 'Añade contactos o ajusta los filtros del tablero.'
                  : 'No hay contactos que coincidan con la vista.'
              }
            />
            </>
          ) : (
            <>
              <div className={styles.clientsTablePanel}>
              <ConfigurableTable
                displayColumns={CLIENT_DISPLAY_COLUMNS}
                config={config}
                onConfigChange={updateColumnLayout}
                headerRenderers={{
                  select: (
                    <div className={tableStyles.selectCellInner}>
                      <div className={tableStyles.selectCheckboxSlot}>
                        <input
                          type="checkbox"
                          className={tableStyles.rowCheckbox}
                          checked={allVisibleSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = someVisibleSelected && !allVisibleSelected;
                          }}
                          onChange={toggleSelectVisible}
                          aria-label="Seleccionar visibles"
                        />
                      </div>
                      <span className={tableStyles.selectActionsSlot} aria-hidden />
                    </div>
                  ),
                }}
              >
                {(visibleColumns) =>
                  tableRows.length > 0 ? (
                    visibleRows.map((row) => {
                      if (row.kind === 'group') {
                        return (
                          <tr key={`group-${row.key}`} className={ui.tableGroupRow}>
                            <TableGroupRow
                              label={row.label}
                              count={row.count}
                              dotColor={row.dotColor}
                              itemIds={row.itemIds}
                              colSpan={visibleColumns.length}
                              selectedIds={selectedIds}
                              onToggleSelect={() => toggleSelectGroup(row.itemIds)}
                            />
                          </tr>
                        );
                      }

                      const client = row.item;
                      const openClientDetail = (
                        event: React.MouseEvent<HTMLTableRowElement> | React.KeyboardEvent<HTMLTableRowElement>,
                      ) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest('a, button, input, label, textarea, select')
                        ) {
                          return;
                        }
                        navigate(`/clients/${client.id}`);
                      };

                      return (
                        <tr
                          key={client.id}
                          className={cx(
                            ui.tableRow,
                            styles.clientRow,
                          )}
                          onClick={openClientDetail}
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openClientDetail(event);
                            }
                          }}
                          title="Ver contacto"
                          aria-selected={selectedIds.includes(client.id)}
                        >
                          {visibleColumns.map((column, columnIndex) => (
                            <td
                              key={column.id}
                              className={resolveTableDataCellClassName(
                                column,
                                columnIndex,
                                visibleColumns,
                                config,
                              )}
                              style={resolveTableDataCellStyle(column, visibleColumns, config)}
                              onClick={
                                column.id === 'select' ||
                                column.id === 'status' ||
                                column.id === 'website'
                                  ? (event) => event.stopPropagation()
                                  : undefined
                              }
                            >
                              {renderClientCell({
                                columnId: column.id,
                                client,
                                selectedIds,
                                isAdmin,
                                toggleSelect,
                                setStatusMenu,
                                setActionMenu,
                                actionMenuClientId: actionMenu?.client.id,
                                statusMenuClientId: statusMenu?.client.id,
                              })}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={visibleColumns.length} className={ui.emptyCell}>
                        <EmptyState
                          emoji="👥"
                          description={
                            isAdmin
                              ? 'Añade un contacto con el botón «Nuevo contacto».'
                              : 'No hay contactos que coincidan con la búsqueda.'
                          }
                          compact
                        />
                      </td>
                    </tr>
                  )
                }
              </ConfigurableTable>
              </div>
              <InfiniteScrollSentinel sentinelRef={sentinelRef} hasMore={hasMore} />
            </>
          )}
        </div>
      </div>

      {isAdmin && (
        <div
          className={cx(
            styles.clientsNavMobile,
            navMobileHidden && styles.clientsNavMobileHidden,
          )}
          role="toolbar"
          aria-label="Acciones de contactos"
        >
          <div className={styles.clientsNavMobileActions}>
            <button
              type="button"
              onClick={openNewModal}
              className={styles.clientsNavMobileFooterPrimary}
              aria-label="Nuevo contacto"
              title="Nuevo contacto"
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Contacto
            </button>
          </div>
        </div>
      )}

      {isAdmin && toolbarOptionsMenu && (
        <ContextMenu
          x={toolbarOptionsMenu.x}
          y={toolbarOptionsMenu.y}
          anchorX="center"
          ariaLabel="Opciones de contactos"
          onClose={() => setToolbarOptionsMenu(null)}
          items={toolbarOptionsItems}
        />
      )}

      {isAdmin && statusMenu && (
        <ContextMenu
          x={statusMenu.x}
          y={statusMenu.y}
          anchorX="center"
          ariaLabel="Cambiar estado del contacto"
          onClose={() => setStatusMenu(null)}
          items={CLIENT_STATUSES.map((status) => ({
            id: status,
            label: CLIENT_STATUS_LABELS[status],
            dotColor: CLIENT_STATUS_DOT[status],
            selected: statusMenu.client.status === status,
            disabled: statusMenu.client.status === status,
            onSelect: () => handleStatusChange(statusMenu.client, status),
          }))}
        />
      )}

      {actionMenu && (
        <ContextMenu
          x={actionMenu.x}
          y={actionMenu.y}
          ariaLabel="Acciones del contacto"
          onClose={() => setActionMenu(null)}
          items={[
            {
              id: 'select',
              label: selectedIds.includes(actionMenu.client.id) ? 'Quitar selección' : 'Seleccionar',
              icon: selectedIds.includes(actionMenu.client.id)
                ? <CheckSquare size={16} />
                : <Square size={16} />,
              onSelect: () => toggleSelect(actionMenu.client.id),
            },
            {
              id: 'view',
              label: 'Ver detalle',
              icon: <ExternalLink size={16} />,
              onSelect: () => navigate(`/clients/${actionMenu.client.id}`),
            },
            ...(isAdmin
              ? [
                  {
                    id: 'edit',
                    label: 'Editar contacto',
                    icon: <Pencil size={16} />,
                    onSelect: () => {
                      openEditModal(actionMenu.client);
                      setActionMenu(null);
                    },
                  },
                  {
                    id: 'download',
                    label: 'Descargar',
                    icon: <ArrowDownToLine size={16} />,
                    onSelect: () => {
                      const filename = `contacto-${actionMenu.client.name}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                      downloadClientsCsv([actionMenu.client], filename);
                    },
                  },
                  {
                    id: 'delete',
                    label: 'Eliminar',
                    icon: <CircleMinus size={16} />,
                    danger: true,
                    onSelect: () => handleDelete(actionMenu.client.id),
                  },
                ]
              : []),
          ]}
        />
      )}

      <ConfirmDialog
        open={deleteViewConfirm !== null}
        title="Eliminar vista"
        message={
          deleteViewConfirm
            ? formatDeleteSavedViewConfirmMessage(
                deleteViewConfirm.name,
                deleteViewConfirm.isPrivate,
              )
            : ''
        }
        onConfirm={confirmDeleteView}
        onCancel={cancelDeleteView}
      />

      <ConfirmDialog
        open={deleteConfirm !== null}
        title={deleteConfirmTitle}
        message={deleteConfirmMessage}
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
      />

      <DeleteClientGroupDialog
        open={deleteGroupConfirm !== null}
        group={deleteGroupConfirm}
        contactCount={deleteGroupContactCount}
        loading={deletingGroup}
        onConfirm={executeDeleteGroup}
        onCancel={() => {
          if (!deletingGroup) setDeleteGroupConfirm(null);
        }}
      />

      <ClientImportModal
        open={showImportModal && isAdmin}
        clients={clients}
        defaultGroupId={defaultGroupId}
        onClose={() => setShowImportModal(false)}
        onImported={loadClients}
      />

      <ClientGroupModal
        open={showGroupModal && isAdmin}
        onClose={() => setShowGroupModal(false)}
        onCreated={async (group) => {
          await loadGroups();
          setActiveGroupId(group.id);
        }}
      />

      {emailComposeClients ? (() => {
        const emailDefaults = buildClientsEmailDefaults(emailComposeClients);
        return (
          <EmailComposeModal
            open
            onClose={() => setEmailComposeClients(null)}
            defaultTo={emailDefaults.to}
            defaultSubject={emailDefaults.subject}
            defaultBody={emailDefaults.body}
            onSend={handleClientsEmailSend}
          />
        );
      })() : null}

      {showModal && isAdmin && (
        <ModalOverlay>
          <div className={cx(ui.modal, ui.modalLg)}>
            <ModalHeader
              title={editingClient ? 'Editar contacto' : 'Nuevo contacto'}
              onClose={closeModal}
            />
            <form onSubmit={handleSubmit} className={ui.modalForm}>
              <div className={ui.modalScroll}>
                <ClientFormSections
                  formData={formData}
                  setFormData={setFormData}
                  groups={groups}
                  idPrefix={editingClient ? 'edit-client' : 'client'}
                />
              </div>
              <ModalFooter>
                <ModalActions>
                  <button type="submit" className={modalBtnPrimary}>
                    {editingClient ? 'Guardar cambios' : 'Crear contacto'}
                  </button>
                  <button type="button" onClick={closeModal} className={modalBtnSecondary}>
                    Cancelar
                  </button>
                </ModalActions>
              </ModalFooter>
            </form>
          </div>
        </ModalOverlay>
      )}
      </div>
    </div>
  );
}
