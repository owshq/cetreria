import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useNavigate, Link, useLocation, Navigate } from 'react-router';
import { ArrowLeft, Pencil, CircleMinus, FileText, Mail, Phone, MapPin, Info, X, Globe, Search, Plus, FileDown, CalendarDays, MoreVertical, Copy, Check } from 'lucide-react';
import {
  clientsService,
  activitiesService,
  documentsService,
  clientGroupsService,
  authService,
  eventsService,
  usersService,
} from '@/api';
import type { Activity, CalendarEvent, Client, ClientGroup, Document, UserAssignee } from '@shared/types';
import {
  DOCUMENT_TYPE_LABELS,
  formatDocumentAmount,
  formatPeriodDisplayLabel,
  getActivityTypeLabel,
  isDateInRange,
  canDeleteClientObservation,
  compareClientCreatedAtDesc,
  compareDateStringsAsc,
  compareDateStringsDesc,
  formatClientCreatedAtLong,
  formatDateSafe,
  parseDateSafe,
  resolveClientCreatedAtPrecision,
  getClientWebsiteHref,
  getClientWebsiteLabel,
  clientCreatedAtToFormValues,
  customFieldsToEntries,
  entriesToCustomFields,
  normalizeClientAssignedUserIds,
} from '@shared/types';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { ActivityGroupBy, ActivityValueMeasure } from '@/components/clientCharts/utils';
import { cx } from '@/lib/cx';
import { getClientActivityOperatorIds } from '@/lib/clientOperatorFilter';
import { Textarea, SearchField } from '@/components/forms';
import ClientFormSections, { type ClientFormData } from '@/components/ClientFormSections';
import ClientLogo from '@/components/ClientLogo';
import ui from '@/styles/shared.module.css';
import SidebarToggle from '@/components/SidebarToggle';
import ContentLoading from '@/components/ContentLoading';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import RecentActivitiesSection from '@/components/RecentActivitiesSection';
import ActivityFormModal from '@/components/ActivityFormModal';
import DocumentFormModal from '@/components/DocumentFormModal';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import StatusDot from '@/components/StatusDot';
import DatePeriodFilters from '@/components/DatePeriodFilters';
import PeriodMetricsChartSection, {
  type PeriodMetricButtonConfig,
} from '@/components/PeriodMetricsChartSection';
import periodMetricsStyles from '@/components/PeriodMetricsChartSection.module.css';
import InvoiceConceptsSection from '@/components/InvoiceConceptsSection';
import {
  CLIENT_STATUS_DOT,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUSES,
} from '@/lib/clientStatus';
import {
  DOCUMENT_STATUS_LABELS,
} from '@/lib/documentStatus';
import headerStyles from '@/components/DetailPageHeader.module.css';
import { useCloseAllPopups, usePopupEscape } from '@/context/PopupStackContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useActivityModal } from '@/context/ActivityModalContext';
import ModalHeader from '@/components/ModalHeader';
import ModalOverlay from '@/components/ModalOverlay';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import { useDatePeriodFilter } from '@/hooks/useDatePeriodFilter';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown';
import { computeClientPeriodStats } from '@/lib/clientPeriodStats';
import {
  buildDocumentsPeriodMetric,
  buildWorkPeriodMetric,
} from '@/lib/periodMetricTiles';
import {
  dashboardMetricForDimension,
  type DashboardMetricKey,
  type MetricDimension,
} from '@/lib/metricChartConfig';
import { storageKeys } from '@/lib/storageKeys';
import { readWorkspaceScopedStorage, writeWorkspaceScopedStorage } from '@/lib/workspaceStorage';
import { getReturnPath } from '@/lib/navigation';
import { navigationStateForReturn } from '@/lib/navigation';
import dashboardStyles from './Dashboard.module.css';
import styles from './ClientDetail.module.css';

function getInitials(name: string | undefined | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

function DetailFieldRow({
  icon,
  label,
  copyText,
  children,
}: {
  icon: ReactNode;
  label: string;
  copyText?: string | null;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const textToCopy = copyText?.trim() ?? '';
  const canCopy = textToCopy.length > 0 && textToCopy !== '—';

  const handleCopy = useCallback(async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }, [canCopy, textToCopy]);

  return (
    <div className={styles.detailRow}>
      <span className={styles.detailIcon} aria-hidden>{icon}</span>
      <div className={styles.detailContent}>
        <div className={styles.detailLabel}>{label}</div>
        <div className={styles.detailValueRow}>
          <div className={styles.detailValue}>{children}</div>
          {canCopy && (
            <button
              type="button"
              className={styles.detailCopyBtn}
              onClick={() => void handleCopy()}
              aria-label={copied ? 'Copiado' : `Copiar ${label}`}
              title={copied ? 'Copiado' : 'Copiar'}
            >
              {copied ? (
                <Check size={14} strokeWidth={1.75} aria-hidden />
              ) : (
                <Copy size={14} strokeWidth={1.75} aria-hidden />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const CLIENT_PERIOD_METRIC_IDS = ['documents', 'work'] as const;
type ClientPeriodMetricId = (typeof CLIENT_PERIOD_METRIC_IDS)[number];

type ClientChartsPanelPrefs = {
  expanded: boolean;
  metricId: ClientPeriodMetricId;
};

function normalizeClientPeriodMetricId(value: unknown): ClientPeriodMetricId {
  if (value === 'paid' || value === 'pending') return 'documents';
  if (value === 'activities' || value === 'hours') return 'work';
  if (
    typeof value === 'string' &&
    CLIENT_PERIOD_METRIC_IDS.includes(value as ClientPeriodMetricId)
  ) {
    return value as ClientPeriodMetricId;
  }
  return 'documents';
}

function readClientChartsPanelPrefs(): ClientChartsPanelPrefs {
  try {
    const raw = readWorkspaceScopedStorage(storageKeys.clientDetailChartsPanel);
    if (!raw) return { expanded: false, metricId: 'documents' };

    const data = JSON.parse(raw) as Partial<ClientChartsPanelPrefs>;
    return {
      expanded: data.expanded === true,
      metricId: normalizeClientPeriodMetricId(data.metricId),
    };
  } catch {
    return { expanded: false, metricId: 'documents' };
  }
}

function writeClientChartsPanelPrefs(prefs: ClientChartsPanelPrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), storageKeys.clientDetailChartsPanel);
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnPath = getReturnPath(location.state);
  const hasCustomReturn =
    location.state &&
    typeof location.state === 'object' &&
    'returnTo' in location.state;

  const handleBack = () => {
    if (hasCustomReturn) {
      navigate(-1);
      return;
    }
    navigate('/clients');
  };
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const [client, setClient] = useState<Client | null>(null);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const { activityTypes } = useActivityTypes();
  const { notifyActivitySaved } = useActivityModal();
  const closeAllPopups = useCloseAllPopups();
  const [isEditing, setIsEditing] = useState(false);
  const [newObservation, setNewObservation] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMenu, setStatusMenu] = useState<{ x: number; y: number } | null>(null);
  const [documentSearchTerm, setDocumentSearchTerm] = useState('');
  const [documentSearchOpen, setDocumentSearchOpen] = useState(false);
  const [headerActionsMenu, setHeaderActionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [toolbarOptionsMenu, setToolbarOptionsMenu] = useState<{ x: number; y: number } | null>(null);
  const [showNewActivityModal, setShowNewActivityModal] = useState(false);
  const [showNewDocumentModal, setShowNewDocumentModal] = useState(false);
  const [documentFormActivityId, setDocumentFormActivityId] = useState('');
  const [activityModalContext, setActivityModalContext] = useState<{ clientId: string; date: string } | null>(null);
  const documentSearchInputRef = useRef<HTMLInputElement>(null);
  const {
    period,
    setPeriod,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    dateRange,
    periodFiltersRef,
    invalidCustomRange,
  } = useDatePeriodFilter();
  const savedChartsPrefs = useMemo(() => readClientChartsPanelPrefs(), []);
  const [chartsExpanded, setChartsExpanded] = useState(savedChartsPrefs.expanded);
  const [selectedPeriodMetricId, setSelectedPeriodMetricId] = useState<ClientPeriodMetricId | null>(
    savedChartsPrefs.expanded ? savedChartsPrefs.metricId : null,
  );
  const [conceptsChartExpanded, setConceptsChartExpanded] = useState(false);
  const [activitiesChartExpanded, setActivitiesChartExpanded] = useState(false);
  const [activitiesChartGroupBy, setActivitiesChartGroupBy] = useState<ActivityGroupBy>('type');
  const [activitiesChartValueMeasure, setActivitiesChartValueMeasure] =
    useState<ActivityValueMeasure>('hours');
  const isMobile = !useMediaQuery('(min-width: 768px)');
  const [pageRef, navMobileHidden] = useHideOnScrollDown(isMobile && !loading && !isEditing);

  const metricComparison = { period, from: dateRange.from, to: dateRange.to };

  useEffect(() => {
    writeClientChartsPanelPrefs({
      expanded: chartsExpanded,
      metricId: selectedPeriodMetricId ?? 'documents',
    });
  }, [chartsExpanded, selectedPeriodMetricId]);

  const handlePeriodMetricSelect = (metricId: string, _chartMetric: DashboardMetricKey) => {
    const nextId = metricId as ClientPeriodMetricId;
    if (chartsExpanded && selectedPeriodMetricId === nextId) {
      setChartsExpanded(false);
      setSelectedPeriodMetricId(null);
      return;
    }

    setSelectedPeriodMetricId(nextId);
    setChartsExpanded(true);
  };

  const handleChartDimensionChange = (dimension: MetricDimension) => {
    const alignedMetric = dashboardMetricForDimension(dimension);
    if (alignedMetric === 'documents') {
      setSelectedPeriodMetricId('documents');
    } else if (
      dimension === 'activity' ||
      dimension === 'team' ||
      dimension === 'time' ||
      alignedMetric === 'activities' ||
      alignedMetric === 'hours'
    ) {
      setSelectedPeriodMetricId('work');
    }
  };

  const handleChartsToggle = () => {
    if (chartsExpanded) {
      setChartsExpanded(false);
      setSelectedPeriodMetricId(null);
      return;
    }

    setChartsExpanded(true);
    setSelectedPeriodMetricId('documents');
  };

  const handleConceptsChartToggle = () => {
    setConceptsChartExpanded((expanded) => !expanded);
  };

  const handleActivitiesChartToggle = () => {
    setActivitiesChartExpanded((expanded) => !expanded);
  };

  const [formData, setFormData] = useState<ClientFormData>(() => {
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
      groupId: '',
      createdAt,
      createdAtPrecision,
      customFieldEntries: [],
      assignedUserIds: [],
    };
  });

  useEffect(() => {
    if (!isAdmin) {
      setAssignees([]);
      return;
    }

    let cancelled = false;
    void usersService.getAssignees()
      .then((nextAssignees) => {
        if (!cancelled) setAssignees(nextAssignees);
      })
      .catch(() => {
        if (!cancelled) setAssignees([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (id === 'new') {
      navigate('/clients?new=1', { replace: true });
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!id || id === 'new') return;

    void (async () => {
      const [clientData, activityData, documentData, groupData, eventData] = await Promise.all([
        clientsService.getById(id),
        activitiesService.getByClientId(id),
        documentsService.getByClientId(id),
        isAdmin ? clientGroupsService.getAll() : Promise.resolve([] as ClientGroup[]),
        eventsService.getAll(),
      ]);

      if (clientData) {
        setClient(clientData);
        const { createdAt, createdAtPrecision } = clientCreatedAtToFormValues(clientData);
        setFormData({
          name: clientData.name,
          email: clientData.email,
          phone: clientData.phone,
          address: clientData.address,
          city: clientData.city ?? '',
          postalCode: clientData.postalCode ?? '',
          country: clientData.country ?? '',
          state: clientData.state ?? '',
          website: clientData.website ?? '',
          technicalInfo: clientData.technicalInfo,
          status: clientData.status,
          groupId: clientData.groupId,
          createdAt,
          createdAtPrecision,
          customFieldEntries: customFieldsToEntries(clientData.customFields),
          assignedUserIds: normalizeClientAssignedUserIds(clientData.assignedUserIds),
        });
      }
      setGroups(groupData);
      setActivities(activityData);
      setDocuments(documentData);
      setEvents(eventData);
      setLoading(false);
    })();
  }, [id, isAdmin, location.key]);

  const filteredActivities = useMemo(() => {
    if (invalidCustomRange) return [];
    return activities.filter((activity) =>
      isDateInRange(activity.date, dateRange.from, dateRange.to),
    );
  }, [activities, dateRange.from, dateRange.to, invalidCustomRange]);

  const clientAccessViaScheduleUserIds = useMemo(() => {
    if (!client) return [];
    return getClientActivityOperatorIds(client.id, activities, events);
  }, [client, activities, events]);

  const filteredDocuments = useMemo(() => {
    if (invalidCustomRange) return [];
    return documents.filter((document) =>
      isDateInRange(document.date, dateRange.from, dateRange.to),
    );
  }, [documents, dateRange.from, dateRange.to, invalidCustomRange]);

  const periodHours = filteredActivities.reduce((sum, activity) => sum + activity.hours, 0);

  const clientPeriodStats = useMemo(() => {
    if (!id || id === 'new' || invalidCustomRange) return null;
    return computeClientPeriodStats(
      activities,
      documents,
      id,
      dateRange.from,
      dateRange.to,
    );
  }, [
    activities,
    documents,
    id,
    dateRange.from,
    dateRange.to,
    invalidCustomRange,
  ]);

  const chartClients = useMemo(() => (client ? [client] : []), [client]);

  const clientPeriodMetrics = useMemo((): PeriodMetricButtonConfig[] => {
    if (!clientPeriodStats) return [];

    const documentsMetric = buildDocumentsPeriodMetric(
      {
        ...clientPeriodStats,
        sentAmount: clientPeriodStats.sentAmount,
      },
      metricComparison,
    );
    const workMetric = buildWorkPeriodMetric(
      {
        activityCount: clientPeriodStats.activityCount,
        activitiesChangePercent: clientPeriodStats.activitiesChangePercent,
        periodHours: clientPeriodStats.periodHours,
        hoursChangePercent: clientPeriodStats.hoursChangePercent,
        avgHoursPerActivity: clientPeriodStats.avgHoursPerActivity,
        avgRevenuePerHour: clientPeriodStats.avgRevenuePerHour,
      },
      metricComparison,
    );

    return [
      { ...documentsMetric, chartPresets: undefined },
      { ...workMetric, chartPresets: undefined },
    ];
  }, [clientPeriodStats, metricComparison]);

  const sortedFilteredDocuments = useMemo(
    () => [...filteredDocuments].sort((a, b) => compareDateStringsDesc(a.date, b.date)),
    [filteredDocuments],
  );

  const searchedDocuments = useMemo(() => {
    const term = documentSearchTerm.toLowerCase().trim();
    if (!term) return sortedFilteredDocuments;

    const tokens = term.split(/\s+/).filter(Boolean);
    return sortedFilteredDocuments.filter((doc) => {
      const haystack = `${DOCUMENT_TYPE_LABELS[doc.type]} ${doc.number} ${DOCUMENT_STATUS_LABELS[doc.status]} ${doc.total.toFixed(2)}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [sortedFilteredDocuments, documentSearchTerm]);

  const canSearchDocuments = sortedFilteredDocuments.length > 0 && !invalidCustomRange;
  const showDocumentSearchField = canSearchDocuments && documentSearchOpen;

  useEffect(() => {
    if (!documentSearchOpen) return;
    documentSearchInputRef.current?.focus();
  }, [documentSearchOpen]);

  useEffect(() => {
    if (canSearchDocuments) return;
    setDocumentSearchOpen(false);
    setDocumentSearchTerm('');
  }, [canSearchDocuments]);

  const resetEditFormFromClient = useCallback((source: Client) => {
    const { createdAt, createdAtPrecision } = clientCreatedAtToFormValues(source);
    setFormData({
      name: source.name,
      logoUrl: source.logoUrl ?? '',
      email: source.email,
      phone: source.phone,
      address: source.address,
      city: source.city ?? '',
      postalCode: source.postalCode ?? '',
      country: source.country ?? '',
      state: source.state ?? '',
      website: source.website ?? '',
      technicalInfo: source.technicalInfo,
      status: source.status,
      groupId: source.groupId,
      createdAt,
      createdAtPrecision,
      customFieldEntries: customFieldsToEntries(source.customFields),
      assignedUserIds: normalizeClientAssignedUserIds(source.assignedUserIds),
    });
  }, []);

  const closeEdit = useCallback(() => {
    if (client) resetEditFormFromClient(client);
    setIsEditing(false);
  }, [client, resetEditFormFromClient]);

  usePopupEscape(isEditing && isAdmin, closeEdit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !id) return;

    const { customFieldEntries, logoUrl, assignedUserIds, ...clientPayload } = formData;
    const updated = await clientsService.update(id, {
      ...clientPayload,
      logoUrl: logoUrl || undefined,
      customFields: entriesToCustomFields(customFieldEntries),
      assignedUserIds: normalizeClientAssignedUserIds(assignedUserIds),
    });
    setClient(updated);
    closeAllPopups();
    setIsEditing(false);
  };

  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newObservation.trim();
    if (!id || !text || savingObservation) return;

    setSavingObservation(true);
    try {
      const updated = await clientsService.addObservation(id, text);
      setClient(updated);
      setNewObservation('');
      setThreadOpen(true);
    } finally {
      setSavingObservation(false);
    }
  };

  const handleDeleteObservation = async (observationId: string) => {
    if (!id || !confirm('¿Eliminar esta observación?')) return;

    const updated = await clientsService.deleteObservation(id, observationId);
    setClient(updated);
  };

  const handleDeleteAllObservations = async () => {
    if (!id || !confirm('¿Eliminar todas las observaciones de este contacto?')) return;

    const updated = await clientsService.deleteAllObservations(id);
    setClient(updated);
  };

  const handleDelete = () => {
    if (!isAdmin || !id || id === 'new') return;
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await clientsService.delete(id);
      navigate(returnPath);
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenDocument = (doc: Document) => {
    navigate(`/docs/${doc.id}`, {
      state: navigationStateForReturn(`${location.pathname}${location.search}`),
    });
  };

  const handleStatusChange = async (status: Client['status']) => {
    if (!client || !id || !isAdmin || client.status === status) return;
    const updated = await clientsService.update(id, { status });
    setClient(updated);
    setStatusMenu(null);
  };

  const openStatusMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setStatusMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const openHeaderActionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setToolbarOptionsMenu(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setHeaderActionsMenu({ x: rect.right, y: rect.bottom + 4 });
  };

  const openToolbarOptionsMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHeaderActionsMenu(null);
    setToolbarOptionsMenu({ x: rect.left + rect.width / 2, y: rect.bottom + 4 });
  };

  const handleNewActivitySaved = async (activity?: Activity) => {
    if (activityModalContext) {
      setShowNewActivityModal(false);
      setActivityModalContext(null);
      if (activity?.id) {
        setDocumentFormActivityId(activity.id);
      }
    } else {
      setShowNewActivityModal(false);
    }

    if (!id) return;
    const [activityData, documentData] = await Promise.all([
      activitiesService.getByClientId(id),
      documentsService.getByClientId(id),
    ]);
    setActivities(activityData);
    setDocuments(documentData);
    await notifyActivitySaved();
  };

  const handleNewDocumentSaved = async () => {
    setShowNewDocumentModal(false);
    setDocumentFormActivityId('');
    if (!id) return;
    const documentData = await documentsService.getByClientId(id);
    setDocuments(documentData);
  };

  const handleDownloadReport = () => {
    if (!client || invalidCustomRange) return;

    const periodLabel = formatPeriodDisplayLabel(period, dateRange.from, dateRange.to);
    let content = `REPORTE DE CLIENTE - ${periodLabel.toUpperCase()}\n`;
    content += '='.repeat(80) + '\n\n';
    content += `CLIENTE: ${client.name}\n`;
    content += `Dirección: ${client.address}\n`;
    content += `Contacto: ${client.email} | ${client.phone}\n`;
    content += '-'.repeat(80) + '\n\n';
    content += `FECHA${' '.repeat(10)}TIPO${' '.repeat(20)}HORAS${' '.repeat(5)}DESCRIPCIÓN\n`;
    content += '-'.repeat(80) + '\n';

    [...filteredActivities]
      .sort((a, b) => compareDateStringsAsc(a.date, b.date))
      .forEach((activity) => {
        const dateStr = formatDateSafe(activity.date, 'dd/MM/yyyy');
        const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
        content += `${dateStr.padEnd(15)}${typeLabel.padEnd(25)}${activity.hours.toString().padEnd(10)}${activity.description}\n`;
      });

    content += '-'.repeat(80) + '\n';
    content += `${' '.repeat(40)}TOTAL HORAS: ${periodHours}h\n`;
    content += `${' '.repeat(40)}DOCUMENTOS: ${filteredDocuments.length}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporte_${client.name.replace(/\s+/g, '_')}_${dateRange.from}_${dateRange.to}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <ContentLoading className={ui.page} />;
  }

  if (!client) {
    return (
      <div className={ui.page}>
        <div className={styles.notFound}>
          <p className={ui.textMuted}>Contacto no encontrado</p>
          <Link to={returnPath} className={ui.link} style={{ marginTop: '1rem', display: 'inline-block' }}>
            ← Volver
          </Link>
        </div>
      </div>
    );
  }

  const statusClass: Record<Client['status'], string> = {
    active: ui.badgeActive,
    inactive: ui.badgeInactive,
    potential: ui.badgePotential,
  };

  const observations = client.observations ?? [];
  const sortedObservations = [...observations].sort((a, b) =>
    compareDateStringsDesc(a.createdAt, b.createdAt),
  );
  const latestObservation = sortedObservations[0];
  const showThread = threadOpen || observations.length === 0;
  const typeLabels = DOCUMENT_TYPE_LABELS;
  const websiteHref = getClientWebsiteHref(client.website ?? '');

  const headerActionItems: ContextMenuItem[] = [
    {
      id: 'activity',
      label: 'Nueva actividad',
      icon: <CalendarDays size={16} />,
      onSelect: () => {
        setHeaderActionsMenu(null);
        setActivityModalContext(null);
        setShowNewActivityModal(true);
      },
    },
    ...(isAdmin
      ? [
          {
            id: 'document',
            label: 'Nuevo documento',
            icon: <FileText size={16} />,
            onSelect: () => {
              setHeaderActionsMenu(null);
              setDocumentFormActivityId('');
              setShowNewDocumentModal(true);
            },
          } satisfies ContextMenuItem,
        ]
      : []),
  ];

  const toolbarOptionsItems: ContextMenuItem[] = [
    {
      id: 'report',
      label: 'Generar reporte',
      icon: <FileDown size={16} />,
      disabled: invalidCustomRange,
      onSelect: () => {
        setToolbarOptionsMenu(null);
        handleDownloadReport();
      },
    },
    ...(isAdmin
      ? [
          {
            id: 'delete',
            label: 'Eliminar contacto',
            icon: <CircleMinus size={16} />,
            danger: true,
            onSelect: () => {
              setToolbarOptionsMenu(null);
              handleDelete();
            },
          } satisfies ContextMenuItem,
        ]
      : []),
  ];

  return (
    <Fragment>
      <div className={styles.pageHeaderRow}>
        <div className={cx(ui.pageTitleRow, styles.pageHeaderOuter)}>
          <SidebarToggle />
          <div className={styles.pageHeaderMain}>
            <div className={cx(ui.pageTitleRow, styles.pageHeaderTitleRow)}>
              <button type="button" onClick={handleBack} className={ui.pageBackBtn} aria-label="Volver">
                <ArrowLeft size={20} />
              </button>
              {client?.logoUrl && <ClientLogo logoUrl={client.logoUrl} size="md" />}
              <h1 className={cx(ui.pageTitle, styles.pageHeaderTitle)}>{client?.name}</h1>
              {isAdmin ? (
                <button
                  type="button"
                  className={cx(
                    statusClass[client.status],
                    ui.statusWithDot,
                    ui.statusBadge,
                    ui.statusBadgeBtn,
                    headerStyles.headerStatusBtn,
                    styles.pageHeaderStatus,
                  )}
                  onClick={openStatusMenu}
                  title="Cambiar estado"
                  aria-label={`Estado: ${CLIENT_STATUS_LABELS[client.status]}. Clic para cambiar.`}
                  aria-haspopup="menu"
                  aria-expanded={statusMenu !== null}
                >
                  <StatusDot color={CLIENT_STATUS_DOT[client.status]} />
                  {CLIENT_STATUS_LABELS[client.status]}
                </button>
              ) : (
                <span
                  className={cx(
                    statusClass[client.status],
                    ui.statusWithDot,
                    headerStyles.headerStatus,
                    styles.pageHeaderStatus,
                  )}
                >
                  <StatusDot color={CLIENT_STATUS_DOT[client.status]} />
                  {CLIENT_STATUS_LABELS[client.status]}
                </span>
              )}
              {!isEditing && id !== 'new' && (
                <div className={cx(ui.toolbarBtnGroup, styles.pageHeaderActions)}>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className={cx(ui.toolbarIconBtn, ui.pageHeaderBtn, ui.pageHeaderBtnIcon)}
                      aria-label="Editar contacto"
                      title="Editar"
                    >
                      <Pencil size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                  {!isMobile && (
                    <>
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
                        onClick={openHeaderActionsMenu}
                        className={ui.toolbarBtnPrimary}
                        aria-label="Nuevo"
                        title="Nuevo"
                        aria-haspopup="menu"
                        aria-expanded={headerActionsMenu !== null}
                      >
                        <Plus size={16} />
                        <span className={ui.toolbarBtnLabel}>Nuevo</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {client && (
              <p className={cx(ui.pageSubtitle, headerStyles.headerMeta)}>
                <span className={headerStyles.headerTitleRelative}>
                  Contacto desde {formatClientCreatedAtLong(client, { locale: es })}
                </span>
                {resolveClientCreatedAtPrecision(client) === 'day' && parseDateSafe(client.createdAt) && (
                  <>
                    <span className={headerStyles.headerMetaSep} aria-hidden>
                      ·
                    </span>
                    <span className={headerStyles.headerTitleRelative}>
                      {formatDistanceToNow(parseDateSafe(client.createdAt)!, {
                        addSuffix: true,
                        locale: es,
                      }).replace(/^./, (char) => char.toUpperCase())}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      <div ref={pageRef} className={styles.clientDetailPage}>
      <div className={styles.twoColGridSidebarLeft}>
        {id !== 'new' && client && (
          <div className={ui.sidebarCol}>
            <section className={cx(ui.pageSection, styles.contactSection)}>
              <div className={cx(ui.pageSectionTitleRow, styles.contactSectionHeading)}>
                <h2 className={ui.pageSectionTitle}>Información del contacto</h2>
              </div>
              <div className={ui.card}>
                <div className={styles.cardSectionBody}>
                  <div className={cx(ui.form, styles.detailForm)}>
                    <DetailFieldRow
                      icon={<Mail size={14} strokeWidth={1.75} />}
                      label="Email"
                      copyText={client.email}
                    >
                      {client.email}
                    </DetailFieldRow>
                    <DetailFieldRow
                      icon={<Phone size={14} strokeWidth={1.75} />}
                      label="Teléfono"
                      copyText={client.phone}
                    >
                      {client.phone}
                    </DetailFieldRow>
                    <DetailFieldRow
                      icon={<MapPin size={14} strokeWidth={1.75} />}
                      label="Dirección"
                      copyText={[
                        client.address,
                        [client.city, client.state, client.postalCode, client.country]
                          .filter(Boolean)
                          .join(', '),
                      ]
                        .filter(Boolean)
                        .join('\n')}
                    >
                      {client.address}
                      {[client.city, client.state, client.postalCode, client.country]
                        .filter(Boolean)
                        .length > 0 && (
                        <div className={styles.detailValueSub}>
                          {[client.city, client.state, client.postalCode, client.country]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      )}
                    </DetailFieldRow>
                    {websiteHref && (
                      <DetailFieldRow
                        icon={<Globe size={14} strokeWidth={1.75} />}
                        label="Web"
                        copyText={websiteHref}
                      >
                        <a
                          href={websiteHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ui.link}
                        >
                          {getClientWebsiteLabel(client.website)}
                        </a>
                      </DetailFieldRow>
                    )}
                    {client.technicalInfo && (
                      <DetailFieldRow
                        icon={<Info size={14} strokeWidth={1.75} />}
                        label="Información Técnica"
                        copyText={client.technicalInfo}
                      >
                        {client.technicalInfo}
                      </DetailFieldRow>
                    )}
                    {customFieldsToEntries(client.customFields).map((field) => (
                      <DetailFieldRow
                        key={field.name}
                        icon={<Info size={14} strokeWidth={1.75} />}
                        label={field.name}
                        copyText={field.value}
                      >
                        {field.value || '—'}
                      </DetailFieldRow>
                    ))}
                  </div>
                  <div className={styles.observationsSection}>
                    <div className={styles.observationsHeader}>
                      <div className={styles.detailRow}>
                        <span className={styles.detailIcon} aria-hidden><FileText size={14} strokeWidth={1.75} /></span>
                        <div className={styles.detailLabel}>
                          Observaciones
                          {observations.length > 0 && (
                            <span className={styles.observationsCount}> · {observations.length}</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && observations.length > 0 && showThread && (
                        <button
                          type="button"
                          onClick={handleDeleteAllObservations}
                          className={styles.deleteAllObservationsBtn}
                        >
                          Eliminar todas
                        </button>
                      )}
                    </div>

                    {!showThread && latestObservation ? (
                      <div className={styles.threadPreview}>
                        <div className={styles.threadComment}>
                          <div className={styles.threadAvatar} aria-hidden>
                            {getInitials(latestObservation.userName)}
                          </div>
                          <div className={styles.threadContent}>
                            <p className={styles.threadPreviewText}>
                              <span className={styles.threadAuthor}>{latestObservation.userName}</span>
                              {' '}
                              {latestObservation.text}
                            </p>
                            {parseDateSafe(latestObservation.createdAt) && (
                              <span className={styles.threadTime}>
                                {formatDistanceToNow(parseDateSafe(latestObservation.createdAt)!, {
                                  addSuffix: true,
                                  locale: es,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setThreadOpen(true)}
                          className={styles.threadToggle}
                        >
                          Ver las {observations.length} observaciones
                        </button>
                        <button
                          type="button"
                          onClick={() => setThreadOpen(true)}
                          className={styles.threadReplyHint}
                        >
                          Añadir una observación...
                        </button>
                      </div>
                    ) : (
                      <>
                        {showThread && observations.length > 0 && (
                          <div className={styles.threadPanel}>
                            <div className={styles.threadPanelHeader}>
                              <span className={styles.threadPanelTitle}>
                                {observations.length === 1 ? '1 observación' : `${observations.length} observaciones`}
                              </span>
                              <button
                                type="button"
                                onClick={() => setThreadOpen(false)}
                                className={styles.threadCloseBtn}
                                aria-label="Cerrar hilo"
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <ul className={styles.threadList}>
                              {sortedObservations.map((observation) => (
                                <li key={observation.id} className={styles.threadComment}>
                                  <div className={styles.threadAvatar} aria-hidden>
                                    {getInitials(observation.userName)}
                                  </div>
                                  <div className={styles.threadContent}>
                                    <div className={styles.threadCommentHeader}>
                                      <span className={styles.threadAuthor}>{observation.userName}</span>
                                      {parseDateSafe(observation.createdAt) && (
                                        <span className={styles.threadTime}>
                                          {formatDistanceToNow(parseDateSafe(observation.createdAt)!, {
                                            addSuffix: true,
                                            locale: es,
                                          })}
                                        </span>
                                      )}
                                    </div>
                                    <div className={styles.threadCommentBody}>
                                      <p className={styles.threadCommentText}>{observation.text}</p>
                                      {canDeleteClientObservation(currentUser, observation) && (
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteObservation(observation.id)}
                                          className={styles.deleteObservationBtn}
                                          aria-label="Eliminar observación"
                                        >
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {observations.length === 0 && (
                          <EmptyState
                            emoji="🔍"
                            title="Sin observaciones"
                            description="Todavía no hay observaciones en este contacto."
                            compact
                          />
                        )}

                        <form onSubmit={handleAddObservation} className={styles.observationForm}>
                          <div className={styles.threadCompose}>
                            <div className={styles.threadAvatar} aria-hidden>
                              {getInitials(currentUser?.name ?? '?')}
                            </div>
                            <div className={styles.threadComposeFields}>
                              <Textarea
                                value={newObservation}
                                onChange={(e) => setNewObservation(e.target.value)}
                                className={styles.threadInput}
                                rows={2}
                                placeholder="Escribe una observación..."
                              />
                              <button
                                type="submit"
                                className={styles.threadSubmitBtn}
                                disabled={!newObservation.trim() || savingObservation}
                              >
                                {savingObservation ? 'Publicando...' : 'Publicar'}
                              </button>
                            </div>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
        <div className={ui.twoColMain}>
          {id !== 'new' && (
            <DatePeriodFilters
              sectionLayout
              className={styles.periodSection}
              panelClassName={cx(dashboardStyles.filtersCardAccent, styles.periodCard)}
              period={period}
              customFrom={customFrom}
              customTo={customTo}
              dateRange={dateRange}
              onPeriodChange={setPeriod}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              periodFiltersRef={periodFiltersRef}
              invalidCustomRange={invalidCustomRange}
            >
              <PeriodMetricsChartSection
                metrics={clientPeriodMetrics}
                metricsStripClassName={periodMetricsStyles.periodMetricsStrip}
                selectedMetricId={selectedPeriodMetricId}
                chartsExpanded={chartsExpanded}
                onMetricSelect={handlePeriodMetricSelect}
                onChartsToggle={handleChartsToggle}
                onChartDimensionChange={handleChartDimensionChange}
                defaultMetricId="documents"
                chartsPanelId="client-detail-charts-panel"
                activities={filteredActivities}
                events={events}
                activityTypes={activityTypes}
                clients={chartClients}
                documents={documents}
                from={dateRange.from}
                to={dateRange.to}
                invalidCustomRange={invalidCustomRange}
                hideChartViewToggle
                inlineChartControls
              />
            </DatePeriodFilters>
          )}

          {id !== 'new' && client && (
            <div className={styles.insightsRow}>
              <section className={cx(ui.pageSectionFill, dashboardStyles.dashboardHoverSection)}>
                <RecentActivitiesSection
                  activities={filteredActivities}
                  events={events}
                  clients={[client]}
                  documents={filteredDocuments}
                  activityTypes={activityTypes}
                  from={dateRange.from}
                  to={dateRange.to}
                  invalidCustomRange={invalidCustomRange}
                  plainSectionHeader
                  cardClassName={dashboardStyles.dashboardSectionCard}
                  emptyStateClassName={dashboardStyles.dashboardSectionEmpty}
                  collapsibleDonutChart
                  donutChartExpanded={activitiesChartExpanded}
                  onDonutChartToggle={handleActivitiesChartToggle}
                  donutChartGroupBy={activitiesChartGroupBy}
                  donutChartValueMeasure={activitiesChartValueMeasure}
                  onDonutChartGroupByChange={setActivitiesChartGroupBy}
                  onDonutChartValueMeasureChange={setActivitiesChartValueMeasure}
                />
              </section>
              <section className={cx(ui.pageSectionFill, dashboardStyles.dashboardHoverSection)}>
                <InvoiceConceptsSection
                  documents={documents}
                  clients={[client]}
                  from={dateRange.from}
                  to={dateRange.to}
                  clientId={id}
                  invalidCustomRange={invalidCustomRange}
                  variant="card"
                  pageSectionHeader
                  plainSectionHeader
                  cardClassName={dashboardStyles.dashboardSectionCard}
                  emptyStateClassName={dashboardStyles.dashboardSectionEmpty}
                  collapsibleDonutChart
                  donutChartExpanded={conceptsChartExpanded}
                  onDonutChartToggle={handleConceptsChartToggle}
                />
              </section>
            </div>
          )}

          {id !== 'new' && client && (
            <section className={ui.pageSection}>
              <div className={ui.pageSectionTitleRow}>
                <h2 className={ui.pageSectionTitle}>Documentos</h2>
                {canSearchDocuments ? (
                  <button
                    type="button"
                    className={styles.searchToggleBtn}
                    aria-label={documentSearchOpen ? 'Ocultar búsqueda' : 'Buscar documentos'}
                    aria-expanded={documentSearchOpen}
                    onClick={() => setDocumentSearchOpen((open) => !open)}
                  >
                    <Search size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                ) : null}
              </div>
              {showDocumentSearchField ? (
                <div className={cx(ui.listPanelToolbar, styles.sectionSearch)}>
                  <div className={ui.filtersRow}>
                    <SearchField
                      ref={documentSearchInputRef}
                      wrapperClassName={ui.searchWrapper}
                      placeholder="Buscar"
                      value={documentSearchTerm}
                      onChange={(e) => setDocumentSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <div className={ui.card}>
              <div className={styles.cardSectionList}>
                {searchedDocuments.length > 0 ? (
                  searchedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={cx(ui.listItem, styles.sectionListItem, styles.documentListItem)}
                      onClick={() => handleOpenDocument(doc)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenDocument(doc);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      title="Abrir documento"
                    >
                      <div className={styles.docRow}>
                        <div className={styles.docInfo}>
                          <div>
                            <div className={ui.fontMedium}>{typeLabels[doc.type]} {doc.number}</div>
                            <div className={`${ui.textSmall} ${ui.textMuted}`}>
                              {formatDateSafe(doc.date, "d 'de' MMMM yyyy", { locale: es })}
                            </div>
                            {doc.activityId && (
                              <div className={`${ui.textXs} ${ui.textMuted}`}>
                                Actividad:{' '}
                                {formatDateSafe(
                                  activities.find((a) => a.id === doc.activityId)?.date ?? doc.date,
                                  'd MMM yyyy',
                                  { locale: es },
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={styles.docAside}>
                          <span className={cx(ui.textSmall, ui.textMuted)}>
                            {doc.items.length}{' '}
                            {doc.items.length === 1 ? 'concepto' : 'conceptos'}
                          </span>
                          <span className={ui.fontMedium}>{formatDocumentAmount(doc.total)}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    emoji="📄"
                    description={
                      documentSearchTerm.trim()
                        ? 'No hay documentos que coincidan con la búsqueda.'
                        : 'No hay documentos en el periodo seleccionado.'
                    }
                    compact
                  />
                )}
              </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {showNewActivityModal && id && (
        <ActivityFormModal
          eventToEdit={null}
          initialDate={activityModalContext?.date ?? format(new Date(), 'yyyy-MM-dd')}
          initialClientId={activityModalContext?.clientId ?? id}
          directForm
          onClose={() => {
            setShowNewActivityModal(false);
            setActivityModalContext(null);
          }}
          onSaved={handleNewActivitySaved}
        />
      )}

      {id && client && (
        <DocumentFormModal
          open={showNewDocumentModal}
          onClose={() => {
            setShowNewDocumentModal(false);
            setDocumentFormActivityId('');
          }}
          onSaved={handleNewDocumentSaved}
          clients={[client]}
          activities={activities}
          initialClientId={id}
          initialActivityId={documentFormActivityId}
          externalActivityId={documentFormActivityId}
          lockClientId
          onRequestActivity={({ clientId, date }) => {
            setActivityModalContext({ clientId, date });
            setShowNewActivityModal(true);
          }}
        />
      )}

      {!isEditing && id !== 'new' && isMobile && (
        <div
          className={cx(
            styles.clientDetailNavMobile,
            navMobileHidden && styles.clientDetailNavMobileHidden,
          )}
          role="toolbar"
          aria-label="Acciones del contacto"
        >
          <div className={styles.clientDetailNavMobileActions}>
            <button
              type="button"
              onClick={openToolbarOptionsMenu}
              className={cx(ui.navMobileOptionsBtn, styles.clientDetailNavMobileIconBtn)}
              aria-label="Opciones"
              title="Opciones"
              aria-haspopup="menu"
              aria-expanded={toolbarOptionsMenu !== null}
            >
              <MoreVertical size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={openHeaderActionsMenu}
              className={styles.clientDetailNavMobileFooterPrimary}
              aria-label="Nuevo"
              title="Nuevo"
              aria-haspopup="menu"
              aria-expanded={headerActionsMenu !== null}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nuevo
            </button>
          </div>
        </div>
      )}

      {headerActionsMenu && (
        <ContextMenu
          x={headerActionsMenu.x}
          y={headerActionsMenu.y}
          anchorX="end"
          ariaLabel="Acciones del contacto"
          onClose={() => setHeaderActionsMenu(null)}
          items={headerActionItems}
        />
      )}

      {toolbarOptionsMenu && (
        <ContextMenu
          x={toolbarOptionsMenu.x}
          y={toolbarOptionsMenu.y}
          anchorX="center"
          ariaLabel="Opciones del contacto"
          onClose={() => setToolbarOptionsMenu(null)}
          items={toolbarOptionsItems}
        />
      )}

      {isEditing && isAdmin && client && (
        <ModalOverlay>
          <div className={cx(ui.modal, ui.modalLg)}>
            <ModalHeader title="Editar contacto" onClose={closeEdit} />
            <form onSubmit={handleSubmit} className={ui.modalForm}>
              <div className={ui.modalScroll}>
                <ClientFormSections
                  formData={formData}
                  setFormData={setFormData}
                  groups={groups}
                  assignees={assignees}
                  accessViaScheduleUserIds={clientAccessViaScheduleUserIds}
                  idPrefix="edit-client"
                />
              </div>
              <ModalFooter>
                <ModalActions>
                  <button type="submit" className={modalBtnPrimary}>
                    Guardar cambios
                  </button>
                  <button type="button" onClick={closeEdit} className={modalBtnSecondary}>
                    Cancelar
                  </button>
                </ModalActions>
              </ModalFooter>
            </form>
          </div>
        </ModalOverlay>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar contacto"
        message={`¿Eliminar el contacto "${client.name}"? Esta acción no se puede deshacer.`}
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => {
          if (!deleting) setShowDeleteConfirm(false);
        }}
      />

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
            selected: client.status === status,
            disabled: client.status === status,
            onSelect: () => void handleStatusChange(status),
          }))}
        />
      )}
      </div>
    </Fragment>
  );
}
