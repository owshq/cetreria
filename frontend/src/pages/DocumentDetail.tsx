import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router';
import {
  ArrowLeft,
  ArrowDownToLine,
  CalendarPlus,
  CircleMinus,
  FileCode,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  activitiesService,
  authService,
  clientsService,
  documentsService,
  workspaceBillingSettingsService,
} from '@/api';
import { revokePdfObjectUrl } from '@/api/documents';
import {
  DOCUMENT_TYPE_LABELS,
  isFinancialDocumentType,
  type Activity,
  type Client,
  type Document,
  type WorkspaceBillingSettings,
} from '@shared/types';
import {
  canSubmitVerifactu,
  isVerifactuLocked,
  resolveVerifactuStatus,
} from '@shared/types';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import ContentLoading from '@/components/ContentLoading';
import DocumentStatusBadge from '@/components/DocumentStatusBadge';
import SidebarToggle from '@/components/SidebarToggle';
import SecondaryNavToggle from '@/components/SecondaryNavToggle';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import ConfirmDialog from '@/components/ConfirmDialog';
import ActivityFormModal from '@/components/ActivityFormModal';
import DocumentFormModal from '@/components/DocumentFormModal';
import VerifactuApproveModal from '@/components/VerifactuApproveModal';
import VerifactuDocumentMetaPanel from '@/components/VerifactuDocumentMetaPanel';
import VerifactuStatusBadge from '@/components/VerifactuStatusBadge';
import DocumentsListSidebar from '@/components/DocumentsListSidebar';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import SecondarySidebarPortal from '@/components/SecondarySidebarPortal';
import { getReturnPath, navigationStateForReturn } from '@/lib/navigation';
import {
  downloadDocumentPdf,
  downloadDocumentPdfLocally,
  getDocumentPdfLocalObjectUrl,
  printPdfFromPreviewUrl,
} from '@/lib/documentPdf';
import { downloadDocumentXml, downloadDocumentXmlLocally } from '@/lib/documentXml';
import EmailComposeModal from '@/components/EmailComposeModal';
import { buildDocumentEmailDefaults, buildDocumentEmailAttachmentPreview, emailDocumentPdf } from '@/lib/documentEmail';
import { getDocumentDisplayName } from '@/lib/documentDisplayName';
import { activityDetailPath } from '@/lib/activityPaths';
import {
  formatDocumentHeaderMeta,
  formatLinkedActivityHeaderLabel,
} from '@/lib/documentHeaderMeta';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { ApiError } from '@/api/client';
import {
  getDocumentActivityLinkError,
  logDocumentActivityLinkBlock,
} from '@/lib/documentActivityLink';
import {
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
} from '@/lib/documentStatus';
import { useLayoutSecondarySidebarWidth } from '@/hooks/useLayoutSecondarySidebarWidth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSecondaryNavCollapsed } from '@/hooks/useSecondaryNavCollapsed';
import headerStyles from '@/components/DetailPageHeader.module.css';
import styles from './DocumentDetail.module.css';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getReturnPath(location.state, '/docs');
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [document, setDocument] = useState<Document | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [linkedActivity, setLinkedActivity] = useState<Activity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [billingSettings, setBillingSettings] = useState<WorkspaceBillingSettings | null>(null);
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editModalDoc, setEditModalDoc] = useState<Document | null>(null);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityModalContext, setActivityModalContext] = useState<{
    clientId: string;
    date: string;
  } | null>(null);
  const [documentFormActivityId, setDocumentFormActivityId] = useState('');
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number } | null>(null);
  const [activityLinkMenu, setActivityLinkMenu] = useState<{ x: number; y: number } | null>(null);
  const [documentOptionsMenu, setDocumentOptionsMenu] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emailCompose, setEmailCompose] = useState<{ doc: Document; client: Client } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [showVerifactuModal, setShowVerifactuModal] = useState(false);
  const {
    collapsed: secondaryNavCollapsed,
    toggle: toggleSecondaryNav,
    setCollapsed: setSecondaryNavCollapsed,
  } = useSecondaryNavCollapsed('documents');
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const { activityTypes } = useActivityTypes();

  const clientsMap = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);
  useLayoutSecondarySidebarWidth(!secondaryNavCollapsed);

  const headerMeta = useMemo(
    () => (document ? formatDocumentHeaderMeta(document) : null),
    [document],
  );

  const linkedActivityLabel = useMemo(
    () =>
      linkedActivity ? formatLinkedActivityHeaderLabel(linkedActivity, activityTypes) : null,
    [linkedActivity, activityTypes],
  );

  const handleBack = () => {
    if (
      location.state &&
      typeof location.state === 'object' &&
      'returnTo' in location.state
    ) {
      navigate(-1);
      return;
    }
    navigate(returnPath);
  };

  const refreshDocumentList = useCallback(async () => {
    setListLoading(true);
    try {
      const { documents, clients, activities } = await documentsService.getBootstrap();
      setAllDocuments(documents);
      setClients(clients);
      if (document?.clientId) {
        setActivities(activities.filter((item) => item.clientId === document.clientId));
      }
    } finally {
      setListLoading(false);
    }
  }, [document?.clientId]);

  useLayoutEffect(() => {
    if (!id) return;
    setSecondaryNavCollapsed(isMobile, { persist: false });
  }, [id, isMobile, setSecondaryNavCollapsed]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    let ownedPdfUrl: string | null = null;

    const replacePdfUrl = (next: string | null) => {
      if (ownedPdfUrl && ownedPdfUrl !== next && ownedPdfUrl.startsWith('blob:')) {
        revokePdfObjectUrl(ownedPdfUrl);
      }
      ownedPdfUrl = next;
      setPdfUrl(next);
    };

    const load = async () => {
      setLoading(true);
      setListLoading(true);
      setPdfError(false);
      replacePdfUrl(null);
      setLinkedActivity(null);

      const [bootstrap, billing] = await Promise.all([
        documentsService.getBootstrap(),
        workspaceBillingSettingsService.get().catch(() => null),
      ]);

      if (cancelled) return;

      const doc = bootstrap.documents.find((item) => item.id === id) ?? null;
      const clientList = bootstrap.clients;

      setAllDocuments(bootstrap.documents);
      setClients(clientList);
      setListLoading(false);
      setBillingSettings(billing);

      if (!doc) {
        setDocument(null);
        setClient(null);
        setLoading(false);
        return;
      }

      setDocument(doc);

      const clientData =
        clientList.find((item) => item.id === doc.clientId) ??
        (await clientsService.getById(doc.clientId));

      const pdfPromise = documentsService.getPdfPreviewUrl(id).catch(() => null);
      const activityList = bootstrap.activities.filter((item) => item.clientId === doc.clientId);

      if (cancelled) return;

      const linkedActivityResolved = doc.activityId
        ? (activityList.find((item) => item.id === doc.activityId) ?? null)
        : null;

      setClient(clientData);
      setActivities(activityList);
      setClients(clientList);
      setLinkedActivity(linkedActivityResolved);
      setLoading(false);

      const previewUrl = await pdfPromise;
      if (cancelled) return;

      if (previewUrl) {
        replacePdfUrl(previewUrl);
        return;
      }

      if (clientData) {
        replacePdfUrl(getDocumentPdfLocalObjectUrl(doc, clientData));
      } else {
        setPdfError(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (ownedPdfUrl?.startsWith('blob:')) {
        revokePdfObjectUrl(ownedPdfUrl);
      }
    };
  }, [id]);

  const handleSelectDocument = (doc: Document) => {
    if (doc.id === id) return;
    navigate(`/docs/${doc.id}`, {
      state: navigationStateForReturn(returnPath),
    });
  };

  const handleStatusChange = async (status: Document['status']) => {
    if (!document || !isAdmin || document.status === status) return;
    try {
      const updated = await documentsService.update(document.id, { status });
      setDocument(updated);
      setStatusMenu(null);
      await refreshDocumentList();
    } catch (error) {
      console.error('Error al cambiar estado del documento:', error);
      alert('No se pudo guardar el estado del documento. Comprueba que solo hay un backend en marcha.');
    }
  };

  const openStatusMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setStatusMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const handleLinkToActivity = useCallback(
    async (activityId: string) => {
      if (!document) return;

      const activity =
        activities.find((item) => item.id === activityId) ??
        (await activitiesService.getById(activityId));
      if (!activity) {
        alert('Actividad no encontrada.');
        return;
      }

      const linkError = getDocumentActivityLinkError(
        document,
        activity,
        allDocuments,
        activityTypes,
      );
      if (linkError) {
        logDocumentActivityLinkBlock(document, activity, linkError);
        alert(linkError);
        return;
      }

      setActivityLinkMenu(null);
      try {
        const updated = await documentsService.update(document.id, { activityId });
        setDocument(updated);
        setLinkedActivity(activity);
        await refreshDocumentList();
      } catch (error) {
        console.error('Error al vincular actividad:', error);
        const message =
          error instanceof ApiError
            ? error.message
            : 'No se pudo vincular la actividad al documento.';
        alert(message);
      }
    },
    [activities, activityTypes, allDocuments, document],
  );

  const activityLinkMenuItems = useMemo((): ContextMenuItem[] => {
    if (!activityLinkMenu || !document) return [];

    const clientActivities = activities
      .filter((activity) => activity.clientId === document.clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const items: ContextMenuItem[] = [
      {
        id: 'new-activity',
        label: 'Nueva actividad',
        icon: <CalendarPlus size={16} />,
        onSelect: () => {
          setActivityModalContext({ clientId: document.clientId, date: document.date });
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
        onSelect: () => void handleLinkToActivity(activity.id),
      });
    }

    return items;
  }, [activityLinkMenu, activities, document, handleLinkToActivity]);

  const openActivityLinkMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setActivityLinkMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const handleActivitySaved = async (activity?: Activity) => {
    setShowActivityModal(false);
    setActivityModalContext(null);
    let activityList = activities;
    if (document?.clientId) {
      activityList = await activitiesService.getByClientId(document.clientId);
      setActivities(activityList);
    }
    if (activity?.id) {
      setDocumentFormActivityId(activity.id);
    }
    if (id) {
      const updated = await documentsService.getById(id);
      if (updated) {
        setDocument(updated);
        if (updated.activityId) {
          const linked =
            activityList.find((item) => item.id === updated.activityId) ??
            (await activitiesService.getById(updated.activityId));
          setLinkedActivity(linked);
        } else {
          setLinkedActivity(null);
        }
      }
    }
    await refreshDocumentList();
  };

  const handleVerifactuSubmitted = async (updated: Document) => {
    setDocument(updated);
    setShowVerifactuModal(false);
    await refreshDocumentList();
    setPdfError(false);
    try {
      const url = await documentsService.getPdfPreviewUrl(updated.id);
      setPdfUrl((current) => {
        if (current?.startsWith('blob:')) revokePdfObjectUrl(current);
        return url;
      });
    } catch {
      if (client) {
        setPdfUrl(getDocumentPdfLocalObjectUrl(updated, client, billingSettings));
      } else {
        setPdfError(true);
      }
    }
  };

  const handleDocumentSaved = async () => {
    const savedDocId = editModalDoc?.id ?? id;
    if (!savedDocId) return;

    const updated = await documentsService.getById(savedDocId);
    setShowEditModal(false);
    setEditModalDoc(null);
    await refreshDocumentList();

    if (savedDocId !== id) return;

    if (updated) {
      setDocument(updated);
      if (updated.activityId) {
        const activity =
          activities.find((item) => item.id === updated.activityId) ??
          (await activitiesService.getById(updated.activityId));
        setLinkedActivity(activity);
      } else {
        setLinkedActivity(null);
      }
    }

    setPdfError(false);

    try {
      const url = await documentsService.getPdfPreviewUrl(savedDocId);
      setPdfUrl((current) => {
        if (current?.startsWith('blob:')) revokePdfObjectUrl(current);
        return url;
      });
    } catch {
      if (client && updated) {
        const localUrl = getDocumentPdfLocalObjectUrl(updated, client);
        setPdfUrl((current) => {
          if (current?.startsWith('blob:')) revokePdfObjectUrl(current);
          return localUrl;
        });
      } else {
        setPdfUrl((current) => {
          if (current?.startsWith('blob:')) revokePdfObjectUrl(current);
          return null;
        });
        setPdfError(true);
      }
    }
  };

  const documentTitle = useMemo(() => {
    if (!document || !client) return '';
    return getDocumentDisplayName(document, client.name, billingSettings);
  }, [billingSettings, client, document]);

  const handleDownloadPdf = useCallback(
    async (targetDoc: Document) => {
      setDocumentOptionsMenu(null);
      const docClient = clientsMap.get(targetDoc.clientId);
      try {
        await downloadDocumentPdf(targetDoc);
      } catch {
        if (docClient) downloadDocumentPdfLocally(targetDoc, docClient, billingSettings);
      }
    },
    [billingSettings, clientsMap],
  );

  const handleDownloadXml = useCallback(
    async (targetDoc: Document) => {
      if (!isFinancialDocumentType(targetDoc.type)) return;
      setDocumentOptionsMenu(null);
      const docClient = clientsMap.get(targetDoc.clientId);
      try {
        await downloadDocumentXml(targetDoc);
      } catch {
        if (!docClient) {
          alert('No se pudo descargar el XML del documento.');
          return;
        }
        try {
          downloadDocumentXmlLocally(targetDoc, docClient, billingSettings);
        } catch {
          alert('No se pudo descargar el XML del documento.');
        }
      }
    },
    [billingSettings, clientsMap],
  );

  const openEmailCompose = useCallback(
    (targetDoc: Document) => {
      const docClient = clientsMap.get(targetDoc.clientId);
      if (!docClient) return;
      setDocumentOptionsMenu(null);
      setEmailCompose({ doc: targetDoc, client: docClient });
    },
    [clientsMap],
  );

  const handleEmailSend = useCallback(
    async (payload: { to: string; cc: string; subject: string; body: string }) => {
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
    },
    [emailCompose],
  );

  const handlePrint = useCallback(
    async (targetDoc: Document) => {
      setDocumentOptionsMenu(null);
      let url: string | null = null;

      if (targetDoc.id === id) {
        url = pdfUrl;
      } else {
        try {
          url = await documentsService.getPdfPreviewUrl(targetDoc.id);
        } catch {
          const docClient = clientsMap.get(targetDoc.clientId);
          if (docClient) {
            url = getDocumentPdfLocalObjectUrl(targetDoc, docClient, billingSettings);
          }
        }
      }

      if (!url) {
        alert('No hay vista previa del PDF disponible para imprimir.');
        return;
      }

      try {
        await printPdfFromPreviewUrl(url);
      } catch {
        alert('No se pudo imprimir el documento.');
      }
    },
    [billingSettings, clientsMap, id, pdfUrl],
  );

  const executeDelete = useCallback(
    async (targetDoc: Document) => {
      if (deleting) return;
      setDeleting(true);
      try {
        await documentsService.delete(targetDoc.id);
        setDeleteConfirmDoc(null);
        if (targetDoc.id === id) {
          navigate(returnPath);
        } else {
          await refreshDocumentList();
        }
      } catch {
        alert('No se pudo eliminar el documento.');
      } finally {
        setDeleting(false);
      }
    },
    [deleting, id, navigate, refreshDocumentList, returnPath],
  );

  const openDocumentOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDocumentOptionsMenu({ x: rect.right, y: rect.bottom + 4 });
  };

  const buildDocumentOptionsItems = useCallback(
    (targetDoc: Document): ContextMenuItem[] => {
      const isTargetPlatformGenerated = targetDoc.pdfSource !== 'uploaded';

      const items: ContextMenuItem[] = [
        {
          id: 'print',
          label: 'Imprimir',
          icon: <Printer size={16} />,
          disabled: targetDoc.id === id && !pdfUrl,
          onSelect: () => void handlePrint(targetDoc),
        },
        {
          id: 'download-pdf',
          label: 'Descargar PDF',
          icon: <ArrowDownToLine size={16} />,
          onSelect: () => void handleDownloadPdf(targetDoc),
        },
      ];

      if (isFinancialDocumentType(targetDoc.type)) {
        items.push({
          id: 'download-xml',
          label: 'Descargar XML',
          icon: <FileCode size={16} />,
          onSelect: () => void handleDownloadXml(targetDoc),
        });
      }

      items.push({
        id: 'email',
        label: 'Enviar por correo',
        icon: <Mail size={16} />,
        onSelect: () => openEmailCompose(targetDoc),
      });

      if (isAdmin && isTargetPlatformGenerated) {
        items.push({
          id: 'edit',
          label: 'Editar',
          icon: <Pencil size={16} />,
          disabled: isVerifactuLocked(targetDoc),
          onSelect: () => {
            setDocumentOptionsMenu(null);
            setEditModalDoc(targetDoc);
            setShowEditModal(true);
          },
        });
      }

      if (isAdmin) {
        items.push({
          id: 'delete',
          label: 'Eliminar',
          icon: <CircleMinus size={16} />,
          danger: true,
          onSelect: () => {
            setDocumentOptionsMenu(null);
            setDeleteConfirmDoc(targetDoc);
          },
        });
      }

      return items;
    },
    [
      handleDownloadPdf,
      handleDownloadXml,
      openEmailCompose,
      handlePrint,
      id,
      isAdmin,
      pdfUrl,
    ],
  );

  const documentOptionsItems = useMemo(
    () => (document ? buildDocumentOptionsItems(document) : []),
    [buildDocumentOptionsItems, document],
  );

  const deleteConfirmMessage = deleteConfirmDoc
    ? `¿Eliminar ${DOCUMENT_TYPE_LABELS[deleteConfirmDoc.type].toLowerCase()} ${deleteConfirmDoc.number}? Esta acción no se puede deshacer.`
    : '';

  const sidebar = (
    <SecondarySidebarPortal>
      <DocumentsListSidebar
        documents={allDocuments}
        clientsMap={clientsMap}
        activeDocumentId={id}
        searchTerm={listSearchTerm}
        onSearchChange={setListSearchTerm}
        collapsed={secondaryNavCollapsed}
        onToggleCollapsed={toggleSecondaryNav}
        onSelectDocument={handleSelectDocument}
        getDocumentOptionsItems={buildDocumentOptionsItems}
        loading={listLoading}
        billingSettings={billingSettings}
      />
    </SecondarySidebarPortal>
  );

  if (loading) {
    return (
      <div className={styles.documentsDetailPage}>
        {sidebar}
        <ContentLoading className={styles.documentsDetailLoading} />
      </div>
    );
  }

  if (!document || !client) {
    return (
      <div className={styles.documentsDetailPage}>
        {sidebar}
        <div className={styles.documentsDetailContent}>
          <div className={styles.notFound}>
            <p className={ui.textMuted}>Documento no encontrado</p>
            <Link to={returnPath} className={ui.link} style={{ marginTop: '1rem', display: 'inline-block' }}>
              ← Volver
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const linkedActivityLink =
    linkedActivity && linkedActivityLabel ? (
      <Link
        to={activityDetailPath(linkedActivity.id)}
        state={navigationStateForReturn(location.pathname)}
        className={styles.activityMetaLink}
        title={linkedActivityLabel}
      >
        {linkedActivityLabel}
      </Link>
    ) : null;

  const activityLinkBtn = !linkedActivity ? (
    <button
      type="button"
      onClick={openActivityLinkMenu}
      className={cx(ui.toolbarBtnPrimary, styles.activityLinkBtn)}
      title="Vincular o crear actividad"
      aria-label="Vincular o crear actividad"
      aria-haspopup="menu"
      aria-expanded={activityLinkMenu !== null}
    >
      <Plus size={14} strokeWidth={2} aria-hidden />
      <span className={ui.toolbarBtnLabel}>Actividad</span>
    </button>
  ) : null;

  const verifactuStatus = document
    ? resolveVerifactuStatus(document, billingSettings)
    : null;
  const showVerifactuApprove =
    isAdmin &&
    document?.type === 'invoice' &&
    canSubmitVerifactu(document, billingSettings);
  const fiscalApproveTitle =
    billingSettings?.verifactuEnvironment === 'production'
      ? 'Aprobar registro fiscal'
      : 'Aprobar registro fiscal (sandbox)';

  const headerMetaAside = (
    <div className={styles.pageHeaderMetaAside}>
      {verifactuStatus ? (
        <VerifactuStatusBadge status={verifactuStatus} className={styles.pageHeaderStatus} />
      ) : null}
      {isAdmin ? (
        <DocumentStatusBadge
          as="button"
          status={document.status}
          className={cx(headerStyles.headerStatusBtn, styles.pageHeaderStatus)}
          onClick={openStatusMenu}
          title="Cambiar estado"
          aria-label={`Estado: ${DOCUMENT_STATUS_LABELS[document.status]}. Clic para cambiar.`}
          aria-haspopup="menu"
          aria-expanded={statusMenu !== null}
        />
      ) : (
        <DocumentStatusBadge
          status={document.status}
          className={cx(headerStyles.headerStatus, styles.pageHeaderStatus)}
        />
      )}
      <div className={cx(ui.toolbarBtnGroup, styles.pageHeaderMetaActions)}>
        {showVerifactuApprove ? (
          <button
            type="button"
            onClick={() => setShowVerifactuModal(true)}
            className={cx(ui.toolbarBtnPrimary, ui.pageHeaderBtn)}
            title={fiscalApproveTitle}
            aria-label={`${fiscalApproveTitle}. Facturacion electronica, no aprobacion comercial del documento.`}
          >
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden />
            <span className={ui.toolbarBtnLabel}>Aprobar registro fiscal</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={openDocumentOptionsMenu}
          className={cx(ui.toolbarIconBtn, ui.pageHeaderBtn, ui.pageHeaderBtnIcon)}
          aria-label="Opciones del documento"
          title="Opciones"
          aria-haspopup="menu"
          aria-expanded={documentOptionsMenu !== null}
        >
          <MoreVertical size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.documentsDetailPage}>
      {sidebar}
      <div className={styles.documentsDetailContent}>
        <div className={styles.pageHeaderRow}>
          <div className={cx(ui.pageTitleRow, styles.pageHeaderOuter)}>
            <SidebarToggle />
            <div className={styles.pageHeaderMain}>
              <div className={cx(ui.pageTitleRow, styles.pageHeaderTitleRow)}>
                <button type="button" onClick={handleBack} className={ui.pageBackBtn} aria-label="Volver">
                  <ArrowLeft size={20} />
                </button>
                {secondaryNavCollapsed ? (
                  <SecondaryNavToggle
                    expanded={false}
                    onToggle={toggleSecondaryNav}
                    controlsId="documents-list-sidebar"
                    className={cx(headerStyles.headerSecondaryNavToggle, styles.secondaryNavExpandBtn)}
                  />
                ) : null}
                <h1 className={cx(ui.pageTitle, styles.pageHeaderTitle)}>{documentTitle}</h1>
                {activityLinkBtn}
                {linkedActivityLink ? headerMetaAside : null}
              </div>
              <div className={styles.pageHeaderMetaRow}>
                {linkedActivityLink || headerMeta?.label ? (
                  <div className={cx(styles.pageHeaderMetaMain, styles.pageHeaderMetaMainContent)}>
                    <p className={cx(ui.pageSubtitle, headerStyles.headerMeta, styles.pageHeaderMetaLine)}>
                      {linkedActivityLink}
                      {linkedActivityLink && headerMeta?.label ? (
                        <span className={headerStyles.headerMetaSep} aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {headerMeta?.label ? (
                        <span className={headerStyles.headerTitleRelative}>{headerMeta.label}</span>
                      ) : null}
                      {headerMeta?.label && headerMeta.relative ? (
                        <span className={headerStyles.headerMetaSep} aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {headerMeta?.relative ? (
                        <span className={headerStyles.headerTitleRelative}>
                          {headerMeta.relative.charAt(0).toUpperCase() + headerMeta.relative.slice(1)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                ) : (
                  <span className={styles.pageHeaderMetaMain} aria-hidden />
                )}
                {!linkedActivityLink ? headerMetaAside : null}
              </div>
            </div>
          </div>
        </div>
        {verifactuStatus === 'aceptado' || verifactuStatus === 'rechazado' ? (
          <VerifactuDocumentMetaPanel document={document} billingSettings={billingSettings} />
        ) : null}
        <div className={styles.documentsDetailInner}>
          {pdfUrl ? (
            <PdfViewer
              className={styles.pdfFrame}
              src={pdfUrl}
              fileName={`${document.number}.pdf`}
              title="Vista previa del documento"
            />
          ) : pdfError ? (
            <div className={cx(styles.pdfError, ui.card)}>
              <p className={ui.textMuted}>No se pudo cargar la vista previa del PDF.</p>
            </div>
          ) : (
            <p className={ui.textMuted}>Cargando PDF...</p>
          )}
        </div>
      </div>

      {showActivityModal && activityModalContext && (
        <ActivityFormModal
          eventToEdit={null}
          initialDate={activityModalContext.date}
          initialClientId={activityModalContext.clientId}
          initialLinkedDocumentIds={document ? [document.id] : []}
          directForm
          onClose={() => {
            setShowActivityModal(false);
            setActivityModalContext(null);
          }}
          onSaved={handleActivitySaved}
        />
      )}

      {showEditModal && editModalDoc && (
        <DocumentFormModal
          open
          onClose={() => {
            setShowEditModal(false);
            setEditModalDoc(null);
            setDocumentFormActivityId('');
          }}
          onSaved={handleDocumentSaved}
          clients={clients}
          activities={activities}
          editingDoc={editModalDoc}
          externalActivityId={documentFormActivityId}
          onRequestActivity={({ clientId, date }) => {
            setActivityModalContext({ clientId, date });
            setShowActivityModal(true);
          }}
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
            selected: document.status === status,
            disabled: document.status === status,
            onSelect: () => void handleStatusChange(status),
          }))}
        />
      )}

      {documentOptionsMenu && (
        <ContextMenu
          x={documentOptionsMenu.x}
          y={documentOptionsMenu.y}
          anchorX="end"
          ariaLabel="Opciones del documento"
          onClose={() => setDocumentOptionsMenu(null)}
          items={documentOptionsItems}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmDoc !== null}
        title="Eliminar documento"
        message={deleteConfirmMessage}
        loading={deleting}
        onConfirm={() => {
          if (deleteConfirmDoc) void executeDelete(deleteConfirmDoc);
        }}
        onCancel={() => {
          if (!deleting) setDeleteConfirmDoc(null);
        }}
      />

      {showVerifactuModal && document && client && billingSettings ? (
        <VerifactuApproveModal
          open
          document={document}
          client={client}
          billingSettings={billingSettings}
          onClose={() => setShowVerifactuModal(false)}
          onSubmitted={(updated) => void handleVerifactuSubmitted(updated)}
        />
      ) : null}

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
    </div>
  );
}
