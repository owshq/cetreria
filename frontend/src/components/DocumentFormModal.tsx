import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useCloseAllPopups, usePopupEscape } from '@/context/PopupStackContext';
import { format, isAfter, parseISO, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarPlus, ChevronDown, Plus, CircleMinus, X, FileText, FilePlus, CloudUpload, Camera } from 'lucide-react';
import {
  activitiesService,
  authService,
  clientGroupsService,
  clientsService,
  documentsService,
  workspaceBillingSettingsService,
} from '@/api';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary, modalBtnSecondary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import type { Activity, Client, Document, DocumentBillingAddress, WorkspaceBillingSettings } from '@shared/types';
import {
  canOperatorCreateDocumentType,
  billingAddressFromClient,
  buildDocumentConceptCatalog,
  getHalconeriaConceptLabels,
  isWorkspaceAdmin,
  normalizeConceptKey,
  resolveInvoiceConceptDefaultPrice,
  buildDocumentDisplayName,
  computeDocumentTotals,
  DEFAULT_DOCUMENT_TAX_RATE,
  getDocumentFormatsForType,
  getLineItemConceptText,
  nextDocumentNumber,
  normalizeBillingAddress,
  DOCUMENT_TYPE_LABELS,
  formatDocumentAmount,
  getActivityTypeLabel,
  resolveDocumentTemplate,
  validateActivityInvoiceRequiresDeliveryNote,
  validateRemovingDeliveryNoteFromActivity,
  VERIFACTU_INVOICE_KIND_LABELS,
  VERIFACTU_INVOICE_KINDS,
  type VerifactuInvoiceKind,
  type DocumentTemplateId,
} from '@shared/types';
import { useActivityModal } from '@/context/ActivityModalContext';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { useWorkspace } from '@/context/useWorkspace';
import {
  readLastDocumentTemplatePrefs,
  writeLastDocumentTemplatePrefs,
} from '@/lib/documentTemplatePrefs';
import { cx } from '@/lib/cx';
import { getDocumentPdfLocalObjectUrl } from '@/lib/documentPdf';
import { ensureInvoiceVerifactuQrPreview } from '@/lib/ensureInvoiceVerifactuQrPreview';
import { getDocumentDisplayName } from '@/lib/documentDisplayName';
import { resolveWorkspaceBillingSettings } from '@/lib/resolveWorkspaceBillingSettings';
import { DOCUMENT_STATUS_OPTIONS } from '@/lib/documentStatus';
import SearchableSelect from '@/components/SearchableSelect';
import searchableSelectStyles from '@/components/SearchableSelect.module.css';
import PdfViewer from '@/components/PdfViewer/PdfViewer';
import previewModalStyles from '@/components/documentPreviewModal.module.css';
import InvoiceConceptCombobox from '@/components/InvoiceConceptCombobox';
import SelectMenu, { type SelectMenuOption } from '@/components/SelectMenu';
import { Input, Textarea } from '@/components/forms';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  analyzeDocumentFile,
  applyAllOcrSuggestions,
  applyOcrSuggestionToItem,
  getApplicableOcrFields,
  type OcrLineSuggestion,
} from '@/lib/documentOcr';
import DocumentOcrHints, { DocumentOcrFieldHint } from '@/components/DocumentOcrHints';
import ui from '@/styles/shared.module.css';
import styles from './DocumentFormModal.module.css';

export type DocumentCreationMode = 'generate' | 'upload' | 'capture';

type LineItemForm = {
  name: string;
  description: string;
  quantity: number;
  price: number;
};

type DocumentFormData = {
  clientId: string;
  activityId: string;
  date: string;
  billingAddress: DocumentBillingAddress;
  items: LineItemForm[];
  notes: string;
  status: Document['status'];
  templateId: DocumentTemplateId;
  templateColor: string;
  invoiceKind: VerifactuInvoiceKind;
  rectifiesDocumentId: string;
};

type DocumentFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: (doc: Document) => void;
  clients: Client[];
  activities?: Activity[];
  editingDoc?: Document | null;
  duplicateFrom?: Document | null;
  initialClientId?: string;
  initialActivityId?: string;
  externalActivityId?: string;
  lockClientId?: boolean;
  defaultType?: Document['type'];
  onRequestActivity?: (context: { clientId: string; date: string }) => void;
  onClientCreated?: (client: Client) => void;
  /** When false, saving only closes this modal (keeps parent popups, e.g. activity form). Default true. */
  closeAllPopupsOnSave?: boolean;
  /** Modo inicial al crear un documento nuevo (p. ej. desde el modal de actividad). */
  initialCreationMode?: DocumentCreationMode;
};

const DOC_TYPE_SELECT_OPTIONS: SelectMenuOption[] = [
  { value: 'invoice', label: DOCUMENT_TYPE_LABELS.invoice, emoji: '🧾' },
  { value: 'delivery-note', label: DOCUMENT_TYPE_LABELS['delivery-note'], emoji: '📦' },
];

const EMPTY_BILLING: DocumentBillingAddress = {
  name: '',
  email: '',
  address: '',
  city: '',
  postalCode: '',
  country: '',
  state: '',
};

function defaultFormData(): DocumentFormData {
  const templatePrefs = readLastDocumentTemplatePrefs();
  return {
    clientId: '',
    activityId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    billingAddress: { ...EMPTY_BILLING },
    items: [{ name: '', description: '', quantity: 1, price: 0 }],
    notes: '',
    status: 'draft',
    templateId: templatePrefs.templateId,
    templateColor: templatePrefs.templateColor,
    invoiceKind: 'ordinaria',
    rectifiesDocumentId: '',
  };
}

function activityTimingLabel(date: string): string {
  const activityDay = startOfDay(parseISO(date));
  const today = startOfDay(new Date());
  if (isAfter(activityDay, today)) return 'Futura';
  if (activityDay.getTime() === today.getTime()) return 'Hoy';
  return 'Pasada';
}

function lineAmount(item: LineItemForm) {
  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;
  const price = Number.isFinite(item.price) ? item.price : 0;
  return qty * price;
}

function resolveFormBillingAddress(
  raw: DocumentBillingAddress | undefined,
  client: Client | undefined,
): DocumentBillingAddress {
  return normalizeBillingAddress(raw, client ? billingAddressFromClient(client) : undefined);
}

function mapLineItemForm(item: Pick<LineItemForm, 'name' | 'description' | 'quantity' | 'price'>): LineItemForm {
  const concept = getLineItemConceptText(item);
  return {
    name: item.name?.trim() || concept,
    description: item.description?.trim() ?? '',
    quantity: item.quantity,
    price: item.price,
  };
}

function seedFormDataFromProps(options: {
  editingDoc: Document | null;
  duplicateFrom: Document | null;
  initialClientId: string;
  initialActivityId: string;
  defaultType: Document['type'];
  clients: Client[];
}): DocumentFormData {
  const { editingDoc, duplicateFrom, initialClientId, initialActivityId, defaultType, clients } = options;

  if (editingDoc) {
    const client = clients.find((item) => item.id === editingDoc.clientId);
    const template = resolveDocumentTemplate(editingDoc);
    return {
      clientId: editingDoc.clientId,
      activityId: editingDoc.activityId ?? '',
      date: editingDoc.date,
      billingAddress: resolveFormBillingAddress(editingDoc.billingAddress, client),
      items: editingDoc.items.map(mapLineItemForm),
      notes: editingDoc.notes ?? '',
      status: editingDoc.status,
      templateId: template.templateId,
      templateColor: template.templateColor,
      invoiceKind: editingDoc.invoiceKind ?? 'ordinaria',
      rectifiesDocumentId: editingDoc.rectifiesDocumentId ?? '',
    };
  }

  if (duplicateFrom) {
    const client = clients.find((item) => item.id === duplicateFrom.clientId);
    const template = resolveDocumentTemplate(duplicateFrom);
    return {
      clientId: duplicateFrom.clientId,
      activityId: initialActivityId,
      date: format(new Date(), 'yyyy-MM-dd'),
      billingAddress: resolveFormBillingAddress(duplicateFrom.billingAddress, client),
      items: duplicateFrom.items.map(mapLineItemForm),
      notes: duplicateFrom.notes ?? '',
      status: 'draft',
      templateId: template.templateId,
      templateColor: template.templateColor,
      invoiceKind: duplicateFrom.invoiceKind ?? 'ordinaria',
      rectifiesDocumentId: '',
    };
  }

  const client = initialClientId ? clients.find((item) => item.id === initialClientId) : undefined;
  return {
    ...defaultFormData(),
    clientId: initialClientId,
    activityId: initialActivityId,
    billingAddress: client ? billingAddressFromClient(client) : { ...EMPTY_BILLING },
  };
}

export default function DocumentFormModal({
  open,
  onClose,
  onSaved,
  clients,
  activities = [],
  editingDoc = null,
  duplicateFrom = null,
  initialClientId = '',
  initialActivityId = '',
  externalActivityId = '',
  lockClientId = false,
  defaultType,
  onRequestActivity,
  onClientCreated,
  closeAllPopupsOnSave = true,
  initialCreationMode = 'generate',
}: DocumentFormModalProps) {
  usePopupEscape(open, onClose);
  const closeAllPopups = useCloseAllPopups();
  const { notifyDocumentSaved } = useActivityModal();
  const { activityTypes } = useActivityTypes();
  const { settings: conceptSettings } = useInvoiceConceptSettings();
  const { invoiceConceptFreeCreationEnabled, verifactuEnabled } = useWorkspaceFeatureSettings();
  const { currentWorkspace } = useWorkspace();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  const canEditLinePrice =
    isAdmin || isWorkspaceAdmin(currentWorkspace?.role);
  const resolvedDefaultType =
    defaultType ?? (isAdmin ? 'invoice' : 'delivery-note');
  const docTypeSelectOptions = useMemo(
    () =>
      isAdmin
        ? DOC_TYPE_SELECT_OPTIONS
        : DOC_TYPE_SELECT_OPTIONS.filter((option) =>
            canOperatorCreateDocumentType(option.value as Document['type']),
          ),
    [isAdmin],
  );

  const isNewDocument = !editingDoc && !duplicateFrom;
  const [creationMode, setCreationMode] = useState<DocumentCreationMode>('generate');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceFilePreviewUrl, setSourceFilePreviewUrl] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const ocrRunRef = useRef(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrSuggestions, setOcrSuggestions] = useState<OcrLineSuggestion[]>([]);

  const [docType, setDocType] = useState<Document['type']>(resolvedDefaultType);
  const [formData, setFormData] = useState<DocumentFormData>(() => defaultFormData());
  const [companySettings, setCompanySettings] = useState<WorkspaceBillingSettings | null>(null);
  const [localClients, setLocalClients] = useState<Client[]>([]);
  const [showNewClient, setShowNewClient] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    country: '',
    state: '',
    phone: '',
    groupId: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const formSeedRef = useRef<string | null>(null);
  const catalogLoadRef = useRef(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [catalogDocuments, setCatalogDocuments] = useState<Document[]>([]);
  const [clientActivities, setClientActivities] = useState<Activity[]>([]);

  const closePreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewOpen(false);
  }, []);

  const clearOcrState = useCallback(() => {
    ocrRunRef.current += 1;
    setOcrLoading(false);
    setOcrError(null);
    setOcrSuggestions([]);
  }, []);

  const clearSourceFile = useCallback(() => {
    setSourceFile(null);
    clearOcrState();
    setSourceFilePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [clearOcrState]);

  const handleSourceFileSelect = useCallback((file: File | null) => {
    clearSourceFile();
    if (!file) return;

    setSourceFile(file);
    if (file.type.startsWith('image/')) {
      setSourceFilePreviewUrl(URL.createObjectURL(file));
    }
  }, [clearSourceFile]);

  usePopupEscape(previewOpen, closePreview);

  useEffect(() => {
    if (!open) closePreview();
  }, [open, closePreview]);

  useEffect(() => {
    if (!open) {
      clearSourceFile();
      return;
    }
    return () => {
      clearSourceFile();
    };
  }, [open, clearSourceFile]);

  const allClients = useMemo(() => {
    const map = new Map(clients.map((client) => [client.id, client]));
    localClients.forEach((client) => map.set(client.id, client));
    return Array.from(map.values());
  }, [clients, localClients]);

  useEffect(() => {
    if (!open) {
      formSeedRef.current = null;
      return;
    }

    setShowNewClient(false);
    setShowBillingDetails(false);
    setNewClientError(null);
    setSaveError(null);
    setCompanySettings(null);
    setCreationMode(initialCreationMode);
    clearSourceFile();

    const formSeed =
      editingDoc?.id ??
      (duplicateFrom ? `duplicate:${duplicateFrom.id}` : `new:${initialClientId}:${initialActivityId}:${resolvedDefaultType}`);
    const shouldResetForm = formSeedRef.current !== formSeed;
    formSeedRef.current = formSeed;

    if (shouldResetForm) {
      if (editingDoc) {
        setDocType(editingDoc.type);
      } else if (duplicateFrom) {
        setDocType(
          canOperatorCreateDocumentType(duplicateFrom.type)
            ? duplicateFrom.type
            : 'delivery-note',
        );
      } else {
        setDocType(resolvedDefaultType);
      }
      setFormData(
        seedFormDataFromProps({
          editingDoc,
          duplicateFrom,
          initialClientId,
          initialActivityId,
          defaultType: resolvedDefaultType,
          clients,
        }),
      );
    }

    const loadId = ++catalogLoadRef.current;
    let cancelled = false;

    const loadCatalog = async () => {
      const [settings, groups, allDocuments] = await Promise.all([
        workspaceBillingSettingsService.get().catch(() => null),
        clientGroupsService.getAll().catch(() => []),
        documentsService.getAll().catch(() => []),
      ]);

      if (cancelled || loadId !== catalogLoadRef.current) return;

      setCatalogDocuments(allDocuments);

      const resolvedSettings = settings ? await resolveWorkspaceBillingSettings(settings) : null;
      if (cancelled || loadId !== catalogLoadRef.current) return;

      setCompanySettings(resolvedSettings);
      const defaultGroup = groups.find((group) => group.isDefault) ?? groups[0];
      if (defaultGroup) {
        setNewClientForm((current) => ({ ...current, groupId: defaultGroup.id }));
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    editingDoc,
    duplicateFrom,
    initialClientId,
    initialActivityId,
    resolvedDefaultType,
    clients,
    clearSourceFile,
    initialCreationMode,
  ]);

  useEffect(() => {
    if (!open || !externalActivityId) return;
    setFormData((current) => ({ ...current, activityId: externalActivityId }));
  }, [open, externalActivityId]);

  const clientsMap = useMemo(() => new Map(allClients.map((c) => [c.id, c])), [allClients]);

  useEffect(() => {
    if (!open || !formData.clientId) return;
    if (formData.billingAddress.email.trim() && formData.billingAddress.name.trim()) return;

    const client = clientsMap.get(formData.clientId);
    if (!client) return;

    setFormData((current) => ({
      ...current,
      billingAddress: resolveFormBillingAddress(current.billingAddress, client),
    }));
  }, [open, formData.clientId, formData.billingAddress.email, formData.billingAddress.name, clientsMap]);

  useEffect(() => {
    if (!open || !formData.clientId) {
      setClientActivities([]);
      return;
    }

    let cancelled = false;
    const linkedId = formData.activityId || editingDoc?.activityId;

    void (async () => {
      const list = await activitiesService.getByClientId(formData.clientId);
      const byId = new Map(list.map((activity) => [activity.id, activity]));

      if (linkedId && !byId.has(linkedId)) {
        const linked = await activitiesService.getById(linkedId);
        if (linked?.clientId === formData.clientId) {
          byId.set(linked.id, linked);
        }
      }

      if (!cancelled) {
        setClientActivities([...byId.values()]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, formData.clientId, formData.activityId, editingDoc?.activityId]);

  const clientOptions = useMemo(
    () =>
      allClients.map((client) => ({
        value: client.id,
        label: client.name,
        hint: client.email || client.phone || undefined,
      })),
    [allClients],
  );

  const activitiesForClient = useMemo(() => {
    if (!formData.clientId) return [];
    const byId = new Map<string, Activity>();
    for (const activity of clientActivities) {
      byId.set(activity.id, activity);
    }
    for (const activity of activities) {
      if (activity.clientId === formData.clientId) {
        byId.set(activity.id, activity);
      }
    }
    return [...byId.values()].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [activities, clientActivities, formData.clientId]);

  const activityOptions = useMemo(() => {
    const items = activitiesForClient.map((activity) => {
      const description = activity.description.trim();
      const shortDescription =
        description.length > 48 ? `${description.slice(0, 48)}…` : description;
      const typeLabel = getActivityTypeLabel(activity.type, activityTypes);
      return {
        value: activity.id,
        label: `${format(parseISO(activity.date), 'd MMM yyyy', { locale: es })} · ${shortDescription || typeLabel}`,
        hint: `${typeLabel} · ${activity.hours}h · ${activityTimingLabel(activity.date)}`,
      };
    });

    return [
      {
        value: '',
        label: 'Sin actividad vinculada',
        hint: 'El documento no se asociará a ninguna actividad',
      },
      ...items,
    ];
  }, [activitiesForClient, activityTypes]);

  const workspaceTaxRate =
    companySettings != null ? companySettings.defaultTaxRate : DEFAULT_DOCUMENT_TAX_RATE;

  const conceptCatalog = useMemo(() => {
    const lineLabels = formData.items.map((item) => item.name);
    const extraLabels = invoiceConceptFreeCreationEnabled
      ? [...getHalconeriaConceptLabels(), ...lineLabels]
      : lineLabels;
    const catalogDocs = invoiceConceptFreeCreationEnabled ? catalogDocuments : [];
    return buildDocumentConceptCatalog(catalogDocs, conceptSettings, extraLabels);
  }, [
    catalogDocuments,
    conceptSettings,
    formData.items,
    invoiceConceptFreeCreationEnabled,
  ]);

  const ocrCatalogLabels = useMemo(
    () => [
      ...getHalconeriaConceptLabels(),
      ...conceptCatalog.map((option) => option.description),
    ],
    [conceptCatalog],
  );

  useEffect(() => {
    if (!open || !isNewDocument || creationMode === 'generate' || !sourceFile) {
      clearOcrState();
      return;
    }

    const runId = ++ocrRunRef.current;
    setOcrLoading(true);
    setOcrError(null);
    setOcrSuggestions([]);

    void analyzeDocumentFile(sourceFile, { catalogLabels: ocrCatalogLabels })
      .then((suggestions) => {
        if (ocrRunRef.current !== runId) return;
        setOcrSuggestions(suggestions);
        setOcrLoading(false);
      })
      .catch((err) => {
        if (ocrRunRef.current !== runId) return;
        setOcrError(
          err instanceof Error ? err.message : 'No se pudo leer el documento automáticamente.',
        );
        setOcrLoading(false);
      });

    return () => {
      ocrRunRef.current += 1;
    };
  }, [open, isNewDocument, creationMode, sourceFile, ocrCatalogLabels, clearOcrState]);

  const getOcrPairForRow = useCallback(
    (rowIndex: number): { suggestion: OcrLineSuggestion; suggestionIndex: number } | null => {
      const primary = ocrSuggestions[rowIndex];
      if (primary && getApplicableOcrFields(formData.items[rowIndex], primary).length > 0) {
        return { suggestion: primary, suggestionIndex: rowIndex };
      }
      const foundIndex = ocrSuggestions.findIndex(
        (suggestion) => getApplicableOcrFields(formData.items[rowIndex], suggestion).length > 0,
      );
      if (foundIndex < 0) return null;
      return { suggestion: ocrSuggestions[foundIndex], suggestionIndex: foundIndex };
    },
    [ocrSuggestions, formData.items],
  );

  const handleApplyOcrSuggestion = useCallback((suggestionIndex: number, rowIndex: number) => {
    const suggestion = ocrSuggestions[suggestionIndex];
    if (!suggestion) return;
    setFormData((current) => {
      const newItems = [...current.items];
      newItems[rowIndex] = applyOcrSuggestionToItem(newItems[rowIndex], suggestion);
      return { ...current, items: newItems };
    });
  }, [ocrSuggestions]);

  const handleApplyAllOcr = useCallback(() => {
    setFormData((current) => ({
      ...current,
      items: applyAllOcrSuggestions(current.items, ocrSuggestions),
    }));
  }, [ocrSuggestions]);

  const totals = useMemo(
    () => computeDocumentTotals(formData.items, workspaceTaxRate),
    [formData.items, workspaceTaxRate],
  );

  const documentDisplayName = useMemo(() => {
    const selectedClient = formData.clientId ? clientsMap.get(formData.clientId) : undefined;
    const clientName = selectedClient?.name || formData.billingAddress.name || 'Nombre del contacto';

    if (editingDoc) {
      return getDocumentDisplayName(editingDoc, clientName, companySettings);
    }

    const typeFormats = getDocumentFormatsForType(companySettings?.documentFormats, docType);
    const number = nextDocumentNumber(
      catalogDocuments,
      docType,
      typeFormats.number,
      formData.date,
    );

    return buildDocumentDisplayName(typeFormats.name, {
      number,
      clientName,
      date: formData.date,
    });
  }, [
    editingDoc,
    companySettings,
    docType,
    catalogDocuments,
    formData.date,
    formData.clientId,
    formData.billingAddress.name,
    clientsMap,
  ]);

  const handleClientChange = (clientId: string) => {
    const client = clientsMap.get(clientId);
    setShowBillingDetails(false);
    setFormData((current) => ({
      ...current,
      clientId,
      activityId: lockClientId ? current.activityId : '',
      billingAddress: client ? billingAddressFromClient(client) : { ...EMPTY_BILLING },
    }));
  };

  const handleCreateClient = async () => {
    if (newClientSaving) return;
    if (!newClientForm.name.trim() || !newClientForm.email.trim() || !newClientForm.groupId) {
      setNewClientError('Nombre, email y grupo son obligatorios.');
      return;
    }

    setNewClientSaving(true);
    setNewClientError(null);
    try {
      const created = await clientsService.create({
        groupId: newClientForm.groupId,
        name: newClientForm.name.trim(),
        email: newClientForm.email.trim(),
        phone: newClientForm.phone.trim(),
        address: newClientForm.address.trim(),
        city: newClientForm.city.trim(),
        postalCode: newClientForm.postalCode.trim(),
        country: newClientForm.country.trim(),
        state: newClientForm.state.trim(),
        website: '',
        technicalInfo: '',
        status: 'active',
        createdAt: format(new Date(), 'yyyy-MM-dd'),
      });
      setLocalClients((current) => [...current, created]);
      onClientCreated?.(created);
      handleClientChange(created.id);
      setShowNewClient(false);
      setNewClientForm((current) => ({
        ...current,
        name: '',
        email: '',
        address: '',
        city: '',
        postalCode: '',
        country: '',
        state: '',
        phone: '',
      }));
    } catch (err) {
      setNewClientError(err instanceof Error ? err.message : 'No se pudo crear el contacto.');
    } finally {
      setNewClientSaving(false);
    }
  };

  const handleAddItem = () => {
    setFormData((current) => ({
      ...current,
      items: [...current.items, { name: '', description: '', quantity: 1, price: 0 }],
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData((current) => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (
    index: number,
    field: keyof LineItemForm,
    value: string | number,
  ) => {
    setFormData((current) => {
      const newItems = [...current.items];
      if (field === 'name' && typeof value === 'string') {
        const conceptKey = normalizeConceptKey(value);
        const catalogPrice = resolveInvoiceConceptDefaultPrice(conceptKey, conceptSettings);
        const hasCatalogPrice = conceptSettings.some(
          (setting) => setting.normalizedKey === conceptKey,
        );
        newItems[index] = {
          ...newItems[index],
          name: value,
          price: hasCatalogPrice ? catalogPrice : newItems[index].price,
        };
      } else {
        newItems[index] = { ...newItems[index], [field]: value };
      }
      return { ...current, items: newItems };
    });
  };

  const buildPreviewDocument = (): Document | null => {
    const client = clientsMap.get(formData.clientId);
    if (!client) return null;

    const template = resolveDocumentTemplate({
      templateId: formData.templateId,
      templateColor: formData.templateColor,
    });

    return {
      id: editingDoc?.id ?? 'preview',
      workspaceId: editingDoc?.workspaceId ?? '',
      type: editingDoc?.type ?? docType,
      number: editingDoc?.number ?? `${docType === 'invoice' ? 'F' : 'A'}-VISTA-PREVIA`,
      clientId: formData.clientId,
      activityId: formData.activityId || undefined,
      date: formData.date,
      items: formData.items,
      subtotal: totals.subtotal,
      taxRate: workspaceTaxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: formData.notes || undefined,
      billingAddress: formData.billingAddress,
      status: formData.status,
      templateId: template.templateId,
      templateColor: template.templateColor,
      createdAt: editingDoc?.createdAt ?? new Date().toISOString(),
      ...(docType === 'invoice' || editingDoc?.type === 'invoice'
        ? {
            verifactuHash: editingDoc?.verifactuHash,
            verifactuQrUrl: editingDoc?.verifactuQrUrl,
            verifactuQrDataUrl: editingDoc?.verifactuQrDataUrl,
            verifactuCsv: editingDoc?.verifactuCsv,
          }
        : {}),
    };
  };

  const validatePreview = (): string | null => {
    if (!formData.clientId) return 'Selecciona un contacto.';
    if (!formData.date) return 'Indica la fecha del documento.';
    if (formData.items.length === 0) return 'Añade al menos una línea.';
    return null;
  };

  const handlePreview = () => {
    const error = validatePreview();
    if (error) {
      window.alert(error);
      return;
    }

    void (async () => {
      const client = clientsMap.get(formData.clientId);
      let previewDoc = buildPreviewDocument();
      if (!client || !previewDoc) {
        window.alert('Selecciona un contacto para ver la vista previa.');
        return;
      }

      if (previewDoc.type === 'invoice' && verifactuEnabled) {
        previewDoc = await ensureInvoiceVerifactuQrPreview(previewDoc, companySettings);
      }

      closePreview();

      try {
        const url = getDocumentPdfLocalObjectUrl(previewDoc, client, companySettings);
        setPreviewUrl(url);
        setPreviewOpen(true);
      } catch {
        window.alert('No se pudo generar la vista previa. Revisa los datos del documento.');
      }
    })();
  };

  const validateForm = (): string | null => {
    if (isNewDocument && creationMode !== 'generate' && !sourceFile) {
      return creationMode === 'capture'
        ? 'Haz una foto del documento antes de guardar.'
        : 'Selecciona un PDF o imagen antes de guardar.';
    }
    if (!formData.clientId) return 'Selecciona un contacto.';
    if (!formData.billingAddress.email.trim()) return 'El email del cliente es obligatorio.';
    if (!formData.date) return 'La fecha es obligatoria.';
    if (!formData.billingAddress.name.trim()) return 'El nombre del cliente es obligatorio.';
    if (formData.items.length === 0) return 'Añade al menos una línea.';
    if (formData.items.some((item) => !item.name.trim())) {
      return 'Todas las líneas necesitan un concepto.';
    }
    const resolvedActivityId = formData.activityId || externalActivityId || undefined;
    if (docType === 'invoice' && resolvedActivityId) {
      const pairError = validateActivityInvoiceRequiresDeliveryNote(
        catalogDocuments,
        resolvedActivityId,
        undefined,
        {
          excludeDocumentId: editingDoc?.id,
          includesInvoice: true,
        },
      );
      if (pairError) return pairError;
    }
    if (
      docType === 'delivery-note' &&
      editingDoc?.type === 'delivery-note' &&
      editingDoc.activityId
    ) {
      const nextActivityId = formData.activityId || undefined;
      if (nextActivityId !== editingDoc.activityId) {
        const removalError = validateRemovingDeliveryNoteFromActivity(
          catalogDocuments,
          editingDoc.activityId,
          editingDoc.id,
        );
        if (removalError) return removalError;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const error = validateForm();
    if (error) {
      if (error.includes('email') || error.includes('nombre')) {
        setShowBillingDetails(true);
      }
      setSaveError(error);
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const template = resolveDocumentTemplate({
        templateId: formData.templateId,
        templateColor: formData.templateColor,
      });

      const payload = {
        type: docType,
        clientId: formData.clientId,
        date: formData.date,
        items: formData.items,
        subtotal: totals.subtotal,
        taxRate: workspaceTaxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: formData.notes || undefined,
        billingAddress: formData.billingAddress,
        status: formData.status,
        activityId: formData.activityId || undefined,
        templateId: template.templateId,
        templateColor: template.templateColor,
        invoiceKind: docType === 'invoice' ? formData.invoiceKind : undefined,
        rectifiesDocumentId:
          docType === 'invoice' &&
          (formData.invoiceKind === 'rectificativa' ||
            formData.invoiceKind === 'rectificativa_simplificada') &&
          formData.rectifiesDocumentId
            ? formData.rectifiesDocumentId
            : undefined,
      };

      writeLastDocumentTemplatePrefs(template);

      let saved: Document;
      if (editingDoc) {
        saved = await documentsService.update(editingDoc.id, {
          ...payload,
          type: editingDoc.type,
          activityId: formData.activityId || null,
        });
      } else if (isNewDocument && creationMode !== 'generate' && sourceFile) {
        saved = await documentsService.createWithSourceFile(payload, sourceFile);
      } else {
        saved = await documentsService.create(payload);
      }

      if (closeAllPopupsOnSave) {
        closeAllPopups();
      }
      notifyDocumentSaved();
      onSaved(saved);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar el documento.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const title = editingDoc
    ? 'Editar documento'
    : duplicateFrom
      ? 'Duplicar documento'
      : 'Nuevo documento';

  const contextHint = editingDoc
    ? `${editingDoc.number} · ${DOCUMENT_TYPE_LABELS[editingDoc.type]}`
    : duplicateFrom
      ? `Basado en ${duplicateFrom.number}`
      : null;

  const showGenerateOptions = !isNewDocument || creationMode === 'generate';
  const showSourceUpload = isNewDocument && creationMode !== 'generate';

  return (
    <>
      <ModalOverlay>
      <div
        className={cx(ui.modal, ui.modalXl)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-form-title"
      >
        <ModalHeader title={title} titleId="document-form-title" onClose={onClose}>
          {contextHint && <p className={styles.contextHint}>{contextHint}</p>}
        </ModalHeader>

        <form onSubmit={handleSubmit} className={ui.modalForm} noValidate>
          <div className={ui.modalScroll}>
            <div className={styles.formSections}>
              {isNewDocument && (
                <div className={styles.creationModePicker} role="radiogroup" aria-label="Origen del documento">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={creationMode === 'generate'}
                    className={cx(
                      styles.creationModeOption,
                      creationMode === 'generate' && styles.creationModeOptionActive,
                    )}
                    onClick={() => {
                      setCreationMode('generate');
                      clearSourceFile();
                    }}
                  >
                    <FilePlus size={18} aria-hidden />
                    <span className={styles.creationModeLabel}>Generar documento</span>
                    <span className={styles.creationModeDesc}>
                      Rellena los datos y crea un PDF con plantilla
                    </span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={creationMode === 'upload'}
                    className={cx(
                      styles.creationModeOption,
                      creationMode === 'upload' && styles.creationModeOptionActive,
                    )}
                    onClick={() => {
                      setCreationMode('upload');
                      clearSourceFile();
                    }}
                  >
                    <CloudUpload size={18} aria-hidden />
                    <span className={styles.creationModeLabel}>Subir documento</span>
                    <span className={styles.creationModeDesc}>
                      PDF o imagen en formato original
                    </span>
                  </button>
                  {isMobile && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={creationMode === 'capture'}
                      className={cx(
                        styles.creationModeOption,
                        creationMode === 'capture' && styles.creationModeOptionActive,
                      )}
                      onClick={() => {
                        setCreationMode('capture');
                        clearSourceFile();
                      }}
                    >
                      <Camera size={18} aria-hidden />
                      <span className={styles.creationModeLabel}>Hacer foto</span>
                      <span className={styles.creationModeDesc}>
                        Captura el documento; verás sugerencias OCR sin rellenar solo
                      </span>
                    </button>
                  )}
                </div>
              )}

              <section className={ui.pageSection} aria-labelledby="document-section-meta">
                <h2 id="document-section-meta" className={ui.pageSectionTitle}>
                  Documento
                </h2>
                <div className={ui.card}>
                  <div className={styles.sectionCardBody}>
                    {showSourceUpload && (
                      <div className={styles.sourceFilePanel}>
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                          onChange={(event) =>
                            handleSourceFileSelect(event.target.files?.[0] ?? null)
                          }
                          hidden
                          aria-hidden
                          tabIndex={-1}
                        />
                        <input
                          ref={captureInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(event) =>
                            handleSourceFileSelect(event.target.files?.[0] ?? null)
                          }
                          hidden
                          aria-hidden
                          tabIndex={-1}
                        />

                        {!sourceFile ? (
                          <button
                            type="button"
                            className={ui.dropzone}
                            onClick={() => {
                              if (creationMode === 'capture') {
                                captureInputRef.current?.click();
                              } else {
                                uploadInputRef.current?.click();
                              }
                            }}
                          >
                            {creationMode === 'capture' ? (
                              <Camera className={ui.dropzoneIcon} size={32} color="#a3a3a3" />
                            ) : (
                              <CloudUpload className={ui.dropzoneIcon} size={32} color="#a3a3a3" />
                            )}
                            <p className={ui.textMuted}>
                              {creationMode === 'capture'
                                ? 'Toca para hacer una foto del documento'
                                : 'Arrastra un PDF o imagen, o haz clic para seleccionar'}
                            </p>
                            <p className={`${ui.textSmall} ${ui.textMuted}`}>
                              Se guardará en formato original. Al subir, se analizarán conceptos e importes
                              como sugerencias (no se rellenan solos).
                            </p>
                          </button>
                        ) : (
                          <div className={styles.sourceFilePreview}>
                            {sourceFilePreviewUrl ? (
                              <img
                                src={sourceFilePreviewUrl}
                                alt="Vista previa del documento"
                                className={styles.sourceFileImage}
                              />
                            ) : (
                              <div className={styles.sourceFilePdfHint}>
                                <FileText size={28} aria-hidden />
                                <span>{sourceFile.name}</span>
                              </div>
                            )}
                            <div className={styles.sourceFileActions}>
                              <span className={styles.sourceFileName}>{sourceFile.name}</span>
                              <button
                                type="button"
                                className={ui.btnSecondary}
                                onClick={() => {
                                  clearSourceFile();
                                  if (creationMode === 'capture') {
                                    captureInputRef.current?.click();
                                  } else {
                                    uploadInputRef.current?.click();
                                  }
                                }}
                              >
                                Cambiar archivo
                              </button>
                              {ocrLoading && (
                                <span className={styles.ocrScanStatus}>Leyendo documento…</span>
                              )}
                              <button
                                type="button"
                                className={styles.removeSourceFileBtn}
                                onClick={clearSourceFile}
                                aria-label="Quitar archivo"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className={ui.formGrid2}>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor="document-type">
                          Tipo de documento
                        </label>
                        <SelectMenu
                          id="document-type"
                          value={docType}
                          onChange={(type) => setDocType(type as Document['type'])}
                          options={docTypeSelectOptions}
                          ariaLabel="Tipo de documento"
                          disabled={!!editingDoc || docTypeSelectOptions.length <= 1}
                          menuPortal
                        />
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label}>Nombre del documento</label>
                        <Input
                          value={documentDisplayName}
                          disabled
                          readOnly
                        />
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor="document-date">
                          Fecha de factura *
                        </label>
                        <Input
                          id="document-date"
                          type="date"
                          value={formData.date}
                          onChange={(e) =>
                            setFormData((current) => ({ ...current, date: e.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className={ui.field}>
                        <label className={ui.label} htmlFor="document-status">
                          Estado
                        </label>
                        <SelectMenu
                          id="document-status"
                          value={formData.status}
                          onChange={(status) =>
                            setFormData((current) => ({
                              ...current,
                              status: status as Document['status'],
                            }))
                          }
                          options={DOCUMENT_STATUS_OPTIONS}
                          ariaLabel="Estado del documento"
                          menuPortal
                        />
                      </div>
                      {docType === 'invoice' ? (
                        <>
                          <div className={ui.field}>
                            <label className={ui.label} htmlFor="document-invoice-kind">
                              Tipo de factura (Veri*Factu)
                            </label>
                            <SelectMenu
                              id="document-invoice-kind"
                              value={formData.invoiceKind}
                              onChange={(kind) =>
                                setFormData((current) => ({
                                  ...current,
                                  invoiceKind: kind as VerifactuInvoiceKind,
                                  rectifiesDocumentId:
                                    kind === 'rectificativa' || kind === 'rectificativa_simplificada'
                                      ? current.rectifiesDocumentId
                                      : '',
                                }))
                              }
                              options={VERIFACTU_INVOICE_KINDS.map((kind) => ({
                                value: kind,
                                label: VERIFACTU_INVOICE_KIND_LABELS[kind],
                              }))}
                              ariaLabel="Tipo de factura Veri*Factu"
                              menuPortal
                            />
                          </div>
                          {formData.invoiceKind === 'rectificativa' ||
                          formData.invoiceKind === 'rectificativa_simplificada' ? (
                            <div className={ui.field}>
                              <label className={ui.label} htmlFor="document-rectifies">
                                Factura que rectifica
                              </label>
                              <SelectMenu
                                id="document-rectifies"
                                value={formData.rectifiesDocumentId}
                                onChange={(value) =>
                                  setFormData((current) => ({
                                    ...current,
                                    rectifiesDocumentId: value,
                                  }))
                                }
                                options={catalogDocuments
                                  .filter(
                                    (item) =>
                                      item.type === 'invoice' && item.id !== editingDoc?.id,
                                  )
                                  .map((item) => ({
                                    value: item.id,
                                    label: item.number,
                                  }))}
                                ariaLabel="Factura que rectifica"
                                menuPortal
                              />
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>

              <section className={ui.pageSection} aria-labelledby="document-section-client">
                <div className={ui.pageSectionTitleRow}>
                  <h2 id="document-section-client" className={ui.pageSectionTitle}>
                    Cliente
                  </h2>
                  {!lockClientId && (
                    <button
                      type="button"
                      className={ui.btnSecondary}
                      onClick={() => setShowNewClient((value) => !value)}
                    >
                      <Plus size={16} aria-hidden />
                      {showNewClient ? 'Cancelar' : 'Crear contacto'}
                    </button>
                  )}
                </div>
                <div className={ui.card}>
                  <div className={styles.sectionCardBody}>
                    {showNewClient && (
                      <div className={styles.newClientPanel}>
                        <div className={ui.formGrid2}>
                          <div className={ui.field}>
                            <label className={ui.label}>Nombre *</label>
                            <Input
                              value={newClientForm.name}
                              onChange={(e) =>
                                setNewClientForm({ ...newClientForm, name: e.target.value })
                              }
                            />
                          </div>
                          <div className={ui.field}>
                            <label className={ui.label}>Email *</label>
                            <Input
                              type="email"
                              value={newClientForm.email}
                              onChange={(e) =>
                                setNewClientForm({ ...newClientForm, email: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          className={ui.btnPrimary}
                          onClick={() => void handleCreateClient()}
                          disabled={newClientSaving}
                        >
                          {newClientSaving ? 'Creando…' : 'Guardar contacto'}
                        </button>
                        {newClientError && <p className={ui.alertError}>{newClientError}</p>}
                      </div>
                    )}

                    <SearchableSelect
                      id="document-client"
                      label="Buscar contacto"
                      value={formData.clientId}
                      onChange={handleClientChange}
                      options={clientOptions}
                      placeholder="Buscar por nombre, email o teléfono…"
                      required
                      disabled={lockClientId}
                    />

                    {formData.clientId && (
                      <button
                        type="button"
                        className={styles.billingToggleBtn}
                        onClick={() => setShowBillingDetails((value) => !value)}
                        aria-expanded={showBillingDetails}
                      >
                        <ChevronDown
                          size={16}
                          aria-hidden
                          className={cx(
                            styles.billingToggleIcon,
                            showBillingDetails && styles.billingToggleIconOpen,
                          )}
                        />
                        {showBillingDetails
                          ? 'Ocultar datos de facturación'
                          : 'Datos de facturación del cliente'}
                      </button>
                    )}

                    {formData.clientId && showBillingDetails && (
                      <div className={styles.billingDetailsPanel}>
                        <div className={ui.field}>
                          <label className={ui.label} htmlFor="billing-email">
                            Email del cliente *
                          </label>
                          <Input
                            id="billing-email"
                            type="email"
                            value={formData.billingAddress.email}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                billingAddress: { ...current.billingAddress, email: e.target.value },
                              }))
                            }
                            required
                          />
                        </div>

                        <div className={ui.field}>
                          <label className={ui.label} htmlFor="billing-name">
                            Nombre del cliente *
                          </label>
                          <Input
                            id="billing-name"
                            value={formData.billingAddress.name}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                billingAddress: { ...current.billingAddress, name: e.target.value },
                              }))
                            }
                            required
                          />
                        </div>

                        <div className={ui.field}>
                          <label className={ui.label} htmlFor="billing-address">
                            Dirección del cliente
                          </label>
                          <Input
                            id="billing-address"
                            value={formData.billingAddress.address}
                            onChange={(e) =>
                              setFormData((current) => ({
                                ...current,
                                billingAddress: { ...current.billingAddress, address: e.target.value },
                              }))
                            }
                          />
                        </div>

                        <div className={ui.formGrid2}>
                          <div className={ui.field}>
                            <label className={ui.label} htmlFor="billing-city">
                              Ciudad
                            </label>
                            <Input
                              id="billing-city"
                              value={formData.billingAddress.city}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  billingAddress: { ...current.billingAddress, city: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className={ui.field}>
                            <label className={ui.label} htmlFor="billing-postal">
                              Código postal
                            </label>
                            <Input
                              id="billing-postal"
                              value={formData.billingAddress.postalCode}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  billingAddress: {
                                    ...current.billingAddress,
                                    postalCode: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className={ui.formGrid2}>
                          <div className={ui.field}>
                            <label className={ui.label} htmlFor="billing-state">
                              Provincia / Estado
                            </label>
                            <Input
                              id="billing-state"
                              value={formData.billingAddress.state}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  billingAddress: { ...current.billingAddress, state: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <div className={ui.field}>
                            <label className={ui.label} htmlFor="billing-country">
                              País / Región
                            </label>
                            <Input
                              id="billing-country"
                              value={formData.billingAddress.country}
                              onChange={(e) =>
                                setFormData((current) => ({
                                  ...current,
                                  billingAddress: { ...current.billingAddress, country: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {formData.clientId && (
                      <div className={styles.activityLinkPanel}>
                        <div className={styles.activityLinkHeader}>
                          <div className={styles.activityLinkHeading}>
                            <p className={styles.activityLinkTitle}>Actividad vinculada</p>
                            <p className={styles.activityLinkSubtitle}>
                              {activitiesForClient.length > 0
                                ? `${activitiesForClient.length} actividades del contacto (pasadas y futuras)`
                                : 'Crea una actividad para poder vincularla al documento'}
                            </p>
                          </div>
                          {onRequestActivity && (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestActivity({
                                  clientId: formData.clientId,
                                  date: formData.date,
                                })
                              }
                              className={styles.linkAction}
                            >
                              <CalendarPlus size={15} aria-hidden />
                              Nueva actividad
                            </button>
                          )}
                        </div>
                        <SearchableSelect
                          id="document-activity"
                          value={formData.activityId}
                          onChange={(activityId) =>
                            setFormData((current) => ({ ...current, activityId }))
                          }
                          options={activityOptions}
                          placeholder="Buscar por fecha, tipo o descripción…"
                          menuPortal
                          fieldClassName={styles.activitySelectField}
                          dropdownClassName={searchableSelectStyles.dropdownTall}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className={ui.pageSection} aria-labelledby="document-section-lines">
                <div className={ui.pageSectionTitleRow}>
                  <h2 id="document-section-lines" className={ui.pageSectionTitle}>
                    Conceptos a facturar
                  </h2>
                  <button type="button" onClick={handleAddItem} className={ui.btnSecondary}>
                    <Plus size={16} aria-hidden />
                    Añadir línea
                  </button>
                </div>
                <div className={ui.card}>
                  <div className={styles.sectionCardBody}>
                    {showSourceUpload && sourceFile && (
                      <DocumentOcrHints
                        loading={ocrLoading}
                        error={ocrError}
                        suggestions={ocrSuggestions}
                        items={formData.items}
                        getApplicableFields={(rowIndex, suggestion) =>
                          getApplicableOcrFields(formData.items[rowIndex], suggestion)
                        }
                        onApplySuggestion={handleApplyOcrSuggestion}
                        onApplyAll={handleApplyAllOcr}
                      />
                    )}
                    <div className={styles.linesTable}>
                      <div className={styles.linesHead} aria-hidden>
                        <span>#</span>
                        <span>Concepto</span>
                        <span>Descripción</span>
                        <span className={styles.linesHeadQty}>Cant.</span>
                        <span className={styles.linesHeadPrice}>Precio</span>
                        <span className={styles.linesHeadSub}>Importe</span>
                        <span />
                      </div>
                      {formData.items.map((item, index) => {
                        const ocrPair = showSourceUpload && sourceFile ? getOcrPairForRow(index) : null;
                        const ocrSuggestion = ocrPair?.suggestion ?? null;
                        const ocrSuggestionIndex = ocrPair?.suggestionIndex ?? -1;
                        const applicableOcrFields =
                          ocrSuggestion != null
                            ? getApplicableOcrFields(item, ocrSuggestion)
                            : [];

                        return (
                        <div key={index} className={styles.lineRow}>
                          <span className={styles.lineIndex}>{index + 1}</span>
                          <div className={styles.lineFieldStack}>
                          <InvoiceConceptCombobox
                            value={item.name}
                            onChange={(next) => handleItemChange(index, 'name', next)}
                            options={conceptCatalog}
                            placeholder="Buscar concepto…"
                            className={styles.lineInput}
                            required
                            aria-label={`Concepto línea ${index + 1}`}
                          />
                          {ocrSuggestion && applicableOcrFields.includes('name') && (
                            <DocumentOcrFieldHint
                              suggestion={ocrSuggestion}
                              field="name"
                              onApply={() => handleApplyOcrSuggestion(ocrSuggestionIndex, index)}
                            />
                          )}
                          </div>
                          <div className={styles.lineFieldStack}>
                          <input
                            type="text"
                            placeholder="Descripción"
                            value={item.description}
                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                            className={styles.lineInput}
                            aria-label={`Descripción línea ${index + 1}`}
                          />
                          {ocrSuggestion && applicableOcrFields.includes('description') && (
                            <DocumentOcrFieldHint
                              suggestion={ocrSuggestion}
                              field="description"
                              onApply={() => handleApplyOcrSuggestion(ocrSuggestionIndex, index)}
                            />
                          )}
                          </div>
                          <div className={styles.lineFieldStack}>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(index, 'quantity', parseInt(e.target.value, 10) || 0)
                            }
                            className={cx(styles.lineInput, styles.lineInputNum)}
                            required
                            aria-label={`Cantidad línea ${index + 1}`}
                          />
                          {ocrSuggestion && applicableOcrFields.includes('quantity') && (
                            <DocumentOcrFieldHint
                              suggestion={ocrSuggestion}
                              field="quantity"
                              onApply={() => handleApplyOcrSuggestion(ocrSuggestionIndex, index)}
                            />
                          )}
                          </div>
                          <div className={styles.lineFieldStack}>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.price}
                            readOnly={!canEditLinePrice}
                            disabled={!canEditLinePrice}
                            onChange={(e) =>
                              handleItemChange(index, 'price', parseFloat(e.target.value) || 0)
                            }
                            className={cx(styles.lineInput, styles.lineInputNum)}
                            required
                            aria-label={`Precio línea ${index + 1}`}
                          />
                          {ocrSuggestion && applicableOcrFields.includes('price') && (
                            <DocumentOcrFieldHint
                              suggestion={ocrSuggestion}
                              field="price"
                              onApply={() => handleApplyOcrSuggestion(ocrSuggestionIndex, index)}
                            />
                          )}
                          </div>
                          <span className={styles.lineSubtotal}>
                            {formatDocumentAmount(lineAmount(item))}
                          </span>
                          {formData.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className={styles.removeLineBtn}
                              aria-label={`Eliminar línea ${index + 1}`}
                            >
                              <CircleMinus size={16} />
                            </button>
                          ) : (
                            <span className={styles.removeLinePlaceholder} aria-hidden />
                          )}
                        </div>
                        );
                      })}
                    </div>

                    <div className={ui.field}>
                      <label className={ui.label} htmlFor="document-notes">
                        Notas / memo
                      </label>
                      <Textarea
                        id="document-notes"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData((current) => ({ ...current, notes: e.target.value }))
                        }
                        rows={3}
                        placeholder="Condiciones de pago, observaciones…"
                      />
                    </div>

                    <div className={styles.totalsPanel}>
                      <div className={styles.totalsRow}>
                        <span>Subtotal</span>
                        <span>{formatDocumentAmount(totals.subtotal)}</span>
                      </div>
                      <div className={styles.totalsRow}>
                        <span>Impuesto ({workspaceTaxRate}%)</span>
                        <span>{formatDocumentAmount(totals.taxAmount)}</span>
                      </div>
                      <div className={cx(styles.totalsRow, styles.totalsRowTotal)}>
                        <span>Total</span>
                        <span>{formatDocumentAmount(totals.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>

          <ModalFooter>
            {saveError && (
              <p className={ui.alertError} style={{ marginBottom: '0.75rem' }}>
                {saveError}
              </p>
            )}
            <ModalActions>
              <button type="submit" className={modalBtnPrimary} disabled={saving}>
                {saving
                  ? 'Guardando…'
                  : editingDoc
                    ? 'Guardar cambios'
                    : 'Crear documento'}
              </button>
              <button
                type="button"
                onClick={handlePreview}
                className={modalBtnSecondary}
                disabled={!formData.clientId || !showGenerateOptions}
              >
                Vista previa
              </button>
              <button type="button" onClick={onClose} className={modalBtnSecondary} disabled={saving}>
                Cancelar
              </button>
            </ModalActions>
          </ModalFooter>
        </form>
      </div>
      </ModalOverlay>

      {previewOpen && previewUrl ? (
        <ModalOverlay>
          <div
            className={cx(ui.modal, ui.modalXl, previewModalStyles.previewPanel)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-preview-title"
          >
            <ModalHeader
              title={`Vista previa · ${DOCUMENT_TYPE_LABELS[docType]}`}
              titleId="document-preview-title"
              onClose={closePreview}
              closeLabel="Cerrar vista previa"
            >
              <p className={previewModalStyles.previewHint}>
                {editingDoc
                  ? 'Cambios sin guardar · vista previa local'
                  : 'Borrador · el documento aún no se ha creado'}
              </p>
            </ModalHeader>
            <div className={previewModalStyles.previewBody}>
              <PdfViewer
                className={previewModalStyles.previewFrame}
                src={previewUrl}
                fileName="vista-previa.pdf"
                title="Vista previa del documento"
              />
            </div>
          </div>
        </ModalOverlay>
      ) : null}
    </>
  );
}
