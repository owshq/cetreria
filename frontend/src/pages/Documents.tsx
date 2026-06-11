import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Plus,
  CircleMinus,
  Pencil,
  Mail,
  Copy,
  X,
  CheckSquare,
  Square,
  MoreVertical,
  ArrowDownToLine,
  FileCode,
  CalendarPlus,
  ExternalLink,
} from 'lucide-react';
import { documentsService, authService, workspaceBillingSettingsService, documentTypeGroupsService } from '@/api';
import type { Activity, Client, Document, DocumentTypeGroup, WorkspaceBillingSettings } from '@shared/types';
import {
  DOCUMENT_TYPE_LABELS,
  isFinancialDocumentType,
  DEFAULT_DOCUMENT_TYPE_GROUP_SHORT_LABELS,
  canCreateDocumentTypeGroup,
  getCreatableDocumentTypeGroupTypes,
} from '@shared/types';
import { ApiError } from '@/api/client';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import {
  getDocumentActivityLinkError,
  logDocumentActivityLinkBlock,
} from '@/lib/documentActivityLink';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { SearchField } from '@/components/forms';
import { getDocumentsSearchPlaceholder } from '@/lib/searchPlaceholder';
import { formatDeleteSavedViewConfirmMessage } from '@/lib/viewConfig';
import ui from '@/styles/shared.module.css';
import ContentLoading from '@/components/ContentLoading';
import EmptyState from '@/components/EmptyState';
import {
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
} from '@/lib/documentStatus';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import ViewFilterModal from '@/components/ViewFilterModal';
import SavedViewsNav from '@/components/SavedViewsNav';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import SecondarySidebarSectionHeader from '@/components/SecondarySidebarSectionHeader';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import SecondarySidebarResizableSections from '@/components/SecondarySidebarResizableSections';
import BoardView from '@/components/BoardView';
import TableGroupRow from '@/components/TableGroupRow';
import ConfigurableTable from '@/components/ConfigurableTable';
import InfiniteScrollSentinel from '@/components/InfiniteScrollSentinel';
import ActivityFormModal from '@/components/ActivityFormModal';
import DocumentFormModal from '@/components/DocumentFormModal';
import ConfirmDialog from '@/components/ConfirmDialog';
import { INFINITE_SCROLL_BATCH_SIZE, useInfiniteScrollList } from '@/hooks/useInfiniteScrollList';
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown';
import { useTableView } from '@/hooks/useTableView';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  buildDocumentTableViewColumns,
  DOCUMENT_DISPLAY_COLUMNS,
  DOCUMENTS_VIEW_PAGE_KEY,
  filterVerifactuDocumentDisplayColumns,
  filterVerifactuTableViewColumns,
} from '@/lib/documentTableView';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { matchesTableSearch } from '@/lib/tableViews';
import { renderDocumentBoardCard, renderDocumentCell } from '@/lib/documentViewCells';
import type { TableViewRow } from '@/lib/tableViews';
import { downloadDocumentPdf, downloadDocumentPdfLocally } from '@/lib/documentPdf';
import { downloadDocumentXml, downloadDocumentXmlLocally } from '@/lib/documentXml';
import { downloadDocumentsCsv } from '@/lib/documentCsv';
import { navigationStateForReturn } from '@/lib/navigation';
import EmailComposeModal from '@/components/EmailComposeModal';
import { buildDocumentEmailDefaults, buildDocumentEmailAttachmentPreview, emailDocumentPdf } from '@/lib/documentEmail';
import { useActivityModal } from '@/context/ActivityModalContext';
import tableStyles from '@/components/ConfigurableTable.module.css';
import {
  resolveTableDataCellClassName,
  resolveTableDataCellStyle,
} from '@/lib/tableColumnLayout';
import DocumentsTypeNav, { type DocumentTabId } from '@/components/DocumentsTypeNav';
import DocumentsClientNav from '@/components/DocumentsClientNav';
import DeleteDocumentTypeGroupDialog from '@/components/DeleteDocumentTypeGroupDialog';
import DocumentTypeGroupModal from '@/components/DocumentTypeGroupModal';
import styles from './Documents.module.css';

type DocumentTab = DocumentTabId;

export default function Documents() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { onActivitySaved } = useActivityModal();
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const { activityTypes } = useActivityTypes();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentTypeGroups, setDocumentTypeGroups] = useState<DocumentTypeGroup[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [billingSettings, setBillingSettings] = useState<WorkspaceBillingSettings | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Document | null>(null);
  const [documentFormActivityId, setDocumentFormActivityId] = useState('');
  const [activityModalContext, setActivityModalContext] = useState<{
    clientId: string;
    date: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DocumentTab>('all');
  const [activeClientIds, setActiveClientIds] = useState<string[]>([]);
  const [clientFilterSearch, setClientFilterSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number; doc: Document } | null>(null);
  const [actionMenu, setActionMenu] = useState<{ x: number; y: number; doc: Document } | null>(null);
  const [activityLinkMenu, setActivityLinkMenu] = useState<{ x: number; y: number; doc: Document } | null>(null);
  const [activityLinkDoc, setActivityLinkDoc] = useState<Document | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<DocumentTypeGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DocumentTypeGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toolbarOptionsMenu, setToolbarOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [emailCompose, setEmailCompose] = useState<{ doc: Document; client: Client } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const { collapsed: secondaryNavCollapsed, toggle: toggleSecondaryNav } =
    useSecondaryNavCollapsed('documents');
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [tablePageRef, navMobileHidden] = useHideOnScrollDown(isMobile && !loading);
  const tableBodyRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    const [{ documents: docs, clients: clientList, documentTypeGroups: groups, activities: activityList }, company] =
      await Promise.all([
        documentsService.getBootstrap(),
        workspaceBillingSettingsService.get().catch(() => null),
      ]);
    setDocuments(docs);
    setClients(clientList);
    setDocumentTypeGroups(groups);
    setActivities(activityList);
    setBillingSettings(company);
  }, []);

  const closeDocumentModal = () => {
    setShowModal(false);
    setEditingDoc(null);
    setDuplicateFrom(null);
    setDocumentFormActivityId('');
  };

  const openNewDocument = () => {
    setEditingDoc(null);
    setDuplicateFrom(null);
    setDocumentFormActivityId('');
    setShowModal(true);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadData();
      } catch (error) {
        console.error('Error al cargar documentos:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  useEffect(() => onActivitySaved(loadData), [onActivitySaved, loadData]);

  useEffect(() => {
    if (activeTab === 'all') return;
    const hasTab = documentTypeGroups.some((group) => group.id === activeTab);
    if (!hasTab) {
      setActiveTab('all');
      setSelectedIds([]);
    }
  }, [activeTab, documentTypeGroups]);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setSearchParams({}, { replace: true });
      openNewDocument();
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const openDocumentId = (location.state as { openDocumentId?: string } | null)?.openDocumentId;
    if (!openDocumentId || loading) return;

    const doc = documents.find((item) => item.id === openDocumentId);
    if (doc) {
      setEditingDoc(doc);
      setDuplicateFrom(null);
      setDocumentFormActivityId(doc.activityId ?? '');
      setShowModal(true);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [documents, loading, location.pathname, location.state, navigate]);

  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const activitiesMap = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const clientsWithDocuments = useMemo(() => {
    const clientIds = new Set(documents.map((doc) => doc.clientId));
    return clients.filter((client) => clientIds.has(client.id));
  }, [clients, documents]);

  useEffect(() => {
    if (activeClientIds.length === 0) return;
    const validIds = new Set(clientsWithDocuments.map((client) => client.id));
    const next = activeClientIds.filter((id) => validIds.has(id));
    if (next.length !== activeClientIds.length) {
      setActiveClientIds(next);
      setSelectedIds([]);
    }
  }, [activeClientIds, clientsWithDocuments]);

  const handleToggleClientFilter = (clientId: string) => {
    setActiveClientIds((current) => {
      if (current.includes(clientId)) {
        return current.filter((id) => id !== clientId);
      }
      return [...current, clientId];
    });
    setSelectedIds([]);
  };

  const handleSelectAllClientsFilter = () => {
    setActiveClientIds([]);
    setSelectedIds([]);
  };

  const activeDocumentTypeGroup = useMemo(
    () => documentTypeGroups.find((group) => group.id === activeTab) ?? null,
    [documentTypeGroups, activeTab],
  );

  const creatableDocumentGroupTypes = useMemo(
    () => getCreatableDocumentTypeGroupTypes(documentTypeGroups),
    [documentTypeGroups],
  );

  const canCreateDocumentGroup = canCreateDocumentTypeGroup(documentTypeGroups);

  const documentTabs = useMemo(
    () => [
      { id: 'all' as const, label: 'Todos', shortLabel: 'Todos' },
      ...documentTypeGroups.map((group) => ({
        id: group.id,
        label:
          isAdmin && group.documentType === 'invoice'
            ? `${group.name} (Solo admin)`
            : isAdmin && group.isPublic === false
              ? `${group.name} (Privado)`
              : group.name,
        shortLabel: DEFAULT_DOCUMENT_TYPE_GROUP_SHORT_LABELS[group.documentType],
        documentType: group.documentType,
        group,
      })),
    ],
    [documentTypeGroups, isAdmin],
  );
  const { verifactuEnabled } = useWorkspaceFeatureSettings();
  const documentDisplayColumns = useMemo(
    () => filterVerifactuDocumentDisplayColumns(DOCUMENT_DISPLAY_COLUMNS, verifactuEnabled),
    [verifactuEnabled],
  );
  const documentViewColumns = useMemo(
    () =>
      filterVerifactuTableViewColumns(buildDocumentTableViewColumns(clients), verifactuEnabled),
    [clients, verifactuEnabled],
  );
  const documentViewContext = useMemo(
    () => ({ clientsMap, activitiesMap, billingSettings }),
    [clientsMap, activitiesMap, billingSettings],
  );

  const openEdit = (doc: Document) => {
    setEditingDoc(doc);
    setDuplicateFrom(null);
    setDocumentFormActivityId(doc.activityId ?? '');
    setShowModal(true);
  };

  const openDuplicate = (doc: Document) => {
    setEditingDoc(null);
    setDuplicateFrom(doc);
    setDocumentFormActivityId('');
    setShowModal(true);
  };

  const handleDocumentSaved = async () => {
    await loadData();
    closeDocumentModal();
  };

  const handleDelete = (id: string) => {
    setDeleteConfirm({ ids: [id] });
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await Promise.all(deleteConfirm.ids.map((id) => documentsService.delete(id)));
      setSelectedIds((current) => current.filter((id) => !deleteConfirm.ids.includes(id)));
      setDeleteConfirm(null);
      await loadData();
    } catch {
      alert('No se pudieron eliminar los documentos.');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenDocument = (doc: Document) => {
    navigate(`/docs/${doc.id}`, {
      state: navigationStateForReturn(`${location.pathname}${location.search}`),
    });
  };

  const handleDownload = async (doc: Document) => {
    try {
      await downloadDocumentPdf(doc);
    } catch {
      const client = clientsMap.get(doc.clientId);
      if (client) downloadDocumentPdfLocally(doc, client);
    }
  };

  const handleDownloadXml = async (doc: Document) => {
    if (!isFinancialDocumentType(doc.type)) return;
    try {
      await downloadDocumentXml(doc);
    } catch {
      const client = clientsMap.get(doc.clientId);
      if (!client) {
        alert('No se pudo descargar el XML del documento.');
        return;
      }
      try {
        const company = await workspaceBillingSettingsService.get().catch(() => null);
        downloadDocumentXmlLocally(doc, client, company);
      } catch {
        alert('No se pudo descargar el XML del documento.');
      }
    }
  };

  const openEmailCompose = (doc: Document) => {
    const client = clientsMap.get(doc.clientId);
    if (!client) return;
    setActionMenu(null);
    setEmailCompose({ doc, client });
  };

  const handleEmailSend = async (payload: {
    to: string;
    cc: string;
    subject: string;
    body: string;
  }) => {
    if (!emailCompose) return;
    setEmailSending(true);
    try {
      await emailDocumentPdf(emailCompose.doc, emailCompose.client, payload);
      setEmailCompose(null);
    } catch {
      alert('No se pudo preparar el correo.');
    } finally {
      setEmailSending(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const selectedDocuments = useMemo(
    () => documents.filter((doc) => selectedIds.includes(doc.id)),
    [documents, selectedIds],
  );

  const handleBulkDownload = async () => {
    for (const doc of selectedDocuments) {
      await handleDownload(doc);
    }
  };

  const handleBulkEmail = () => {
    if (selectedDocuments.length !== 1) return;
    openEmailCompose(selectedDocuments[0]);
  };

  const handleBulkOpen = () => {
    if (selectedDocuments.length !== 1) return;
    handleOpenDocument(selectedDocuments[0]);
  };

  const handleBulkEdit = () => {
    if (selectedDocuments.length !== 1) return;
    openEdit(selectedDocuments[0]);
  };

  const handleBulkDuplicate = () => {
    if (selectedDocuments.length !== 1) return;
    openDuplicate(selectedDocuments[0]);
  };

  const handleBulkDelete = () => {
    if (selectedDocuments.length === 0) return;
    setDeleteConfirm({ ids: selectedDocuments.map((doc) => doc.id) });
  };

  const handleActivitySaved = async (activity?: Activity) => {
    setShowActivityModal(false);
    setActivityModalContext(null);
    setActivityLinkDoc(null);
    await loadData();
    if (activity?.id) {
      setDocumentFormActivityId(activity.id);
    }
  };

  const handleLinkToActivity = useCallback(async (doc: Document, activityId: string) => {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) {
      alert('Actividad no encontrada.');
      return;
    }

    const linkError = getDocumentActivityLinkError(doc, activity, documents, activityTypes);
    if (linkError) {
      logDocumentActivityLinkBlock(doc, activity, linkError);
      alert(linkError);
      return;
    }

    setActivityLinkMenu(null);
    try {
      await documentsService.update(doc.id, { activityId });
      await loadData();
    } catch (error) {
      console.error('Error al vincular actividad:', error);
      const message =
        error instanceof ApiError
          ? error.message
          : 'No se pudo vincular la actividad al documento.';
      alert(message);
    }
  }, [activities, documents, activityTypes, loadData]);

  const activityLinkMenuItems = useMemo((): ContextMenuItem[] => {
    if (!activityLinkMenu) return [];

    const doc = activityLinkMenu.doc;
    const clientActivities = activities
      .filter((activity) => activity.clientId === doc.clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const items: ContextMenuItem[] = [
      {
        id: 'new-activity',
        label: 'Nueva actividad',
        icon: <CalendarPlus size={16} />,
        onSelect: () => {
          setActivityLinkDoc(doc);
          setActivityModalContext({ clientId: doc.clientId, date: doc.date });
          setShowActivityModal(true);
          setActivityLinkMenu(null);
        },
      },
    ];

    for (const activity of clientActivities) {
      const dateLabel = format(parseISO(activity.date), 'd MMM yyyy', { locale: es });
      const description = activity.description.trim();
      const suffix = description.length > 36 ? `${description.slice(0, 36)}…` : description;
      items.push({
        id: activity.id,
        label: suffix ? `${dateLabel} · ${suffix}` : dateLabel,
        onSelect: () => void handleLinkToActivity(doc, activity.id),
      });
    }

    return items;
  }, [activityLinkMenu, activities, handleLinkToActivity]);

  const handleStatusChange = async (doc: Document, status: Document['status']) => {
    if (!isAdmin || doc.status === status) return;
    try {
      await documentsService.update(doc.id, { status });
      await loadData();
    } catch (error) {
      console.error('Error al cambiar estado del documento:', error);
      alert('No se pudo guardar el estado del documento. Comprueba que solo hay un backend en marcha.');
    }
  };

  const typeLabels = DOCUMENT_TYPE_LABELS;

  const deleteConfirmMessage = useMemo(() => {
    if (!deleteConfirm) return '';
    const count = deleteConfirm.ids.length;
    if (count === 1) {
      const doc = documents.find((item) => item.id === deleteConfirm.ids[0]);
      if (doc) {
        return `¿Eliminar ${typeLabels[doc.type].toLowerCase()} ${doc.number}? Esta acción no se puede deshacer.`;
      }
      return '¿Eliminar este documento? Esta acción no se puede deshacer.';
    }
    return `¿Eliminar ${count} documentos? Esta acción no se puede deshacer.`;
  }, [deleteConfirm, documents, typeLabels]);

  const deleteConfirmTitle = deleteConfirm && deleteConfirm.ids.length > 1
    ? 'Eliminar documentos'
    : 'Eliminar documento';

  const sortedDocuments = [...documents].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const tabFilteredDocuments = sortedDocuments.filter((doc) => {
    if (activeDocumentTypeGroup && doc.type !== activeDocumentTypeGroup.documentType) {
      return false;
    }
    if (activeClientIds.length > 0 && !activeClientIds.includes(doc.clientId)) return false;
    return true;
  });

  const searchedDocuments = useMemo(
    () =>
      tabFilteredDocuments.filter((doc) =>
        matchesTableSearch(doc, searchTerm, documentViewColumns, documentViewContext),
      ),
    [tabFilteredDocuments, searchTerm, documentViewColumns, documentViewContext],
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
    DOCUMENTS_VIEW_PAGE_KEY,
    documentDisplayColumns,
    documentViewColumns,
    documentViewContext,
    'number',
  );

  const showSecondaryNav = !secondaryNavCollapsed && !modalOpen;
  useLayoutSecondarySidebarWidth(!secondaryNavCollapsed || modalOpen);

  const toolbarDocumentsCount = useMemo(
    () => applyView(tabFilteredDocuments).length,
    [applyView, tabFilteredDocuments],
  );

  const documentsSearchPlaceholder = useMemo(
    () => {
      const tabForSearch =
        activeDocumentTypeGroup?.documentType ??
        (activeTab === 'invoice' || activeTab === 'delivery-note' ? activeTab : 'all');
      return getDocumentsSearchPlaceholder(toolbarDocumentsCount, tabForSearch);
    },
    [toolbarDocumentsCount, activeDocumentTypeGroup, activeTab],
  );

  const filteredDocuments = applyView(searchedDocuments);
  const tableRows = useMemo(
    () => (viewConfig.layout === 'table' ? buildRows(searchedDocuments) : []),
    [viewConfig.layout, buildRows, searchedDocuments],
  );
  const boardGroups = useMemo(
    () => (viewConfig.layout === 'board' ? buildBoard(searchedDocuments) : []),
    [viewConfig.layout, buildBoard, searchedDocuments],
  );

  const boardEmptyDescription =
    documents.length === 0
      ? 'No hay documentos. Crea uno con «Nuevo Documento».'
      : searchedDocuments.length === 0
        ? 'No hay documentos que coincidan con los filtros activos.'
        : 'No hay documentos que coincidan con la vista del tablero.';

  const exportFilenamePrefix = useMemo(() => {
    if (activeDocumentTypeGroup) {
      const safeName =
        activeDocumentTypeGroup.name
          .trim()
          .normalize('NFD')
          .replace(/\p{M}/gu, '')
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase() || 'documentos';
      return safeName;
    }
    return 'documentos';
  }, [activeDocumentTypeGroup]);

  const handleDownloadCsv = () => {
    if (!isAdmin || filteredDocuments.length === 0) return;
    const filename = `${exportFilenamePrefix}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadDocumentsCsv(filteredDocuments, clientsMap, filename);
  };

  const handleDownloadGroup = (group: DocumentTypeGroup) => {
    if (!isAdmin) return;
    const groupDocuments = documents.filter((doc) => doc.type === group.documentType);
    if (groupDocuments.length === 0) return;
    const safeName =
      group.name
        .trim()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase() || 'documentos';
    const filename = `${safeName}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    downloadDocumentsCsv(groupDocuments, clientsMap, filename);
  };

  const handleDeleteGroup = (group: DocumentTypeGroup) => {
    if (!isAdmin) return;
    setDeleteGroupConfirm(group);
  };

  const executeDeleteGroup = async (documentsAction: 'keep' | 'delete_documents') => {
    if (!deleteGroupConfirm || deletingGroup || !isAdmin) return;
    setDeletingGroup(true);
    try {
      await documentTypeGroupsService.delete(deleteGroupConfirm.id, documentsAction);
      if (activeTab === deleteGroupConfirm.id) {
        setActiveTab('all');
      }
      setSelectedIds([]);
      setDeleteGroupConfirm(null);
      await loadData();
    } catch {
      alert('No se pudo eliminar el tipo.');
    } finally {
      setDeletingGroup(false);
    }
  };

  const deleteGroupDocumentCount = deleteGroupConfirm
    ? documents.filter((doc) => doc.type === deleteGroupConfirm.documentType).length
    : 0;

  const handleEditGroup = (group: DocumentTypeGroup) => {
    if (!isAdmin) return;
    setEditingGroup(group);
    setShowGroupModal(true);
  };

  const typeNavProps = {
    tabs: documentTabs,
    activeTab,
    onSelectTab: (tab: DocumentTab) => {
      setActiveTab(tab);
      setSelectedIds([]);
    },
    isAdmin,
    onCreateGroup:
      isAdmin && canCreateDocumentGroup
        ? () => {
            setEditingGroup(null);
            setShowGroupModal(true);
          }
        : undefined,
    onEditGroup: isAdmin ? handleEditGroup : undefined,
    onDownloadGroup: handleDownloadGroup,
    onDeleteGroup: handleDeleteGroup,
    clients: clientsWithDocuments,
    activeClientIds,
    onToggleClient: handleToggleClientFilter,
    onSelectAllClients: handleSelectAllClientsFilter,
    savedViews,
    activeSavedViewId,
    onSelectView: loadView,
  };

  const clientNavProps = {
    clients: clientsWithDocuments,
    activeClientIds,
    onToggleClient: handleToggleClientFilter,
    onSelectAllClients: handleSelectAllClientsFilter,
    searchTerm: clientFilterSearch,
    onSearchChange: setClientFilterSearch,
  };

  const openToolbarOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isAdmin) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setToolbarOptionsMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const handleOpenFinancialDocumentsSettings = useCallback(() => {
    navigate('/settings?tab=financial-documents');
  }, [navigate]);

  const toolbarOptionsItems: ContextMenuItem[] = useMemo(() => {
    if (!isAdmin) return [];

    const items: ContextMenuItem[] = [];

    if (activeDocumentTypeGroup) {
      items.push(
        {
          id: 'edit-group',
          label: 'Editar grupo',
          icon: <Pencil size={16} />,
          onSelect: () => handleEditGroup(activeDocumentTypeGroup),
        },
        {
          id: 'download-group',
          label: 'Descargar grupo',
          icon: <ArrowDownToLine size={16} />,
          disabled: documents.filter((doc) => doc.type === activeDocumentTypeGroup.documentType).length === 0,
          onSelect: () => handleDownloadGroup(activeDocumentTypeGroup),
        },
        {
          id: 'delete-group',
          label: 'Eliminar grupo',
          icon: <CircleMinus size={16} />,
          danger: true,
          onSelect: () => handleDeleteGroup(activeDocumentTypeGroup),
        },
        { kind: 'separator', id: 'group-actions-separator' },
      );
    }

    items.push(
      {
        id: 'financial-documents',
        label: 'Documentos financieros',
        icon: <FileCode size={16} />,
        onSelect: handleOpenFinancialDocumentsSettings,
      },
      {
        id: 'download-csv',
        label: 'Descargar CSV',
        icon: <ArrowDownToLine size={16} />,
        disabled: filteredDocuments.length === 0,
        onSelect: handleDownloadCsv,
      },
    );

    return items;
  }, [
    isAdmin,
    activeDocumentTypeGroup,
    documents,
    handleEditGroup,
    handleDownloadGroup,
    handleDeleteGroup,
    handleOpenFinancialDocumentsSettings,
    filteredDocuments.length,
    handleDownloadCsv,
  ]);

  const {
    visibleItems: visibleRows,
    sentinelRef,
    hasMore,
  } = useInfiniteScrollList<TableViewRow<Document>>(
    tableRows,
    [searchTerm, config, clients, activeTab, activeClientIds],
    INFINITE_SCROLL_BATCH_SIZE,
    tableBodyRef,
  );

  const visibleIds = visibleRows
    .filter((row): row is { kind: 'item'; item: Document } => row.kind === 'item')
    .map((row) => row.item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.includes(id));

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

  useEffect(() => {
    const validIds = new Set(documents.map((doc) => doc.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [documents]);

  if (loading) {
    return (
      <div className={styles.documentsPage}>
        <SecondarySidebarPortal>
          <aside
            className={cx(
              styles.documentsNav,
              secondaryNavCollapsed && styles.documentsNavCollapsed,
            )}
            aria-label="Tipos de documento"
            aria-hidden={secondaryNavCollapsed ? true : undefined}
            aria-busy
          >
            {!secondaryNavCollapsed && (
              <>
                <SecondarySidebarSectionHeader
                  variant="page"
                  title="Documentos"
                  action={
                    <SecondaryNavToggle
                      expanded
                      onToggle={toggleSecondaryNav}
                      controlsId="documents-secondary-nav"
                      className={styles.documentsNavToggle}
                    />
                  }
                />
                <div className={styles.documentsNavScrollBody} {...scrollRegionProps}>
                <SecondarySidebarResizableSections
                  storageKey="documents"
                  className={styles.documentsNavSections}
                  sections={[
                    {
                      id: 'types',
                      children: (
                        <div className={styles.documentsNavSectionStack}>
                          <SecondarySidebarSectionHeader title="Tipos" />
                          <DocumentsTypeNav
                            tabs={documentTabs}
                            activeTab={activeTab}
                            onSelectTab={() => {}}
                            isAdmin={isAdmin}
                            loading
                            stacked
                          />
                        </div>
                      ),
                    },
                    {
                      id: 'clients',
                      children: (
                        <DocumentsClientNav
                          clients={[]}
                          activeClientIds={[]}
                          onToggleClient={() => {}}
                          onSelectAllClients={() => {}}
                          searchTerm=""
                          onSearchChange={() => {}}
                          loading
                          stacked
                        />
                      ),
                    },
                  ]}
                />
                </div>
              </>
            )}
          </aside>
        </SecondarySidebarPortal>
        <ContentLoading className={styles.documentsContentLoading} />
      </div>
    );
  }

  const viewFilterProps = {
    open: modalOpen,
    onOpen: openModal,
    onClose: closeViewModal,
    onApply: applyDraft,
    draftConfig,
    onDraftChange: updateDraft,
    displayColumns: documentDisplayColumns,
    dataColumns: documentViewColumns,
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
    defaultFilterColumnId: 'number' as const,
    activeSavedViewId,
    panelPlacement: 'secondarySidebar' as const,
  };

  return (
    <div className={styles.documentsPage}>
      <SecondarySidebarPortal>
      <aside
        id="documents-secondary-nav"
        className={cx(
          styles.documentsNav,
          modalOpen && styles.documentsNavFiltersOpen,
          !showSecondaryNav && !modalOpen && styles.documentsNavCollapsed,
        )}
        aria-label={modalOpen ? 'Vistas y filtros' : 'Tipos de documento'}
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
            <SecondarySidebarSectionHeader
              variant="page"
              title="Documentos"
              action={
                <SecondaryNavToggle
                  expanded
                  onToggle={toggleSecondaryNav}
                  controlsId="documents-secondary-nav"
                  className={styles.documentsNavToggle}
                />
              }
            />
            <div className={styles.documentsNavScrollBody} {...scrollRegionProps}>
            <SecondarySidebarResizableSections
              storageKey="documents"
              className={styles.documentsNavSections}
              sections={[
                {
                  id: 'types',
                  children: (
                    <div className={styles.documentsNavSectionStack}>
                      <SecondarySidebarSectionHeader title="Tipos" />
                      <DocumentsTypeNav {...typeNavProps} stacked />
                    </div>
                  ),
                },
                ...(!isMobile && savedViews.length > 0
                  ? [
                      {
                        id: 'views',
                        children: (
                          <SavedViewsNav
                            views={savedViews}
                            activeViewId={activeSavedViewId}
                            onSelect={loadView}
                            onDelete={requestDeleteView}
                            stacked
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  id: 'clients',
                  children: <DocumentsClientNav {...clientNavProps} stacked />,
                },
              ]}
            />
            </div>
          </>
        )}
      </aside>
      </SecondarySidebarPortal>

      <div className={styles.documentsContent}>
      <div ref={tablePageRef} className={ui.tablePage}>
        <div className={styles.documentsToolbarStack}>
        <div className={cx(ui.tableToolbar, styles.documentsTableToolbar)}>
          <div className={ui.filtersRow}>
            {secondaryNavCollapsed && !modalOpen && (
              <SecondaryNavToggle
                expanded={false}
                onToggle={toggleSecondaryNav}
                controlsId="documents-secondary-nav"
                className={styles.secondaryNavExpandBtn}
              />
            )}
            <SearchField
              wrapperClassName={ui.searchWrapper}
              placeholder={documentsSearchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              trailing={
                <>
                  {isMobile && (
                    <DocumentsTypeNav
                      {...typeNavProps}
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
                className={cx(ui.navMobileOptionsBtn, styles.documentsToolbarOptionsBtn)}
                aria-label="Opciones"
                title="Opciones"
                aria-haspopup="menu"
                aria-expanded={toolbarOptionsMenu !== null}
              >
                <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
              </button>
            )}
            {!isMobile && (
              <div className={cx(ui.toolbarBtnGroup, ui.toolbarEnd)}>
                {isAdmin && (
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
                )}
                <button
                  type="button"
                  onClick={openNewDocument}
                  className={ui.toolbarBtnPrimary}
                  aria-label="Nuevo documento"
                  title="Nuevo documento"
                >
                  <Plus size={16} />
                  Documento
                </button>
              </div>
            )}
          </div>
        </div>
        </div>

        {selectedIds.length > 0 && (
          <div className={styles.bulkActionBar} role="toolbar" aria-label="Acciones masivas">
            <span className={styles.bulkActionCount}>
              {selectedIds.length} seleccionado{selectedIds.length === 1 ? '' : 's'}
            </span>
            <div className={styles.bulkActionButtons}>
              {selectedIds.length === 1 && (
                <button
                  type="button"
                  onClick={handleBulkOpen}
                  className={ui.btnIcon}
                  title="Abrir documento"
                  aria-label="Abrir documento"
                >
                  <ExternalLink size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={handleBulkEdit}
                className={ui.btnIcon}
                title="Editar documento"
                disabled={selectedIds.length !== 1}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={handleBulkDuplicate}
                className={ui.btnIcon}
                title="Duplicar documento"
                disabled={selectedIds.length !== 1}
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                onClick={() => void handleBulkDownload()}
                className={ui.btnIcon}
                title="Descargar PDF"
              >
                <ArrowDownToLine size={16} />
              </button>
              {selectedIds.length === 1 && (
                <button
                  type="button"
                  onClick={handleBulkEmail}
                  className={ui.btnIcon}
                  title="Enviar por correo"
                >
                  <Mail size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={handleBulkDelete}
                className={ui.btnIconDanger}
                title="Eliminar"
              >
                <CircleMinus size={16} />
              </button>
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
          </div>
        )}

        <div
          ref={tableBodyRef}
          className={cx(ui.tableBody, styles.documentsTableBody)}
          {...scrollRegionProps}
        >
          {viewConfig.layout === 'board' ? (
            <BoardView
              groups={boardGroups}
              getItemKey={(doc) => doc.id}
              renderCard={(doc) => renderDocumentBoardCard(doc, clientsMap)}
              onCardClick={handleOpenDocument}
              emptyDescription={boardEmptyDescription}
            />
          ) : (
            <>
              <div className={styles.documentsTablePanel}>
              <ConfigurableTable
                displayColumns={documentDisplayColumns}
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
                              badgeClassName={row.badgeClassName}
                              itemIds={row.itemIds}
                              colSpan={visibleColumns.length}
                              selectedIds={selectedIds}
                              onToggleSelect={() => toggleSelectGroup(row.itemIds)}
                            />
                          </tr>
                        );
                      }

                      const doc = row.item;
                      return (
                        <tr
                          key={doc.id}
                          className={cx(
                            ui.tableRow,
                            styles.documentRow,
                          )}
                          onClick={() => handleOpenDocument(doc)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleOpenDocument(doc);
                            }
                          }}
                          title="Abrir documento"
                          aria-selected={selectedIds.includes(doc.id)}
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
                                column.id === 'select' || column.id === 'status' || column.id === 'activity'
                                  ? (event) => event.stopPropagation()
                                  : undefined
                              }
                            >
                              {renderDocumentCell({
                                columnId: column.id,
                                doc,
                                clientsMap,
                                activitiesMap,
                                selectedIds,
                                isAdmin,
                                toggleSelect,
                                setStatusMenu,
                                setActionMenu,
                                setActivityLinkMenu,
                                actionMenuDocId: actionMenu?.doc.id,
                                statusMenuDocId: statusMenu?.doc.id,
                                activityLinkMenuDocId: activityLinkMenu?.doc.id,
                                billingSettings,
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
                          emoji="📄"
                          description="Añade un documento con «Nuevo Documento»."
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

      <div
        className={cx(
          styles.documentsNavMobile,
          navMobileHidden && styles.documentsNavMobileHidden,
        )}
        role="toolbar"
        aria-label="Acciones de documentos"
      >
        <div className={styles.documentsNavMobileActions}>
          <button
            type="button"
            onClick={openNewDocument}
            className={styles.documentsNavMobileFooterPrimary}
            aria-label="Nuevo documento"
            title="Nuevo documento"
          >
            <Plus size={16} strokeWidth={2} aria-hidden />
            Documento
          </button>
        </div>
      </div>

      {isAdmin && toolbarOptionsMenu && (
        <ContextMenu
          x={toolbarOptionsMenu.x}
          y={toolbarOptionsMenu.y}
          anchorX="center"
          ariaLabel="Opciones de documentos"
          onClose={() => setToolbarOptionsMenu(null)}
          items={toolbarOptionsItems}
        />
      )}

      {isAdmin && statusMenu && (
        <ContextMenu
          x={statusMenu.x}
          y={statusMenu.y}
          anchorX="center"
          ariaLabel="Cambiar estado del documento"
          onClose={() => setStatusMenu(null)}
          items={DOCUMENT_STATUSES.map((status) => ({
            id: status,
            label: DOCUMENT_STATUS_LABELS[status],
            dotColor: DOCUMENT_STATUS_DOT[status],
            selected: statusMenu.doc.status === status,
            disabled: statusMenu.doc.status === status,
            onSelect: () => handleStatusChange(statusMenu.doc, status),
          }))}
        />
      )}

      {actionMenu && (
        <ContextMenu
          x={actionMenu.x}
          y={actionMenu.y}
          ariaLabel="Acciones del documento"
          onClose={() => setActionMenu(null)}
          items={[
            {
              id: 'select',
              label: selectedIds.includes(actionMenu.doc.id) ? 'Quitar selección' : 'Seleccionar',
              icon: selectedIds.includes(actionMenu.doc.id)
                ? <CheckSquare size={16} />
                : <Square size={16} />,
              onSelect: () => toggleSelect(actionMenu.doc.id),
            },
            {
              id: 'edit',
              label: actionMenu.doc.activityId
                ? 'Editar'
                : 'Editar / vincular actividad',
              icon: <Pencil size={16} />,
              onSelect: () => openEdit(actionMenu.doc),
            },
            {
              id: 'duplicate',
              label: 'Duplicar',
              icon: <Copy size={16} />,
              onSelect: () => openDuplicate(actionMenu.doc),
            },
            {
              id: 'download',
              label: 'Descargar PDF',
              icon: <ArrowDownToLine size={16} />,
              onSelect: () => void handleDownload(actionMenu.doc),
            },
            ...(isFinancialDocumentType(actionMenu.doc.type)
              ? [
                  {
                    id: 'download-xml',
                    label: 'Descargar XML',
                    icon: <FileCode size={16} />,
                    onSelect: () => void handleDownloadXml(actionMenu.doc),
                  } satisfies ContextMenuItem,
                ]
              : []),
            {
              id: 'email',
              label: 'Enviar por correo',
              icon: <Mail size={16} />,
              onSelect: () => openEmailCompose(actionMenu.doc),
            },
            {
              id: 'delete',
              label: 'Eliminar',
              icon: <CircleMinus size={16} />,
              danger: true,
              onSelect: () => handleDelete(actionMenu.doc.id),
            },
          ]}
        />
      )}

      {activityLinkMenu && (
        <ContextMenu
          x={activityLinkMenu.x}
          y={activityLinkMenu.y}
          anchorX="center"
          ariaLabel="Vincular actividad"
          onClose={() => setActivityLinkMenu(null)}
          items={activityLinkMenuItems}
        />
      )}

      {showActivityModal && activityModalContext && (
        <ActivityFormModal
          eventToEdit={null}
          initialDate={activityModalContext.date}
          initialClientId={activityModalContext.clientId}
          initialLinkedDocumentIds={
            activityLinkDoc ? [activityLinkDoc.id] : editingDoc ? [editingDoc.id] : []
          }
          directForm
          onClose={() => {
            setShowActivityModal(false);
            setActivityModalContext(null);
            setActivityLinkDoc(null);
          }}
          onSaved={handleActivitySaved}
        />
      )}

      <DeleteDocumentTypeGroupDialog
        open={deleteGroupConfirm !== null}
        group={deleteGroupConfirm}
        documentCount={deleteGroupDocumentCount}
        loading={deletingGroup}
        onConfirm={executeDeleteGroup}
        onCancel={() => {
          if (!deletingGroup) setDeleteGroupConfirm(null);
        }}
      />

      <DocumentTypeGroupModal
        open={showGroupModal && isAdmin && (editingGroup !== null || canCreateDocumentGroup)}
        group={editingGroup}
        creatableDocumentTypes={creatableDocumentGroupTypes}
        onClose={() => {
          setShowGroupModal(false);
          setEditingGroup(null);
        }}
        onSaved={async (group) => {
          const wasEdit = editingGroup !== null;
          await loadData();
          if (!wasEdit) {
            setActiveTab(group.id);
          }
        }}
      />

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

      {emailCompose ? (() => {
        const emailDefaults = buildDocumentEmailDefaults(emailCompose.doc, emailCompose.client);
        return (
          <EmailComposeModal
            open
            onClose={() => {
              if (!emailSending) setEmailCompose(null);
            }}
            defaultTo={emailDefaults.to}
            defaultSubject={emailDefaults.subject}
            defaultBody={emailDefaults.body}
            attachmentLabel={emailDefaults.attachmentLabel}
            attachmentPreview={buildDocumentEmailAttachmentPreview(
              emailCompose.doc,
              emailCompose.client,
            )}
            sending={emailSending}
            onSend={handleEmailSend}
          />
        );
      })() : null}

      <DocumentFormModal
        open={showModal}
        onClose={closeDocumentModal}
        onSaved={handleDocumentSaved}
        clients={clients}
        activities={activities}
        editingDoc={editingDoc}
        duplicateFrom={duplicateFrom}
        initialActivityId={documentFormActivityId}
        externalActivityId={documentFormActivityId}
        onRequestActivity={({ clientId, date }) => {
          setActivityModalContext({ clientId, date });
          setShowActivityModal(true);
        }}
      />
      </div>
    </div>
  );
}
