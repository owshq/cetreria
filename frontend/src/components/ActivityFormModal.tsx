import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { usePopupEscape } from '@/context/PopupStackContext';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, FilePlus, FileText, Link2, PenLine, Plus, RefreshCw, X } from 'lucide-react';
import {
  activitiesService,
  authService,
  clientsService,
  documentsService,
  eventsService,
  userSchedulesService,
  usersService,
} from '@/api';
import { ApiError } from '@/api/client';
import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  ACTIVITY_PLANNING_SHIFT_CODES,
  SHIFT_META,
  isShiftCode,
  type ShiftCode,
  type ActivityAssigneeSlot,
  activityEventSpanCrossesMidnight,
  aggregateEventTimeRange,
  buildAssigneeSlotsFromLegacy,
  getAssigneeIdsFromSlots,
  hoursForAssigneeSlot,
  normalizeActivityAssigneeSlots,
  resolveActivitySlotsForDisplay,
  totalHoursFromAssigneeSlots,
  buildActivityEventTitle,
  canEditActivity,
  canEditAssigneeSlotHours,
  canManageFinishedActivityDocuments,
  canCancelWorkerSignature,
  canCancelAllWorkerSignatures,
  activityUpdatesCancelWorkerSignature,
  activityUpdatesCancelAllWorkerSignatures,
  DOCUMENT_TYPE_LABELS,
  getUserInitials,
  resolveActivityScheduleFromTimes,
  getActivityEndDate,
  isActivityPast,
  isActivitySigned,
  findEventForActivity,
  getWorkerHoursStatus,
  getAssigneeSlotEndDateTime,
  applyWorkerSignatureFromUser,
  buildActivityWorkerSignature,
  isActivitySignedByWorker,
  canSubmitActivityWorkReport,
  canEditActivityWorkReport,
  canEditActivityWorkReportExtraItems,
  getDefaultWorkReportWorkedMinutes,
  hoursMinutesToWorkedMinutes,
  isActivityStarted,
  allAssigneesSubmittedWorkReports,
  getActivityWorkReport,
  getActivityWorkReportSurfaceStatus,
  getPendingWorkReportAssigneeIds,
  getPendingDeliveryNoteAssigneeIds,
  ACTIVITY_INVOICE_ZERO_HOUR_PRICE_WARNING,
  deliveryNotesHaveZeroPricedHourLines,
  parseEventTypeIdFromTitle,
  resolveActivityType,
  activityTypeCreatesDeliveryNote,
  activityTypeUsesWorkReport,
  buildActivityDeliveryNotePreviewDocument,
  findActivityDeliveryNoteForWorker,
  listUnmatchedActivityDeliveryNotes,
  formatDocumentAmount,
  UNKNOWN_ACTIVITY_TYPE_LABEL,
  formatInvoiceActivityDeliveryNotesMismatchBanner,
  getActivityInvoiceWithoutDeliveryNoteBanner,
  getInvoiceDeliveryNotesMismatchTooltip,
  INVOICE_DELIVERY_NOTES_OUT_OF_SYNC_SUMMARY,
  invoiceMatchesActivityDeliveryNotes,
  resolveDeliveryNotesAggregateTotals,
  validateActivityInvoiceRequiresDeliveryNote,
} from '@shared/types';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { getActivityEmoji } from '@/lib/activityIcons';
import {
  formatActivityScheduleEditHint,
  formatActivityScheduleHoursLabel,
} from '@/lib/activityScheduleHoursHint';
import {
  formatActivityCalendarDateRange,
  formatActivityCalendarTimeRange,
} from '@/lib/activityScheduleDisplay';
import { formatDashboardJobsHours } from '@/lib/dashboardJobsMatrix';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import EmptyState from '@/components/EmptyState';
import ActivityWorkerHoursStatus from '@/components/ActivityWorkerHoursStatus';
import ActivityTypeManager from '@/components/ActivityTypeManager';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import type { ActivityModalFocusSection } from '@/context/activityModalContext';
import { useActivityModal } from '@/context/activityModalContext';
import ActivityDocumentLinks from '@/components/ActivityDocumentLinks';
import ActivityWorkReportPanel, {
  ActivityWorkReportFormHeader,
  EMPTY_WORKED_TIME,
  splitWorkedMinutes,
  type ActivityWorkReportActionsHandle,
  type WorkedTimeDraft,
} from '@/components/ActivityWorkReportPanel';
import ActivityDeliveryNotePreviewModal from '@/components/ActivityDeliveryNotePreviewModal';
import DocumentFormModal, { type DocumentCreationMode } from '@/components/DocumentFormModal';
import ModalHeader from '@/components/ModalHeader';
import { ModalActions, ModalFooter, modalBtnPrimary } from '@/components/ModalFooter';
import ModalOverlay from '@/components/ModalOverlay';
import ActivityAttachmentsPanel from '@/components/ActivityAttachmentsPanel';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Select } from '@/components/forms';
import SearchableSelect from '@/components/SearchableSelect';
import { Input, Textarea } from '@/components/forms';
import {
  canCreateActivityDeliveryNote,
  canAdminGenerateActivityInvoice,
  canAdminUpdateActivityInvoiceFromDeliveryNotes,
  activityHasLinkedDeliveryNote,
} from '@/lib/activityDocumentModalOptions';
import { syncActivityDocumentLinks } from '@/lib/documentLinks';
import { openDocumentPdf, openDocumentPdfLocally } from '@/lib/documentPdf';
import { navigationStateForReturn } from '@/lib/navigation';
import {
  getActivityDeliveryNotePreviewViewDisabledReason,
  useActivityDeliveryNotePreview,
} from '@/hooks/useActivityDeliveryNotePreview';
import styles from '@/pages/Calendar.module.css';

type ActivityFormModalProps = {
  eventToEdit: CalendarEvent | null;
  activityToEdit?: Activity | null;
  duplicateFrom?: Activity | null;
  initialDate?: string;
  initialClientId?: string;
  initialLinkedDocumentIds?: string[];
  directForm?: boolean;
  initialEditMode?: boolean;
  initialFocusSection?: ActivityModalFocusSection;
  onClose: () => void;
  onSaved: (activity?: Activity) => void;
  /** Mantiene sincronizado el activity del provider tras firmar sin cerrar el modal. */
  onActivityUpdated?: (activity: Activity) => void;
};

function buildDuplicateDescription(description: string): string {
  const base = description.trim();
  return base ? `${base}-copy` : '-copy';
}

type AssigneeSlotForm = {
  shift: ShiftCode | '';
  startTime: string;
  endTime: string;
};

function slotsToAssigneeFormRecord(
  slots: ActivityAssigneeSlot[],
): Record<string, AssigneeSlotForm> {
  return Object.fromEntries(
    slots.map((slot) => [
      slot.userId,
      { shift: slot.shift, startTime: slot.startTime, endTime: slot.endTime },
    ]),
  );
}

const ACTIVITY_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidActivityTime(value: string): boolean {
  return ACTIVITY_TIME_RE.test(value);
}

function formSlotsToActivitySlots(
  assignedTo: string[],
  assigneeSlots: Record<string, AssigneeSlotForm>,
): ActivityAssigneeSlot[] {
  return assignedTo
    .map((userId) => {
      const row = assigneeSlots[userId];
      if (!row || !isShiftCode(row.shift)) return null;
      if (!ACTIVITY_PLANNING_SHIFT_CODES.includes(row.shift)) return null;
      if (!isValidActivityTime(row.startTime) || !isValidActivityTime(row.endTime)) return null;
      return {
        userId,
        shift: row.shift,
        startTime: row.startTime,
        endTime: row.endTime,
      };
    })
    .filter((slot): slot is ActivityAssigneeSlot => slot !== null);
}

function workerSignatureForAssignee(
  userId: string,
  slot: ActivityAssigneeSlot | undefined,
  legacySignature: Activity['workerSignature'] | undefined,
  hasSlotSignatures: boolean,
) {
  if (slot?.workerSignature?.imageDataUrl?.trim()) return slot.workerSignature;
  if (
    !hasSlotSignatures &&
    legacySignature?.userId === userId &&
    legacySignature.imageDataUrl?.trim()
  ) {
    return legacySignature;
  }
  return undefined;
}

type RealWorkedTimeInput = {
  hours: string;
  minutes: string;
};

const EMPTY_REAL_WORKED_TIME: RealWorkedTimeInput = { hours: '', minutes: '' };

function parseBoundedInt(raw: string, max: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

function parseRealWorkedTimeInput(hoursRaw: string, minutesRaw: string): number {
  const hours = parseBoundedInt(hoursRaw, 24);
  const minutes = parseBoundedInt(minutesRaw, 59);
  const total = hours + minutes / 60;
  if (total <= 0) return 0;
  return Math.round(total * 60) / 60;
}

function sanitizeRealWorkedHoursInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return String(Math.min(24, Math.max(0, parseBoundedInt(trimmed, 24))));
}

function sanitizeRealWorkedMinutesInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return String(Math.min(59, Math.max(0, parseBoundedInt(trimmed, 59))));
}

function preserveAssigneeSlotSignatures(
  slots: ActivityAssigneeSlot[],
  existingSlots?: ActivityAssigneeSlot[] | null,
): ActivityAssigneeSlot[] {
  if (!existingSlots?.length) return slots;
  const signaturesByUser = new Map(
    existingSlots
      .filter((slot) => slot.workerSignature?.imageDataUrl?.trim())
      .map((slot) => [slot.userId, slot.workerSignature] as const),
  );
  return slots.map((slot) => {
    const workerSignature = signaturesByUser.get(slot.userId);
    return workerSignature ? { ...slot, workerSignature } : slot;
  });
}

function resolveAssigneeSlotsForSave(
  assignedTo: string[],
  assigneeSlots: Record<string, AssigneeSlotForm>,
  shiftsByUserId: Map<string, ShiftCode>,
  shiftEventTimes: Record<ShiftCode, { startTime: string; endTime: string }>,
): ActivityAssigneeSlot[] | null {
  let slots = formSlotsToActivitySlots(assignedTo, assigneeSlots);
  if (slots.length < assignedTo.length) {
    slots = assignedTo
      .map((userId) => {
        const existing = slots.find((slot) => slot.userId === userId);
        if (existing) return existing;
        const draft = defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
        if (!isShiftCode(draft.shift) || !ACTIVITY_PLANNING_SHIFT_CODES.includes(draft.shift)) {
          return null;
        }
        return {
          userId,
          shift: draft.shift,
          startTime: draft.startTime,
          endTime: draft.endTime,
        };
      })
      .filter((slot): slot is ActivityAssigneeSlot => slot !== null);
  }
  if (slots.length !== assignedTo.length) return null;
  return slots;
}

function resolveSimpleAssigneeSlotsForSave(
  assignedTo: string[],
  assigneeSlots: Record<string, AssigneeSlotForm>,
  currentUserId: string,
): ActivityAssigneeSlot[] | null {
  const ids = assignedTo.length > 0 ? assignedTo : [currentUserId];
  if (ids.length === 0) return null;

  const slots: ActivityAssigneeSlot[] = [];
  for (const userId of ids) {
    const row = assigneeSlots[userId];
    const startTime = row?.startTime?.trim() ?? '';
    const endTime = row?.endTime?.trim() ?? '';
    if (!isValidActivityTime(startTime) || !isValidActivityTime(endTime)) return null;
    slots.push({ userId, shift: 'L', startTime, endTime });
  }
  return slots;
}

function linkedDocumentIdsForClient(
  linkedIds: string[],
  clientId: string,
  documents: Document[],
): string[] {
  return linkedIds.filter((id) => {
    const doc = documents.find((item) => item.id === id);
    return doc?.clientId === clientId;
  });
}

function resolveAssigneeUsers(
  userIds: string[],
  users: UserAssignee[],
  activity?: Activity | null,
): UserAssignee[] {
  return userIds.map((userId) => {
    const known = users.find((user) => user.id === userId);
    if (known) return known;
    const report = activity ? getActivityWorkReport(activity, userId) : undefined;
    return {
      id: userId,
      name: report?.userName?.trim() || 'Operario',
      avatarUrl: undefined,
    };
  });
}

function defaultAssigneeSlot(
  userId: string,
  shiftsByUserId: Map<string, ShiftCode>,
  shiftEventTimes: Record<ShiftCode, { startTime: string; endTime: string }>,
): AssigneeSlotForm {
  const planned = shiftsByUserId.get(userId);
  const shift =
    planned && ACTIVITY_PLANNING_SHIFT_CODES.includes(planned) ? planned : 'M';
  const { startTime, endTime } = shiftEventTimes[shift];
  return { shift, startTime, endTime };
}

function parseWorkedTimePart(raw: string, max: number): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, value);
}

function timeToMinutesLocal(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(':').map((part) => Number.parseInt(part, 10));
  if ([h, m].some((n) => Number.isNaN(n))) return null;
  return h * 60 + m;
}

function minutesToTimeHHmm(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function endTimeFromStartAndWorkedMinutes(
  startTime: string,
  workedMinutes: number,
): string | null {
  const start = timeToMinutesLocal(startTime);
  if (start == null || workedMinutes <= 0) return null;
  return minutesToTimeHHmm(start + workedMinutes);
}

function resolveWorkReportScheduleForUser(
  userId: string,
  activitySlots: ActivityAssigneeSlot[],
  savedAssigneeSlots: ActivityAssigneeSlot[],
  formAssigneeSlots: Record<string, AssigneeSlotForm>,
  eventTimeRange: { startTime: string; endTime: string },
  assignedUserIds: string[],
): { startTime: string; endTime: string } {
  const displaySlot = activitySlots.find((slot) => slot.userId === userId);
  if (
    displaySlot &&
    isValidActivityTime(displaySlot.startTime) &&
    isValidActivityTime(displaySlot.endTime)
  ) {
    return { startTime: displaySlot.startTime, endTime: displaySlot.endTime };
  }

  const saved = savedAssigneeSlots.find((slot) => slot.userId === userId);
  if (saved && isValidActivityTime(saved.startTime) && isValidActivityTime(saved.endTime)) {
    return { startTime: saved.startTime, endTime: saved.endTime };
  }

  if (assignedUserIds.length === 1 && assignedUserIds[0] === userId) {
    const { startTime, endTime } = eventTimeRange;
    if (isValidActivityTime(startTime) && isValidActivityTime(endTime)) {
      return { startTime, endTime };
    }
  }

  const row = formAssigneeSlots[userId];
  if (row && isValidActivityTime(row.startTime) && isValidActivityTime(row.endTime)) {
    return { startTime: row.startTime, endTime: row.endTime };
  }

  return { startTime: '', endTime: '' };
}

function workedTimeDraftFromSlot(
  slot: Pick<ActivityAssigneeSlot, 'startTime' | 'endTime'>,
): WorkedTimeDraft {
  const slotHours = hoursForAssigneeSlot(slot);
  if (slotHours <= 0) return EMPTY_WORKED_TIME;
  return splitWorkedMinutes(Math.round(slotHours * 60));
}

function defaultFormData() {
  return {
    type: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    assignedTo: [] as string[],
    assigneeSlots: {} as Record<string, AssigneeSlotForm>,
    clientId: '',
  };
}

function getFormSeed(
  event: CalendarEvent | null,
  activity: Activity | null | undefined,
  duplicate: Activity | null | undefined,
): string | null {
  if (event) return `event:${event.id}`;
  if (activity) return `activity:${activity.id}`;
  if (duplicate) return `duplicate:${duplicate.id}`;
  return null;
}

export default function ActivityFormModal({
  eventToEdit,
  activityToEdit = null,
  duplicateFrom = null,
  initialDate,
  initialClientId,
  initialLinkedDocumentIds,
  directForm = false,
  initialEditMode = false,
  initialFocusSection,
  onClose,
  onSaved,
  onActivityUpdated,
}: ActivityFormModalProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifyActivitySaved } = useActivityModal();
  const [showTypeManager, setShowTypeManager] = useState(false);
  const { activityTypes, refresh: refreshActivityTypes } = useActivityTypes();
  const { boundaries, shiftEventTimes, shiftRangesLabel } = useWorkspaceScheduleSettings();
  const { workerSignaturesEnabled, shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  const deliveryNotePreview = useActivityDeliveryNotePreview();
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<UserAssignee[]>([]);
  const [formData, setFormData] = useState(() => ({
    ...defaultFormData(),
    ...(initialDate ? { date: initialDate } : {}),
    ...(initialClientId ? { clientId: initialClientId } : {}),
  }));
  const [clientDocuments, setClientDocuments] = useState<Document[]>([]);
  const [linkedDocumentIds, setLinkedDocumentIds] = useState<string[]>(
    () => initialLinkedDocumentIds ?? [],
  );
  const [resolvedActivityId, setResolvedActivityId] = useState<string | undefined>();
  const [linkedActivity, setLinkedActivity] = useState<Activity | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<CalendarEvent | null>(null);
  const [changingType, setChangingType] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [documentModal, setDocumentModal] = useState<{
    type: 'create' | 'duplicate' | 'edit';
    creationMode?: DocumentCreationMode;
    editingDoc?: Document;
    reloadFromDeliveryNotes?: boolean;
  } | null>(null);
  const [duplicateSourceInvoice, setDuplicateSourceInvoice] = useState<Document | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingDocLinks, setSyncingDocLinks] = useState(false);
  const [linkingDocumentsInView, setLinkingDocumentsInView] = useState(false);
  const [documentLinkError, setDocumentLinkError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [realWorkedTimeByUser, setRealWorkedTimeByUser] = useState<
    Record<string, RealWorkedTimeInput>
  >({});
  const [workReportWorkedTimeByUser, setWorkReportWorkedTimeByUser] = useState<
    Record<string, WorkedTimeDraft>
  >({});
  const [signatureCancelConfirm, setSignatureCancelConfirm] = useState<
    | { scope: 'all' }
    | { scope: 'user'; userId: string; userName: string }
    | null
  >(null);
  const [savingSlotUserId, setSavingSlotUserId] = useState<string | null>(null);
  const [editingSlotUserId, setEditingSlotUserId] = useState<string | null>(null);
  const [shiftsByUserId, setShiftsByUserId] = useState<Map<string, ShiftCode>>(new Map());
  const formSeedRef = useRef<string | null>(null);
  const editModeSeedRef = useRef<string | null>(null);
  const activityEnrichedRef = useRef<string | null>(null);
  const isEditModeRef = useRef(false);
  const persistedDuringCreateRef = useRef(false);
  const workReportActionsRef = useRef<ActivityWorkReportActionsHandle | null>(null);

  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  const completeSaved = (activity?: Activity) => {
    setShowTypeManager(false);
    setDocumentModal(null);
    setDuplicateSourceInvoice(null);
    setDeleteConfirm(null);
    onSaved(activity);
  };

  const loadReferenceData = useCallback(async () => {
    const [clientsResult, usersResult] = await Promise.allSettled([
      clientsService.getAll(),
      usersService.getAssignees(),
    ]);

    if (clientsResult.status === 'fulfilled') {
      setClients(clientsResult.value);
    }

    if (usersResult.status === 'fulfilled') {
      setUsers(usersResult.value);
    } else if (isAdmin) {
      try {
        const allUsers = await usersService.getAll();
        setUsers(allUsers.map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl })));
      } catch {
        setUsers([]);
      }
    } else if (currentUser) {
      setUsers([
        {
          id: currentUser.id,
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
        },
      ]);
    } else {
      setUsers([]);
    }

    await refreshActivityTypes();
  }, [refreshActivityTypes, isAdmin]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    if (
      isAdmin ||
      shiftSchedulingEnabled ||
      eventToEdit ||
      activityToEdit ||
      duplicateFrom ||
      !currentUser
    ) {
      return;
    }
    setFormData((prev) => {
      if (prev.assignedTo.length > 0) return prev;
      const slot = defaultAssigneeSlot(currentUser.id, new Map(), shiftEventTimes);
      return {
        ...prev,
        assignedTo: [currentUser.id],
        assigneeSlots: { [currentUser.id]: slot },
      };
    });
  }, [
    isAdmin,
    shiftSchedulingEnabled,
    eventToEdit,
    activityToEdit,
    duplicateFrom,
    currentUser,
    shiftEventTimes,
  ]);

  useEffect(() => {
    if (!shiftSchedulingEnabled) {
      setShiftsByUserId(new Map());
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) return;
    let cancelled = false;

    const loadShifts = async () => {
      try {
        const entries = isAdmin
          ? await userSchedulesService.getWorkspaceRange(formData.date, formData.date)
          : await userSchedulesService.getRange(formData.date, formData.date);
        if (cancelled) return;
        const map = new Map<string, ShiftCode>();
        for (const entry of entries) {
          map.set(entry.userId, entry.shift);
        }
        setShiftsByUserId(map);
      } catch {
        if (!cancelled) setShiftsByUserId(new Map());
      }
    };

    void loadShifts();
    return () => {
      cancelled = true;
    };
  }, [formData.date, isAdmin, shiftSchedulingEnabled]);

  useEffect(() => {
    const seed = getFormSeed(eventToEdit, activityToEdit, duplicateFrom);

    if (seed && seed !== formSeedRef.current) {
      formSeedRef.current = seed;
      activityEnrichedRef.current = null;
      persistedDuringCreateRef.current = false;
      const preserveAssignees = isEditModeRef.current;

      if (eventToEdit) {
        setLinkedEvent(null);
        setLinkedActivity(activityToEdit);
        setResolvedActivityId(eventToEdit.activityId ?? activityToEdit?.id);

        const typeId =
          activityToEdit?.type ||
          parseEventTypeIdFromTitle(eventToEdit.title, activityTypes);
        const slots = activityToEdit
          ? normalizeActivityAssigneeSlots(activityToEdit, eventToEdit, boundaries)
          : buildAssigneeSlotsFromLegacy(eventToEdit, null, boundaries);
        setFormData((current) => ({
          type: typeId,
          description: eventToEdit.description,
          date: eventToEdit.date,
          clientId: eventToEdit.clientId || activityToEdit?.clientId || current.clientId || '',
          ...(preserveAssignees
            ? {}
            : {
                assignedTo: getAssigneeIdsFromSlots(slots),
                assigneeSlots: slotsToAssigneeFormRecord(slots),
              }),
        }));
        setShowTypeManager(false);
        return;
      }

      if (activityToEdit) {
        setLinkedEvent(null);
        setLinkedActivity(activityToEdit);
        setResolvedActivityId(activityToEdit.id);
        const slots = normalizeActivityAssigneeSlots(activityToEdit, null, boundaries);
        setFormData((current) => ({
          type: activityToEdit.type,
          description: activityToEdit.description,
          date: activityToEdit.date,
          clientId: activityToEdit.clientId,
          ...(preserveAssignees
            ? {}
            : {
                assignedTo: getAssigneeIdsFromSlots(slots),
                assigneeSlots: slotsToAssigneeFormRecord(slots),
              }),
        }));
        setShowTypeManager(false);
        return;
      }

      if (duplicateFrom) {
        setLinkedEvent(null);
        setLinkedActivity(null);
        setResolvedActivityId(undefined);
        setLinkedDocumentIds([]);
        const slots = normalizeActivityAssigneeSlots(duplicateFrom, null, boundaries);
        const assigneeIds =
          currentUser && !isAdmin
            ? [currentUser.id]
            : getAssigneeIdsFromSlots(slots);
        const slotRecord = slotsToAssigneeFormRecord(slots);
        const assigneeSlots: Record<string, AssigneeSlotForm> = {};
        for (const userId of assigneeIds) {
          assigneeSlots[userId] =
            slotRecord[userId] ?? defaultAssigneeSlot(userId, new Map(), shiftEventTimes);
        }
        setFormData({
          type: duplicateFrom.type,
          description: buildDuplicateDescription(duplicateFrom.description),
          date: duplicateFrom.date,
          assignedTo: assigneeIds,
          assigneeSlots,
          clientId: duplicateFrom.clientId,
        });
        setShowTypeManager(false);
      }
      return;
    }

    if (eventToEdit && activityTypes.length > 0) {
      const typeId =
        activityToEdit?.type ||
        parseEventTypeIdFromTitle(eventToEdit.title, activityTypes);
      if (typeId) {
        setFormData((current) => (current.type ? current : { ...current, type: typeId }));
      }
    }
  }, [eventToEdit, activityToEdit, duplicateFrom, activityTypes, currentUser, isAdmin, boundaries, shiftEventTimes]);

  useEffect(() => {
    isEditModeRef.current = isEditMode;
  }, [isEditMode]);

  useEffect(() => {
    const seed =
      getFormSeed(eventToEdit, activityToEdit, duplicateFrom) ??
      `${directForm ? 'direct' : 'new'}:${initialDate ?? ''}`;

    if (seed === editModeSeedRef.current) return;

    editModeSeedRef.current = seed;
    setChangingType(false);
    setIsEditMode(initialEditMode);
    setLinkingDocumentsInView(false);
    setEditingSlotUserId(null);
    setSaveError(null);
  }, [eventToEdit, activityToEdit, duplicateFrom, directForm, initialEditMode, initialDate]);

  useEffect(() => {
    if (!initialFocusSection) return;
    if (!eventToEdit && !activityToEdit && !linkedActivity) return;

    const needsEditMode =
      initialFocusSection === 'assignees' ||
      (initialFocusSection === 'documents' && isEditMode);
    if (needsEditMode && !isEditMode) return;

    const sectionId =
      initialFocusSection === 'documents'
        ? isEditMode
          ? 'activity-section-documents'
          : 'activity-view-documents'
        : initialFocusSection === 'assignees'
          ? 'activity-section-assignees'
          : initialFocusSection === 'workReport'
            ? 'activity-view-work-report'
            : null;
    if (!sectionId) return;

    const frameId = requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frameId);
  }, [
    initialFocusSection,
    isEditMode,
    eventToEdit,
    activityToEdit,
    linkedActivity,
    resolvedActivityId,
    formData.clientId,
  ]);

  useEffect(() => {
    if (!eventToEdit || activityToEdit || activityTypes.length === 0) return;

    const typeId = parseEventTypeIdFromTitle(eventToEdit.title, activityTypes);
    setFormData((current) => {
      if (current.type) return current;
      return typeId ? { ...current, type: typeId } : current;
    });
  }, [eventToEdit, activityToEdit, activityTypes]);

  useEffect(() => {
    const clientId = eventToEdit?.clientId;
    if (!eventToEdit || !clientId || activityToEdit) return;
    if (activityEnrichedRef.current === eventToEdit.id) return;

    let cancelled = false;
    activitiesService.getByClientId(clientId).then((activities) => {
      if (cancelled) return;

      let activity: Activity | undefined;
      if (eventToEdit.activityId) {
        activity = activities.find((item) => item.id === eventToEdit.activityId);
      }
      if (!activity) {
        activity = activities.find(
          (item) =>
            item.date === eventToEdit.date && item.description === eventToEdit.description,
        );
      }

      if (!activity) return;

      activityEnrichedRef.current = eventToEdit.id;
      setLinkedActivity(activity);
      setResolvedActivityId(activity.id);
      const slots = normalizeActivityAssigneeSlots(activity, eventToEdit, boundaries);
      setFormData((current) => ({
        ...current,
        type: activity.type || current.type,
        clientId: current.clientId || activity.clientId || eventToEdit.clientId || '',
        ...(isEditModeRef.current
          ? {}
          : {
              assignedTo: getAssigneeIdsFromSlots(slots),
              assigneeSlots: slotsToAssigneeFormRecord(slots),
            }),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [eventToEdit, activityToEdit, boundaries]);

  useEffect(() => {
    if (!formData.clientId) {
      setClientDocuments([]);
      setLinkedDocumentIds([]);
      return;
    }

    let cancelled = false;
    documentsService.getByClientId(formData.clientId).then((docs) => {
      if (cancelled) return;
      setClientDocuments(docs);
    });
    return () => {
      cancelled = true;
    };
  }, [formData.clientId]);

  const refreshClientDocuments = useCallback(async () => {
    if (!formData.clientId) return;
    const docs = await documentsService.getByClientId(formData.clientId);
    setClientDocuments(docs);
  }, [formData.clientId]);

  const handleDocumentSaved = async (doc: Document) => {
    await refreshClientDocuments();
    setLinkedDocumentIds((current) =>
      current.includes(doc.id) ? current : [...current, doc.id],
    );
    setDocumentModal(null);
    setDuplicateSourceInvoice(null);
  };

  useEffect(() => {
    if (!resolvedActivityId || clientDocuments.length === 0) {
      if (!resolvedActivityId) setLinkedDocumentIds([]);
      return;
    }

    setLinkedDocumentIds(
      clientDocuments.filter((doc) => doc.activityId === resolvedActivityId).map((doc) => doc.id),
    );
  }, [resolvedActivityId, clientDocuments]);

  const clientsMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.id,
        label: client.name,
        hint: client.email || client.phone || undefined,
      })),
    [clients],
  );

  const selectedType = resolveActivityType(formData.type, activityTypes);
  const selectedTypeCreatesDeliveryNote = activityTypeCreatesDeliveryNote(selectedType);
  const selectedTypeUsesWorkReport = activityTypeUsesWorkReport(selectedType);
  const selectedTypeEmoji = selectedType ? getActivityEmoji(selectedType.icon) : null;
  const activeActivity = linkedActivity ?? activityToEdit;
  const activeEvent = eventToEdit ?? linkedEvent;

  const activeActivityType = resolveActivityType(
    activeActivity?.type ?? formData.type,
    activityTypes,
  );
  const activeTypeCreatesDeliveryNote = activityTypeCreatesDeliveryNote(activeActivityType);
  const activeTypeUsesWorkReport = activityTypeUsesWorkReport(activeActivityType);
  const isExisting = Boolean(eventToEdit || activityToEdit || linkedActivity);
  const typeUsesWorkReport = isExisting ? activeTypeUsesWorkReport : selectedTypeUsesWorkReport;
  const activityDetailsSectionTitle = typeUsesWorkReport ? 'Informe de Trabajo' : 'Evento';
  const canEdit = isExisting
    ? canEditActivity(currentUser, { activity: activeActivity, event: activeEvent })
    : true;
  const canManageFinishedDocuments =
    isExisting && activeActivity
      ? canManageFinishedActivityDocuments(currentUser, {
          activity: activeActivity,
          event: activeEvent,
        })
      : false;
  const canManageDocuments = canEdit || canManageFinishedDocuments;
  const canManageWorkReportExtraItems = Boolean(
    currentUser &&
      activeActivity &&
      canEditActivityWorkReportExtraItems(currentUser, {
        activity: activeActivity,
        event: activeEvent,
        documents: clientDocuments,
      }),
  );
  const showViewMode = isExisting && !isEditMode && !persistedDuringCreateRef.current;
  const isEditing = isExisting && isEditMode;
  const isPastActivity = isExisting
    ? isActivityPast({ activity: activeActivity, event: activeEvent })
    : false;
  const activityEndDate = isExisting
    ? getActivityEndDate({ activity: activeActivity, event: activeEvent })
    : null;
  const activityPastAgo =
    showViewMode && isPastActivity && activityEndDate
      ? formatDistanceToNow(activityEndDate, { addSuffix: true, locale: es })
      : null;

  const handleRequestClose = useCallback(() => {
    if (isEditing) {
      setSaveError(null);
      setChangingType(false);
      setLinkingDocumentsInView(false);
      setEditingSlotUserId(null);
      isEditModeRef.current = false;
      formSeedRef.current = null;
      setIsEditMode(false);
      return;
    }
    onClose();
  }, [isEditing, onClose]);

  usePopupEscape(true, handleRequestClose);

  const activityIdForLinks = resolvedActivityId ?? eventToEdit?.activityId;
  const canAssociateActivityDocuments = Boolean(
    isAdmin && formData.clientId && activityIdForLinks,
  );

  const openCreateDocument = useCallback((creationMode: DocumentCreationMode = 'generate') => {
    setDocumentModal({ type: 'create', creationMode });
  }, []);

  const openDuplicateInvoice = useCallback(
    (invoiceId: string) => {
      const source = clientDocuments.find(
        (doc) => doc.id === invoiceId && doc.type === 'invoice',
      );
      if (!source) return;
      setDuplicateSourceInvoice(source);
      setDocumentModal({ type: 'duplicate' });
    },
    [clientDocuments],
  );

  const persistDocumentLinks = useCallback(
    async (ids: string[]) => {
      if (!activityIdForLinks || !formData.clientId) return;
      setSyncingDocLinks(true);
      setDocumentLinkError(null);
      try {
        await syncActivityDocumentLinks(activityIdForLinks, ids, clientDocuments);
        await refreshClientDocuments();
      } catch (error) {
        setDocumentLinkError(
          error instanceof Error ? error.message : 'No se pudieron guardar los vínculos.',
        );
      } finally {
        setSyncingDocLinks(false);
      }
    },
    [activityIdForLinks, formData.clientId, clientDocuments, refreshClientDocuments],
  );

  const updateAssigneeSlot = useCallback(
    (userId: string, patch: Partial<AssigneeSlotForm>) => {
      setFormData((current) => {
        const prev =
          current.assigneeSlots[userId] ??
          defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [userId]: { ...prev, ...patch },
          },
        };
      });
    },
    [shiftsByUserId, shiftEventTimes],
  );

  const applyAssigneeTimeRange = useCallback(
    (userId: string, patch: { startTime?: string; endTime?: string }) => {
      setFormData((current) => {
        const prev =
          current.assigneeSlots[userId] ??
          defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
        const startTime = patch.startTime ?? prev.startTime;
        const endTime = patch.endTime ?? prev.endTime;
        const { shift } = resolveActivityScheduleFromTimes(startTime, endTime, boundaries);
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [userId]: {
              ...prev,
              startTime,
              endTime,
              shift:
                shift && ACTIVITY_PLANNING_SHIFT_CODES.includes(shift) ? shift : prev.shift,
            },
          },
        };
      });
    },
    [shiftsByUserId, shiftEventTimes, boundaries],
  );

  const applySimpleAssigneeTimeRange = useCallback(
    (userId: string, patch: { startTime?: string; endTime?: string }) => {
      setFormData((current) => {
        const prev =
          current.assigneeSlots[userId] ??
          defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
        const startTime = patch.startTime ?? prev.startTime;
        const endTime = patch.endTime ?? prev.endTime;
        const nextSlot: AssigneeSlotForm = { ...prev, shift: 'L', startTime, endTime };
        if (activeTypeUsesWorkReport) {
          setWorkReportWorkedTimeByUser((prevWorked) => ({
            ...prevWorked,
            [userId]: workedTimeDraftFromSlot(nextSlot),
          }));
        }
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [userId]: nextSlot,
          },
        };
      });
    },
    [activeTypeUsesWorkReport, shiftsByUserId, shiftEventTimes],
  );

  const applySimpleSharedTimeRange = useCallback(
    (patch: { startTime?: string; endTime?: string }) => {
      setFormData((current) => {
        const assignedIds =
          current.assignedTo.length > 0
            ? current.assignedTo
            : currentUser
              ? [currentUser.id]
              : [];
        if (assignedIds.length !== 1 || !currentUser) return current;

        const userId = assignedIds[0]!;
        const prev =
          current.assigneeSlots[userId] ??
          defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
        const startTime = patch.startTime ?? prev.startTime;
        const endTime = patch.endTime ?? prev.endTime;
        const nextSlot: AssigneeSlotForm = {
          ...prev,
          shift: 'L',
          startTime,
          endTime,
        };
        if (activeTypeUsesWorkReport) {
          setWorkReportWorkedTimeByUser((prevWorked) => ({
            ...prevWorked,
            [userId]: workedTimeDraftFromSlot(nextSlot),
          }));
        }
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [userId]: nextSlot,
          },
        };
      });
    },
    [activeTypeUsesWorkReport, currentUser, shiftsByUserId, shiftEventTimes],
  );

  const applyAssigneeShift = useCallback(
    (userId: string, shift: ShiftCode | '') => {
      if (!shift || !isShiftCode(shift)) {
        updateAssigneeSlot(userId, { shift: '' });
        return;
      }
      const { startTime, endTime } = shiftEventTimes[shift];
      updateAssigneeSlot(userId, { shift, startTime, endTime });
    },
    [shiftEventTimes, updateAssigneeSlot],
  );

  const toggleAssignee = useCallback(
    (userId: string, selected: boolean) => {
      setFormData((current) => {
        if (selected) {
          let slot =
            current.assigneeSlots[userId] ??
            defaultAssigneeSlot(userId, shiftsByUserId, shiftEventTimes);
          if (!shiftSchedulingEnabled) {
            const referenceId = current.assignedTo[0];
            const reference = referenceId
              ? current.assigneeSlots[referenceId]
              : currentUser
                ? current.assigneeSlots[currentUser.id]
                : null;
            if (reference) {
              slot = {
                ...slot,
                shift: 'L',
                startTime: reference.startTime,
                endTime: reference.endTime,
              };
            } else {
              slot = { ...slot, shift: 'L' };
            }
          }
          return {
            ...current,
            assignedTo: current.assignedTo.includes(userId)
              ? current.assignedTo
              : [...current.assignedTo, userId],
            assigneeSlots: { ...current.assigneeSlots, [userId]: slot },
          };
        }
        const { [userId]: _removed, ...restSlots } = current.assigneeSlots;
        return {
          ...current,
          assignedTo: current.assignedTo.filter((id) => id !== userId),
          assigneeSlots: restSlots,
        };
      });
    },
    [shiftsByUserId, shiftEventTimes, shiftSchedulingEnabled, currentUser],
  );

  const savedAssigneeSlots = useMemo(
    () =>
      activeActivity
        ? normalizeActivityAssigneeSlots(activeActivity, activeEvent, boundaries)
        : [],
    [activeActivity, activeEvent, boundaries],
  );

  const savedAssigneeIds = useMemo(
    () => getAssigneeIdsFromSlots(savedAssigneeSlots),
    [savedAssigneeSlots],
  );

  const effectiveAssigneeIds = useMemo(() => {
    if (isEditMode || !isExisting) return formData.assignedTo;
    return savedAssigneeIds.length > 0 ? savedAssigneeIds : formData.assignedTo;
  }, [isEditMode, isExisting, formData.assignedTo, savedAssigneeIds]);

  const activitySlots = useMemo(
    () =>
      resolveActivitySlotsForDisplay(
        effectiveAssigneeIds,
        formData.assigneeSlots,
        savedAssigneeSlots,
        boundaries,
      ),
    [effectiveAssigneeIds, formData.assigneeSlots, savedAssigneeSlots, boundaries],
  );

  const totalActivityHours = useMemo(
    () => totalHoursFromAssigneeSlots(activitySlots),
    [activitySlots],
  );

  const eventTimeRange = useMemo(
    () => aggregateEventTimeRange(activitySlots),
    [activitySlots],
  );

  const calendarSpanHours = useMemo(
    () => hoursForAssigneeSlot(eventTimeRange),
    [eventTimeRange],
  );

  const showAssigneesEditSection = shiftSchedulingEnabled || isExisting || isAdmin;

  useEffect(() => {
    if (isEditMode || !isExisting || savedAssigneeSlots.length === 0) return;

    const savedIds = getAssigneeIdsFromSlots(savedAssigneeSlots);
    const savedSlotsRecord = slotsToAssigneeFormRecord(savedAssigneeSlots);

    setFormData((current) => {
      const idsMatch =
        current.assignedTo.length === savedIds.length &&
        savedIds.every((id) => current.assignedTo.includes(id));
      if (idsMatch) return current;

      return {
        ...current,
        assignedTo: savedIds,
        assigneeSlots: { ...savedSlotsRecord, ...current.assigneeSlots },
      };
    });
  }, [isEditMode, isExisting, savedAssigneeSlots]);

  useEffect(() => {
    if (!isEditMode || !isExisting) return;
    if (formData.assignedTo.length > 0) return;

    const slots =
      savedAssigneeSlots.length > 0
        ? savedAssigneeSlots
        : activeActivity
          ? normalizeActivityAssigneeSlots(activeActivity, activeEvent, boundaries)
          : activeEvent
            ? buildAssigneeSlotsFromLegacy(activeEvent, activeActivity, boundaries)
            : [];

    if (slots.length === 0) {
      if (!activeActivity?.userId) return;
      const slot = defaultAssigneeSlot(activeActivity.userId, shiftsByUserId, shiftEventTimes);
      setFormData((current) => ({
        ...current,
        assignedTo: [activeActivity.userId],
        assigneeSlots: { ...current.assigneeSlots, [activeActivity.userId]: slot },
      }));
      return;
    }

    setFormData((current) => ({
      ...current,
      assignedTo: getAssigneeIdsFromSlots(slots),
      assigneeSlots: { ...slotsToAssigneeFormRecord(slots), ...current.assigneeSlots },
    }));
  }, [
    isEditMode,
    isExisting,
    formData.assignedTo.length,
    savedAssigneeSlots,
    activeActivity,
    activeEvent,
    boundaries,
    shiftsByUserId,
    shiftEventTimes,
  ]);

  const handleLinkedDocumentsChange = useCallback(
    (ids: string[]) => {
      if (isAdmin && activityIdForLinks) {
        const linkError = validateActivityInvoiceRequiresDeliveryNote(
          clientDocuments,
          activityIdForLinks,
          ids,
        );
        if (linkError) {
          setDocumentLinkError(linkError);
          return;
        }
      }
      setDocumentLinkError(null);
      setLinkedDocumentIds(ids);
      if (showViewMode && isAdmin) {
        void persistDocumentLinks(ids);
      }
    },
    [isAdmin, activityIdForLinks, clientDocuments, showViewMode, persistDocumentLinks],
  );

  const syncLinkedCalendarEvent = useCallback(
    async (
      activityId: string,
      activity: Activity,
      eventPayload: {
        title: string;
        description: string;
        date: string;
        startTime: string;
        endTime: string;
        assignedTo: string[];
        clientId: string;
      },
      knownEvent: CalendarEvent | null | undefined,
    ) => {
      let linkedEvent = knownEvent ?? null;
      if (!linkedEvent || linkedEvent.activityId !== activityId) {
        const allEvents = await eventsService.getAll();
        linkedEvent = findEventForActivity({ ...activity, id: activityId }, allEvents) ?? null;
      }
      if (!linkedEvent) return;

      await eventsService.update(linkedEvent.id, {
        ...eventPayload,
        activityId,
      });
    },
    [],
  );

  const resolveActivitySaveDraft = useCallback(():
    | { error: string }
    | {
        activityPatch: {
          clientId: string;
          date: string;
          type: string;
          description: string;
          hours: number;
          assigneeSlots: ActivityAssigneeSlot[];
          userId: string;
        };
        eventPayload: {
          title: string;
          description: string;
          date: string;
          startTime: string;
          endTime: string;
          assignedTo: string[];
          clientId: string;
        };
        assigneeSlotsToSave: ActivityAssigneeSlot[];
      } => {
    if (!currentUser || !formData.type) {
      return { error: 'Selecciona el tipo de actividad.' };
    }
    if (!formData.clientId) {
      return { error: 'Selecciona un contacto antes de vincular documentos.' };
    }

    const client = clientsMap.get(formData.clientId);
    const title = buildActivityEventTitle(formData.type, activityTypes, client?.name);
    if (isAdmin && formData.assignedTo.length === 0) {
      return { error: 'Selecciona al menos un operario.' };
    }
    const assignedTo = isAdmin
      ? formData.assignedTo
      : shiftSchedulingEnabled
        ? formData.assignedTo.length > 0
          ? formData.assignedTo
          : [currentUser.id]
        : [currentUser.id];
    const assigneeSlots = shiftSchedulingEnabled
      ? resolveAssigneeSlotsForSave(
          assignedTo,
          formData.assigneeSlots,
          shiftsByUserId,
          shiftEventTimes,
        )
      : resolveSimpleAssigneeSlotsForSave(
          assignedTo,
          formData.assigneeSlots,
          currentUser.id,
        );
    if (!assigneeSlots) {
      return {
        error: shiftSchedulingEnabled
          ? 'Cada operario asignado debe tener un turno y un tramo horario.'
          : 'Indica un tramo horario valido.',
      };
    }

    const assigneeSlotsToSave = preserveAssigneeSlotSignatures(
      assigneeSlots,
      activeActivity?.assigneeSlots,
    );
    const { startTime, endTime } = aggregateEventTimeRange(assigneeSlotsToSave);
    const hours = totalHoursFromAssigneeSlots(assigneeSlotsToSave);

    return {
      activityPatch: {
        clientId: formData.clientId,
        date: formData.date,
        type: formData.type,
        description: formData.description,
        hours,
        assigneeSlots: assigneeSlotsToSave,
        userId: assigneeSlotsToSave[0]?.userId ?? currentUser.id,
      },
      eventPayload: {
        title,
        description: formData.description,
        date: formData.date,
        startTime,
        endTime,
        assignedTo,
        clientId: formData.clientId,
      },
      assigneeSlotsToSave,
    };
  }, [
    activeActivity?.assigneeSlots,
    activityTypes,
    clientsMap,
    currentUser,
    formData.assignedTo,
    formData.assigneeSlots,
    formData.clientId,
    formData.date,
    formData.description,
    formData.type,
    isAdmin,
    shiftEventTimes,
    shiftSchedulingEnabled,
    shiftsByUserId,
  ]);

  const ensureActivityPersisted = useCallback(async (): Promise<Activity | null> => {
    if (activeActivity) return activeActivity;

    const draft = resolveActivitySaveDraft();
    if ('error' in draft) {
      setSaveError(draft.error);
      return null;
    }

    if (!currentUser) return null;

    setSaving(true);
    setSaveError(null);
    try {
      const savedActivity = await activitiesService.create({
        ...draft.activityPatch,
        attachments: [],
      });
      const persistedEvent = await eventsService.create({
        ...draft.eventPayload,
        createdBy: currentUser.id,
        activityId: savedActivity.id,
      });
      persistedDuringCreateRef.current = true;
      setLinkedActivity(savedActivity);
      setResolvedActivityId(savedActivity.id);
      setLinkedEvent(persistedEvent);
      onActivityUpdated?.(savedActivity);
      await notifyActivitySaved();
      return savedActivity;
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(error.message);
      } else if (error instanceof Error && error.message) {
        setSaveError(error.message);
      } else {
        setSaveError('No se pudo guardar la actividad');
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    activeActivity,
    currentUser,
    notifyActivitySaved,
    onActivityUpdated,
    resolveActivitySaveDraft,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !formData.type || showViewMode || saving) return;

    const client = clientsMap.get(formData.clientId);
    const title = buildActivityEventTitle(formData.type, activityTypes, client?.name);
    if (isAdmin && formData.assignedTo.length === 0) {
      setSaveError('Selecciona al menos un operario.');
      return;
    }
    const assignedTo = isAdmin
      ? formData.assignedTo
      : shiftSchedulingEnabled
        ? formData.assignedTo.length > 0
          ? formData.assignedTo
          : [currentUser.id]
        : [currentUser.id];
    const assigneeSlots = shiftSchedulingEnabled
      ? resolveAssigneeSlotsForSave(
          assignedTo,
          formData.assigneeSlots,
          shiftsByUserId,
          shiftEventTimes,
        )
      : resolveSimpleAssigneeSlotsForSave(
          assignedTo,
          formData.assigneeSlots,
          currentUser.id,
        );
    if (!assigneeSlots) {
      setSaveError(
        shiftSchedulingEnabled
          ? 'Cada operario asignado debe tener un turno y un tramo horario.'
          : 'Indica un tramo horario valido.',
      );
      return;
    }
    const linked = activeActivity;
    const assigneeSlotsToSave = preserveAssigneeSlotSignatures(
      assigneeSlots,
      linked?.assigneeSlots,
    );
    const documentIdsToLink = linkedDocumentIdsForClient(
      linkedDocumentIds,
      formData.clientId,
      clientDocuments,
    );
    const { startTime, endTime } = aggregateEventTimeRange(assigneeSlotsToSave);
    const hours = totalHoursFromAssigneeSlots(assigneeSlotsToSave);
    let activityId = eventToEdit?.activityId ?? resolvedActivityId ?? linked?.id;
    let savedActivity: Activity | undefined;
    let persistedEvent: CalendarEvent | null = eventToEdit;

    setSaving(true);
    setSaveError(null);

    const activityPatch = {
      clientId: formData.clientId,
      date: formData.date,
      type: formData.type,
      description: formData.description,
      hours,
      assigneeSlots: assigneeSlotsToSave,
      userId: assigneeSlotsToSave[0]?.userId ?? currentUser.id,
    };

    const eventPayload = {
      title,
      description: formData.description,
      date: formData.date,
      startTime,
      endTime,
      assignedTo,
      clientId: formData.clientId,
    };

    try {
      if (!eventToEdit && activityToEdit) {
        savedActivity = await activitiesService.update(activityToEdit.id, activityPatch);

        await syncLinkedCalendarEvent(
          activityToEdit.id,
          savedActivity,
          eventPayload,
          null,
        );

        if (isAdmin && formData.clientId) {
          const linkError = validateActivityInvoiceRequiresDeliveryNote(
            clientDocuments,
            activityToEdit.id,
            documentIdsToLink,
          );
          if (linkError) {
            setSaveError(linkError);
            return;
          }
          await syncActivityDocumentLinks(activityToEdit.id, documentIdsToLink, clientDocuments);
        }

        const scheduleTargets = isAdmin
          ? assigneeSlotsToSave
          : assigneeSlotsToSave.filter((slot) => slot.userId === currentUser.id);
        if (scheduleTargets.length > 0) {
          await userSchedulesService.saveBulk(
            scheduleTargets.map((slot) => ({
              userId: slot.userId,
              date: formData.date,
              shift: slot.shift,
            })),
          );
        }

        completeSaved(savedActivity);
        return;
      }

      if (eventToEdit) {
        if (!activityId && formData.clientId) {
          const clientActivities = await activitiesService.getByClientId(formData.clientId);
          const match = clientActivities.find(
            (a) => a.date === formData.date && a.description === formData.description,
          );
          activityId = match?.id;
        }

        if (!activityId && formData.clientId && formData.type) {
          savedActivity = await activitiesService.create({
            clientId: formData.clientId,
            userId: currentUser.id,
            date: formData.date,
            type: formData.type,
            description: formData.description,
            hours,
            assigneeSlots: assigneeSlotsToSave,
            attachments: [],
          });
          activityId = savedActivity.id;
        } else if (activityId) {
          savedActivity = await activitiesService.update(activityId, activityPatch);
        }

        persistedEvent = await eventsService.update(eventToEdit.id, {
          ...eventPayload,
          activityId,
        });
      } else if (resolvedActivityId || linked?.id) {
        activityId = resolvedActivityId ?? linked!.id;
        savedActivity = await activitiesService.update(activityId, activityPatch);

        if (linkedEvent) {
          persistedEvent = await eventsService.update(linkedEvent.id, {
            ...eventPayload,
            activityId,
          });
        } else {
          persistedEvent = await eventsService.create({
            ...eventPayload,
            createdBy: currentUser.id,
            activityId,
          });
          setLinkedEvent(persistedEvent);
        }
      } else {
        savedActivity = await activitiesService.create({
          clientId: formData.clientId,
          userId: currentUser.id,
          date: formData.date,
          type: formData.type,
          description: formData.description,
          hours,
          assigneeSlots: assigneeSlotsToSave,
          attachments: [],
        });
        activityId = savedActivity.id;

        persistedEvent = await eventsService.create({
          title,
          description: formData.description,
          date: formData.date,
          startTime,
          endTime,
          assignedTo,
          clientId: formData.clientId,
          createdBy: currentUser.id,
          activityId,
        });
        setLinkedEvent(persistedEvent);
      }

      const scheduleTargets = isAdmin
        ? assigneeSlotsToSave
        : assigneeSlotsToSave.filter((slot) => slot.userId === currentUser.id);
      if (scheduleTargets.length > 0) {
        await userSchedulesService.saveBulk(
          scheduleTargets.map((slot) => ({
            userId: slot.userId,
            date: formData.date,
            shift: slot.shift,
          })),
        );
        setShiftsByUserId((current) => {
          const next = new Map(current);
          for (const slot of scheduleTargets) next.set(slot.userId, slot.shift);
          return next;
        });
      }

      if (isAdmin && activityId && formData.clientId) {
        const linkError = validateActivityInvoiceRequiresDeliveryNote(
          clientDocuments,
          activityId,
          documentIdsToLink,
        );
        if (linkError) {
          setSaveError(linkError);
          return;
        }
        await syncActivityDocumentLinks(activityId, documentIdsToLink, clientDocuments);
      }

      if (
        savedActivity &&
        activityTypeUsesWorkReport(resolveActivityType(savedActivity.type, activityTypes)) &&
        isActivityPast({ activity: savedActivity, event: persistedEvent })
      ) {
        setLinkedActivity(savedActivity);
        setResolvedActivityId(savedActivity.id);
        setIsEditMode(false);
        await notifyActivitySaved();
        requestAnimationFrame(() => {
          document.getElementById('activity-view-work-report')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        });
        return;
      }

      completeSaved(savedActivity);
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(error.message);
      } else if (error instanceof TypeError) {
        setSaveError(
          'No se pudo conectar con el servidor. Comprueba que la API esté en marcha.',
        );
      } else if (error instanceof Error && error.message) {
        setSaveError(error.message);
      } else {
        setSaveError('No se pudo guardar la actividad');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    if (!canEdit || showViewMode) return;
    setDeleteConfirm(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirm || deleting) return;
    setDeleting(true);
    try {
      await eventsService.delete(deleteConfirm);
      setDeleteConfirm(null);
      completeSaved();
    } finally {
      setDeleting(false);
    }
  };

  const showTypePicker = !isExisting && !formData.type && !directForm;
  const modalTitle = showViewMode
    ? 'Actividad'
    : isEditing
      ? 'Editar Actividad'
      : showTypePicker
        ? 'Selecciona el tipo de actividad'
        : 'Nueva Actividad';

  const openTypeManager = () => {
    if (!isAdmin) return;
    setShowTypeManager(true);
  };

  const closeTypeManager = () => setShowTypeManager(false);

  const handleTypeCreated = (type: ActivityType) => {
    setFormData((current) => ({ ...current, type: type.id }));
    setChangingType(false);
    setShowTypeManager(false);
  };

  const selectedClient = formData.clientId ? clientsMap.get(formData.clientId) : undefined;
  const clientName = selectedClient?.name ?? 'Contacto desconocido';
  const linkedDocs = clientDocuments.filter((doc) => linkedDocumentIds.includes(doc.id));
  const hasLinkedDocuments = linkedDocs.length > 0;
  const canCreateDeliveryNote = Boolean(
    currentUser &&
      activeActivity &&
      canCreateActivityDeliveryNote(
        currentUser,
        activeActivity,
        linkedDocs,
        activityTypes,
        activeEvent,
      ),
  );
  const showSignatureFlow = workerSignaturesEnabled && !typeUsesWorkReport;
  const linkedDeliveryNotes = linkedDocs.filter((doc) => doc.type === 'delivery-note');
  const linkedInvoice = linkedDocs.find((doc) => doc.type === 'invoice') ?? null;

  const openCreateInvoice = useCallback(() => {
    setDocumentModal({ type: 'create', creationMode: 'generate' });
  }, []);

  const openUpdateInvoice = useCallback(() => {
    if (!linkedInvoice) return;
    setDocumentModal({
      type: 'edit',
      editingDoc: linkedInvoice,
      reloadFromDeliveryNotes: true,
    });
  }, [linkedInvoice]);

  const openEditInvoice = useCallback(() => {
    if (!linkedInvoice) return;
    setDocumentModal({
      type: 'edit',
      editingDoc: linkedInvoice,
    });
  }, [linkedInvoice]);

  const canGenerateActivityInvoice = Boolean(
    activeActivity &&
      canAdminGenerateActivityInvoice(
        currentUser,
        activeActivity,
        linkedDeliveryNotes,
        linkedInvoice,
        activeEvent,
      ),
  );
  const canUpdateActivityInvoice = Boolean(
    canAdminUpdateActivityInvoiceFromDeliveryNotes(
      currentUser,
      linkedInvoice,
      linkedDeliveryNotes,
    ),
  );
  const deliveryNotesAggregateTotals = useMemo(
    () => resolveDeliveryNotesAggregateTotals(linkedDeliveryNotes),
    [linkedDeliveryNotes],
  );
  const invoiceUpdateMismatchTooltip = useMemo(() => {
    if (!linkedInvoice || linkedDeliveryNotes.length === 0) return null;
    return getInvoiceDeliveryNotesMismatchTooltip(linkedInvoice, linkedDeliveryNotes);
  }, [linkedInvoice, linkedDeliveryNotes]);

  const invoiceDeliveryMismatchBanner = useMemo(() => {
    if (!isAdmin || !linkedInvoice || linkedDeliveryNotes.length === 0) return null;
    return formatInvoiceActivityDeliveryNotesMismatchBanner(linkedInvoice, linkedDeliveryNotes);
  }, [isAdmin, linkedInvoice, linkedDeliveryNotes]);
  const invoiceWithoutDeliveryNoteBanner = useMemo(() => {
    if (!isAdmin || !activityIdForLinks) return null;
    return getActivityInvoiceWithoutDeliveryNoteBanner(clientDocuments, activityIdForLinks);
  }, [isAdmin, activityIdForLinks, clientDocuments]);
  const linkedDocumentsExceptDeliveryNote = linkedDocs.filter(
    (doc) => doc.type !== 'delivery-note' && doc.type !== 'invoice',
  );
  const showActivityDocumentsSection = Boolean(
    activeActivity &&
      (isAdmin ||
        (!activeTypeUsesWorkReport && canManageDocuments) ||
        (activeTypeUsesWorkReport &&
          (activeTypeCreatesDeliveryNote ||
            linkedDocumentsExceptDeliveryNote.length > 0 ||
            linkedDeliveryNotes.length > 0))),
  );
  const allWorkReportsSubmitted = Boolean(
    activeActivity && allAssigneesSubmittedWorkReports(activeActivity, activeEvent),
  );
  const pendingWorkReportUserIds = activeActivity
    ? getPendingWorkReportAssigneeIds(activeActivity, activeEvent)
    : [];
  const pendingDeliveryNoteUserIds = activeActivity
    ? getPendingDeliveryNoteAssigneeIds(activeActivity, activeEvent, linkedDeliveryNotes)
    : [];
  const invoiceZeroHourPriceWarning = useMemo(
    () =>
      linkedDeliveryNotes.length > 0 && deliveryNotesHaveZeroPricedHourLines(linkedDeliveryNotes)
        ? ACTIVITY_INVOICE_ZERO_HOUR_PRICE_WARNING
        : null,
    [linkedDeliveryNotes],
  );
  const assignedUsers = useMemo(
    () => resolveAssigneeUsers(effectiveAssigneeIds, users, activeActivity),
    [effectiveAssigneeIds, users, activeActivity],
  );
  const showPerAssigneeSlotSchedule =
    shiftSchedulingEnabled || effectiveAssigneeIds.length > 1;
  const simpleSharedTimeReadOnly =
    !shiftSchedulingEnabled && effectiveAssigneeIds.length > 1;
  const displayedEventTimeRange = eventTimeRange;
  const displayedEventSpanCrossesMidnight = activityEventSpanCrossesMidnight(
    displayedEventTimeRange,
  );
  const activityCalendarDateStr = activeEvent?.date ?? formData.date;
  const displayedCalendarDateLabel = useMemo(
    () =>
      formatActivityCalendarDateRange(activityCalendarDateStr, displayedEventTimeRange),
    [activityCalendarDateStr, displayedEventTimeRange],
  );
  const displayedCalendarTimeLabel = useMemo(
    () =>
      formatActivityCalendarTimeRange(activityCalendarDateStr, displayedEventTimeRange),
    [activityCalendarDateStr, displayedEventTimeRange],
  );
  const scheduleHoursLabel = useMemo(
    () =>
      formatActivityScheduleHoursLabel(
        totalActivityHours,
        calendarSpanHours,
        formatDashboardJobsHours,
      ),
    [totalActivityHours, calendarSpanHours],
  );
  const scheduleEditHint = useMemo(
    () =>
      formatActivityScheduleEditHint(
        totalActivityHours,
        calendarSpanHours,
        displayedEventTimeRange,
        displayedEventSpanCrossesMidnight,
        formatDashboardJobsHours,
      ),
    [
      totalActivityHours,
      calendarSpanHours,
      displayedEventTimeRange,
      displayedEventSpanCrossesMidnight,
    ],
  );
  const currentUserWorkReportTime = currentUser
    ? (workReportWorkedTimeByUser[currentUser.id] ?? EMPTY_WORKED_TIME)
    : EMPTY_WORKED_TIME;
  const currentUserWorkReportSchedule = useMemo(() => {
    if (!currentUser) {
      return { startTime: '', endTime: '' };
    }
    return resolveWorkReportScheduleForUser(
      currentUser.id,
      activitySlots,
      savedAssigneeSlots,
      formData.assigneeSlots,
      eventTimeRange,
      effectiveAssigneeIds,
    );
  }, [
    activitySlots,
    currentUser,
    effectiveAssigneeIds,
    eventTimeRange,
    formData.assigneeSlots,
    savedAssigneeSlots,
  ]);
  const showWorkReportFormHeader = Boolean(
    currentUser &&
      activeActivity &&
      (!isAdmin || effectiveAssigneeIds.includes(currentUser.id)) &&
      (canEditActivityWorkReport(currentUser, {
        activity: activeActivity,
        event: activeEvent,
        targetUserId: currentUser.id,
        documents: clientDocuments,
      }) ||
        getActivityWorkReport(activeActivity, currentUser.id)?.status === 'submitted'),
  );
  const activityStartedForWorkReport = Boolean(
    activeActivity &&
      isActivityStarted({ activity: activeActivity, event: activeEvent }),
  );

  const handleWorkReportTimeChange = useCallback(
    (draft: WorkedTimeDraft) => {
      if (!currentUser) return;
      setWorkReportWorkedTimeByUser((prev) => ({
        ...prev,
        [currentUser.id]: draft,
      }));

      const workedMinutes = hoursMinutesToWorkedMinutes(
        parseWorkedTimePart(draft.hours, 24),
        parseWorkedTimePart(draft.minutes, 59),
      );

      setFormData((current) => {
        if (!current.assignedTo.includes(currentUser.id)) return current;
        const prev =
          current.assigneeSlots[currentUser.id] ??
          defaultAssigneeSlot(currentUser.id, shiftsByUserId, shiftEventTimes);
        const slots = resolveActivitySlotsForDisplay(
          effectiveAssigneeIds,
          current.assigneeSlots,
          savedAssigneeSlots,
          boundaries,
        );
        const slotSchedule = resolveWorkReportScheduleForUser(
          currentUser.id,
          slots,
          savedAssigneeSlots,
          current.assigneeSlots,
          aggregateEventTimeRange(slots),
          effectiveAssigneeIds,
        );
        const effectiveStartTime = isValidActivityTime(slotSchedule.startTime)
          ? slotSchedule.startTime
          : isValidActivityTime(prev.startTime)
            ? prev.startTime
            : defaultAssigneeSlot(currentUser.id, shiftsByUserId, shiftEventTimes).startTime;
        const endTime =
          workedMinutes > 0
            ? endTimeFromStartAndWorkedMinutes(effectiveStartTime, workedMinutes) ?? prev.endTime
            : prev.endTime;
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [currentUser.id]: {
              ...prev,
              shift: 'L',
              startTime: effectiveStartTime,
              endTime,
            },
          },
        };
      });
    },
    [
      boundaries,
      currentUser,
      effectiveAssigneeIds,
      savedAssigneeSlots,
      shiftEventTimes,
      shiftsByUserId,
    ],
  );

  const handleWorkReportStartTimeChange = useCallback(
    (startTime: string) => {
      if (!currentUser || !isValidActivityTime(startTime)) return;
      const draft = workReportWorkedTimeByUser[currentUser.id] ?? EMPTY_WORKED_TIME;
      const workedMinutes = hoursMinutesToWorkedMinutes(
        parseWorkedTimePart(draft.hours, 24),
        parseWorkedTimePart(draft.minutes, 59),
      );

      setFormData((current) => {
        if (!current.assignedTo.includes(currentUser.id)) return current;
        const prev =
          current.assigneeSlots[currentUser.id] ??
          defaultAssigneeSlot(currentUser.id, shiftsByUserId, shiftEventTimes);
        const endTime =
          workedMinutes > 0
            ? endTimeFromStartAndWorkedMinutes(startTime, workedMinutes) ?? prev.endTime
            : prev.endTime;
        return {
          ...current,
          assigneeSlots: {
            ...current.assigneeSlots,
            [currentUser.id]: { ...prev, shift: 'L', startTime, endTime },
          },
        };
      });
    },
    [currentUser, shiftEventTimes, shiftsByUserId, workReportWorkedTimeByUser],
  );

  const persistActivityScheduleAfterWorkReport = useCallback(
    async (activity: Activity): Promise<Activity> => {
      if (!activeTypeUsesWorkReport || !currentUser) return activity;

      const assigneeSlots = shiftSchedulingEnabled
        ? resolveAssigneeSlotsForSave(
            formData.assignedTo,
            formData.assigneeSlots,
            shiftsByUserId,
            shiftEventTimes,
          )
        : resolveSimpleAssigneeSlotsForSave(
            formData.assignedTo,
            formData.assigneeSlots,
            currentUser.id,
          );
      if (!assigneeSlots) return activity;

      const savedSlots = normalizeActivityAssigneeSlots(activity, activeEvent, boundaries);
      if (JSON.stringify(savedSlots) === JSON.stringify(assigneeSlots)) return activity;

      const hours = totalHoursFromAssigneeSlots(assigneeSlots);
      const updated = await activitiesService.update(activity.id, {
        assigneeSlots,
        hours,
      });
      setLinkedActivity(updated);

      const eventId = activeEvent?.id ?? linkedEvent?.id;
      if (eventId) {
        const { startTime, endTime } = aggregateEventTimeRange(assigneeSlots);
        const persistedEvent = await eventsService.update(eventId, {
          startTime,
          endTime,
          assignedTo: formData.assignedTo,
        });
        setLinkedEvent(persistedEvent);
      }

      return updated;
    },
    [
      activeEvent,
      activeTypeUsesWorkReport,
      boundaries,
      currentUser,
      formData.assignedTo,
      formData.assigneeSlots,
      linkedEvent?.id,
      shiftEventTimes,
      shiftSchedulingEnabled,
      shiftsByUserId,
    ],
  );

  useEffect(() => {
    if (!activeActivity || !activeTypeUsesWorkReport || !activityStartedForWorkReport) return;

    setWorkReportWorkedTimeByUser((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const user of assignedUsers) {
        const report = getActivityWorkReport(activeActivity, user.id);
        if (report?.workedMinutes && report.workedMinutes > 0) {
          const split = splitWorkedMinutes(report.workedMinutes);
          const current = prev[user.id];
          if (
            !current ||
            current.hours !== split.hours ||
            current.minutes !== split.minutes
          ) {
            next[user.id] = split;
            changed = true;
          }
          continue;
        }

        if (prev[user.id] !== undefined) continue;

        const slot = activitySlots.find((item) => item.userId === user.id);
        if (slot) {
          const slotDraft = workedTimeDraftFromSlot(slot);
          if (slotDraft.hours || slotDraft.minutes) {
            next[user.id] = slotDraft;
            changed = true;
            continue;
          }
        }

        const defaultMinutes = getDefaultWorkReportWorkedMinutes(
          activeActivity,
          activeEvent,
          user.id,
          boundaries,
        );
        next[user.id] =
          defaultMinutes > 0 ? splitWorkedMinutes(defaultMinutes) : EMPTY_WORKED_TIME;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [
    activeActivity,
    activeEvent,
    activeTypeUsesWorkReport,
    activitySlots,
    activityStartedForWorkReport,
    assignedUsers,
    boundaries,
  ]);

  type ActivityDeliveryNoteRow = {
    key: string;
    label: string;
    workerUserId?: string;
    existingDeliveryNote: Document | null;
    previewDocument: Document | null;
    viewDisabledReason: string | null;
    isPendingWorkReport: boolean;
  };

  const buildDeliveryNotePreviewContext = useCallback(
    (row: Pick<ActivityDeliveryNoteRow, 'workerUserId' | 'existingDeliveryNote' | 'label'>) => {
      if (!activeActivity || !selectedClient) return null;
      return {
        activity: activeActivity,
        activityTypes,
        client: selectedClient,
        workspaceId: activeActivity.workspaceId,
        event: activeEvent,
        existingDeliveryNote: row.existingDeliveryNote,
        workerUserId: row.workerUserId,
        workerName: row.label,
      };
    },
    [activeActivity, activeEvent, activityTypes, selectedClient],
  );

  const activityDeliveryNoteRows = useMemo((): ActivityDeliveryNoteRow[] => {
    if (!activeActivity || !selectedClient || !activeTypeCreatesDeliveryNote) {
      return [];
    }

    const rows: ActivityDeliveryNoteRow[] = assignedUsers.map((user) => {
      const existingDeliveryNote =
        findActivityDeliveryNoteForWorker(
          activeActivity.id,
          user.id,
          linkedDeliveryNotes,
          activeActivity,
        ) ?? null;
      const previewContext = {
        activity: activeActivity,
        activityTypes,
        client: selectedClient,
        workspaceId: activeActivity.workspaceId,
        event: activeEvent,
        existingDeliveryNote,
        workerUserId: user.id,
        workerName: user.name,
      };
      const previewDocument = buildActivityDeliveryNotePreviewDocument(previewContext);
      const viewDisabledReason = getActivityDeliveryNotePreviewViewDisabledReason(
        previewContext,
        previewDocument,
      );
      return {
        key: user.id,
        label: user.name,
        workerUserId: user.id,
        existingDeliveryNote,
        previewDocument,
        viewDisabledReason,
        isPendingWorkReport: pendingWorkReportUserIds.includes(user.id),
      };
    });

    const resolvedDeliveryNoteIds = new Set(
      rows
        .map((row) => row.existingDeliveryNote?.id)
        .filter((id): id is string => Boolean(id)),
    );
    const legacyDeliveryNotes = listUnmatchedActivityDeliveryNotes(
      activeActivity.id,
      linkedDeliveryNotes,
      resolvedDeliveryNoteIds,
    );
    for (const doc of legacyDeliveryNotes) {
      const label = doc.workerUserId
        ? (users.find((user) => user.id === doc.workerUserId)?.name ?? 'Operario')
        : (doc.number || 'Albaran');
      rows.push({
        key: doc.id,
        label,
        workerUserId: doc.workerUserId,
        existingDeliveryNote: doc,
        previewDocument: doc,
        viewDisabledReason: null,
        isPendingWorkReport: false,
      });
    }

    return rows;
  }, [
    activeActivity,
    activeEvent,
    activeTypeCreatesDeliveryNote,
    activityTypes,
    assignedUsers,
    linkedDeliveryNotes,
    pendingWorkReportUserIds,
    selectedClient,
    users,
  ]);

  const openDeliveryNotePreview = useCallback(
    async (row: ActivityDeliveryNoteRow) => {
      const context = buildDeliveryNotePreviewContext(row);
      if (!context || row.viewDisabledReason) return;
      try {
        await deliveryNotePreview.openPreview(context);
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : 'No se pudo abrir el albaran.',
        );
      }
    },
    [buildDeliveryNotePreviewContext, deliveryNotePreview],
  );

  const openLinkedDocument = useCallback(
    async (doc: Document) => {
      const client = clientsMap.get(doc.clientId);
      try {
        await openDocumentPdf(doc, client ?? undefined);
      } catch {
        if (client) openDocumentPdfLocally(doc, client);
      }
    },
    [clientsMap],
  );

  const renderLinkedDocumentsList = (docs = linkedDocs) => (
    <ul className={styles.activityViewList} aria-label="Documentos vinculados">
      {docs.map((doc) => (
        <li key={doc.id} className={styles.activityViewListItem}>
          <button
            type="button"
            className={styles.activityViewDocButton}
            onClick={() => void openLinkedDocument(doc)}
            title="Abrir documento"
          >
            <span>
              {doc.number} · {DOCUMENT_TYPE_LABELS[doc.type]}
            </span>
            <span className={styles.activityViewListMeta}>{doc.total.toFixed(2)}€</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const renderInvoiceDeliveryMismatchBanner = () => {
    if (invoiceWithoutDeliveryNoteBanner) {
      return (
        <div className={styles.activityDocMismatchBanner} role="alert">
          <p className={styles.activityDocMismatchBannerText}>{invoiceWithoutDeliveryNoteBanner}</p>
        </div>
      );
    }
    if (!invoiceDeliveryMismatchBanner) return null;
    return (
      <div className={styles.activityDocMismatchBanner} role="alert">
        <p className={styles.activityDocMismatchBannerText}>{invoiceDeliveryMismatchBanner}</p>
        {canUpdateActivityInvoice ? (
          <div className={styles.activityViewDocActions}>
            <button
              type="button"
              className={ui.btnSecondary}
              onClick={() => openUpdateInvoice()}
            >
              <RefreshCw size={16} aria-hidden />
              Actualizar factura
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderActivityInvoiceSection = () => {
    if (!activeTypeCreatesDeliveryNote || !activeActivity || !isAdmin) return null;

    const pendingAssignees = assignedUsers.filter((user) =>
      pendingWorkReportUserIds.includes(user.id),
    );
    const pendingDeliveryNoteAssignees = assignedUsers.filter((user) =>
      pendingDeliveryNoteUserIds.includes(user.id),
    );
    const invoiceInSync =
      linkedInvoice &&
      invoiceMatchesActivityDeliveryNotes(linkedInvoice, linkedDeliveryNotes);

    return (
      <div className={styles.activityViewDocGroup}>
        <div className={styles.activityViewDeliveryNoteSectionIntro}>
          <span className={styles.activityViewDocGroupTitle}>Factura</span>
          <p className={styles.activityViewDeliveryNoteSectionHint}>
            {allWorkReportsSubmitted
              ? pendingDeliveryNoteAssignees.length > 0
                ? 'Faltan albaranes de algunos operarios antes de poder facturar.'
                : 'Suma de todos los albaranes de operarios. Solo el administrador puede emitirla.'
              : 'Disponible cuando todos los operarios hayan enviado su informe de trabajo.'}
          </p>
          {!allWorkReportsSubmitted && pendingAssignees.length > 0 ? (
            <p className={styles.activityViewDeliveryNoteSectionHint}>
              Informes pendientes: {pendingAssignees.map((user) => user.name).join(', ')}.
            </p>
          ) : null}
          {allWorkReportsSubmitted && pendingDeliveryNoteAssignees.length > 0 ? (
            <p className={styles.activityViewDeliveryNoteSectionHint}>
              Albaranes pendientes:{' '}
              {pendingDeliveryNoteAssignees.map((user) => user.name).join(', ')}.
            </p>
          ) : null}
        </div>

        {linkedInvoice ? (
          <div className={styles.activityViewDeliveryNoteCard}>
            <div className={styles.activityViewDeliveryNoteCardMain}>
              <span className={cx(ui.userAvatar, styles.assigneeAvatar)} aria-hidden>
                🧾
              </span>
              <div className={styles.activityViewDeliveryNoteCardBody}>
                <div className={styles.activityViewDeliveryNoteCardHeader}>
                  <span className={styles.activityViewDeliveryNoteCardName}>
                    {linkedInvoice.number}
                  </span>
                  <span
                    className={cx(
                      styles.activityViewDeliveryNoteStatus,
                      invoiceInSync
                        ? styles.activityViewDeliveryNoteStatusIssued
                        : styles.activityViewDeliveryNoteStatusDraft,
                    )}
                  >
                    {invoiceInSync ? 'Emitida' : 'Desactualizada'}
                  </span>
                </div>
                <p className={styles.activityViewDeliveryNoteCardMeta}>
                  {DOCUMENT_TYPE_LABELS.invoice} · {linkedInvoice.items.length} linea
                  {linkedInvoice.items.length === 1 ? '' : 's'} · Total{' '}
                  {formatDocumentAmount(linkedInvoice.total)}
                </p>
                {canUpdateActivityInvoice && invoiceUpdateMismatchTooltip ? (
                  <p className={styles.activityViewDeliveryNoteCardMeta}>
                    {INVOICE_DELIVERY_NOTES_OUT_OF_SYNC_SUMMARY}
                  </p>
                ) : null}
              </div>
            </div>
            <div className={styles.activityViewDocActions}>
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => openEditInvoice()}
              >
                <PenLine size={16} aria-hidden />
                Editar factura
              </button>
              {canUpdateActivityInvoice ? (
                <div className={styles.activityInvoiceActionRow}>
                  <button
                    type="button"
                    className={ui.btnPrimary}
                    onClick={() => openUpdateInvoice()}
                  >
                    <RefreshCw size={16} aria-hidden />
                    Actualizar desde albaranes
                  </button>
                  {invoiceUpdateMismatchTooltip ? (
                    <span className={styles.invoiceSyncTooltipWrap}>
                      <button
                        type="button"
                        className={styles.invoiceSyncTooltipTrigger}
                        aria-label={INVOICE_DELIVERY_NOTES_OUT_OF_SYNC_SUMMARY}
                        title={invoiceUpdateMismatchTooltip}
                      >
                        <AlertTriangle size={16} aria-hidden />
                      </button>
                      <span className={styles.invoiceSyncTooltipBubble} role="tooltip">
                        {invoiceUpdateMismatchTooltip}
                      </span>
                    </span>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => void openLinkedDocument(linkedInvoice)}
              >
                <FileText size={16} aria-hidden />
                Abrir PDF
              </button>
            </div>
          </div>
        ) : canGenerateActivityInvoice ? (
          <div className={styles.activityViewDeliveryNoteCard}>
            <div className={styles.activityViewDeliveryNoteCardMain}>
              <div className={styles.activityViewDeliveryNoteCardBody}>
                <p className={styles.activityViewDeliveryNoteCardMeta}>
                  {deliveryNotesAggregateTotals.lineCount} linea
                  {deliveryNotesAggregateTotals.lineCount === 1 ? '' : 's'} de{' '}
                  {linkedDeliveryNotes.length} albaran
                  {linkedDeliveryNotes.length === 1 ? '' : 'es'}
                </p>
                <p className={styles.activityViewDeliveryNoteCardMeta}>
                  Total estimado {formatDocumentAmount(deliveryNotesAggregateTotals.total)}
                </p>
                {invoiceZeroHourPriceWarning ? (
                  <p className={styles.activityViewDeliveryNoteCardMeta} role="status">
                    {invoiceZeroHourPriceWarning}
                  </p>
                ) : null}
              </div>
            </div>
            <div className={styles.activityViewDocActions}>
              <button type="button" className={ui.btnPrimary} onClick={() => openCreateInvoice()}>
                <FilePlus size={16} aria-hidden />
                Generar factura
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderDocumentLinker = (options: {
    disabled?: boolean;
    onCreateDocument?: (mode: DocumentCreationMode) => void;
    onDuplicateInvoice?: (invoiceId: string) => void;
    showDoneButton?: boolean;
    showSyncMessage?: boolean;
  }) => (
    <div className={styles.activityViewDocLinks}>
      {options.showDoneButton ? (
        <button
          type="button"
          className={cx(ui.btnSecondary, styles.activityViewDocDone)}
          onClick={() => setLinkingDocumentsInView(false)}
        >
          Listo
        </button>
      ) : null}
      <ActivityDocumentLinks
        documents={clientDocuments}
        selectedIds={linkedDocumentIds}
        onChange={handleLinkedDocumentsChange}
        currentActivityId={activityIdForLinks}
        disabled={options.disabled}
        onCreateDocument={options.onCreateDocument}
        onDuplicateInvoice={options.onDuplicateInvoice}
      />
      {documentLinkError ? (
        <p className={ui.alertError} role="alert">
          {documentLinkError}
        </p>
      ) : null}
      {options.showSyncMessage && syncingDocLinks ? (
        <p className={cx(ui.textSmall, ui.textMuted, styles.activityViewDocSync)}>
          Guardando vínculos…
        </p>
      ) : null}
    </div>
  );

  const renderActivityDeliveryNoteRow = (row: ActivityDeliveryNoteRow) => {
    const persisted = Boolean(row.existingDeliveryNote);
    const summaryDocument = row.existingDeliveryNote ?? row.previewDocument;
    const hasLineItems = Boolean(summaryDocument?.items.length);
    const canPreview = !row.viewDisabledReason;
    const viewDisabled = !canPreview || deliveryNotePreview.previewLoading;
    const statusLabel = persisted
      ? 'Emitido'
      : hasLineItems
        ? 'Borrador'
        : 'Informe pendiente';
    const statusTone = persisted
      ? styles.activityViewDeliveryNoteStatusIssued
      : hasLineItems
        ? styles.activityViewDeliveryNoteStatusDraft
        : styles.activityViewDeliveryNoteStatusPending;

    return (
      <div key={row.key} className={styles.activityViewDeliveryNoteCard}>
        <div className={styles.activityViewDeliveryNoteCardMain}>
          <span className={cx(ui.userAvatar, styles.assigneeAvatar)} aria-hidden>
            {getUserInitials(row.label)}
          </span>
          <div className={styles.activityViewDeliveryNoteCardInfo}>
            <div className={styles.activityViewDeliveryNoteCardHeader}>
              <span className={styles.activityViewDeliveryNoteCardTitle}>{row.label}</span>
              <span className={cx(styles.activityViewDeliveryNoteStatus, statusTone)}>
                {statusLabel}
              </span>
            </div>
            {summaryDocument && (persisted || hasLineItems) ? (
              <p className={styles.activityViewDeliveryNoteCardMeta}>
                {persisted ? (
                  <>
                    <span className={styles.activityViewDeliveryNoteCardNumber}>
                      {summaryDocument.number}
                    </span>
                    <span>{DOCUMENT_TYPE_LABELS[summaryDocument.type]}</span>
                  </>
                ) : (
                  <span>Borrador segun informe de trabajo</span>
                )}
                {hasLineItems ? (
                  <>
                    <span className={styles.activityViewDeliveryNoteCardDot} aria-hidden>
                      ·
                    </span>
                    <span>
                      {summaryDocument.items.length} linea
                      {summaryDocument.items.length === 1 ? '' : 's'}
                    </span>
                    <span className={styles.activityViewDeliveryNoteCardDot} aria-hidden>
                      ·
                    </span>
                    <span>
                      Total {persisted ? '' : 'estimado '}
                      {formatDocumentAmount(summaryDocument.total)}
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className={styles.activityViewDeliveryNoteCardMeta}>
                Falta informe de trabajo.
              </p>
            )}
          </div>
        </div>
        {canPreview ? (
          <div className={styles.activityViewDocActions}>
            <button
              type="button"
              className={persisted ? ui.btnSecondary : ui.btnPrimary}
              disabled={viewDisabled}
              onClick={() => void openDeliveryNotePreview(row)}
            >
              {deliveryNotePreview.previewLoading ? 'Abriendo…' : 'Ver albaran'}
            </button>
            {persisted ? (
              <button
                type="button"
                className={ui.btnSecondary}
                onClick={() => void openLinkedDocument(row.existingDeliveryNote!)}
              >
                <FileText size={16} aria-hidden />
                Abrir PDF
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderActivityDeliveryNoteSection = () => {
    const activityTypeLabel = activeActivityType?.name;
    const hasAnyDeliveryNoteDraft = activityDeliveryNoteRows.some(
      (row) => row.existingDeliveryNote || (row.previewDocument?.items.length ?? 0) > 0,
    );
    const showDeliveryNoteRows = isPastActivity || hasAnyDeliveryNoteDraft;
    return (
      <div className={styles.activityViewDocGroup}>
        <div className={styles.activityViewDeliveryNoteSectionIntro}>
          <span className={styles.activityViewDocGroupTitle}>Albaranes por operario</span>
          <p className={styles.activityViewDeliveryNoteSectionHint}>
            Cada operario genera su albaran al enviar su informe de trabajo
            {activityTypeLabel ? ` (${activityTypeLabel})` : ''}.
          </p>
          {!showDeliveryNoteRows ? (
            <p className={styles.activityViewDeliveryNoteSectionHint}>
              Los albaranes apareceran aqui cuando se envien los informes.
            </p>
          ) : null}
        </div>
        {showDeliveryNoteRows ? (
          <div className={styles.activityViewDocGroupBody}>
            {activityDeliveryNoteRows.map((row) => renderActivityDeliveryNoteRow(row))}
          </div>
        ) : null}
        {allWorkReportsSubmitted &&
        linkedDeliveryNotes.length === 0 &&
        isAdmin &&
        canCreateDeliveryNote ? (
          <button
            type="button"
            className={ui.btnSecondary}
            onClick={() => openCreateDocument('generate')}
          >
            <FilePlus size={16} aria-hidden />
            Crear albaran manual
          </button>
        ) : null}
      </div>
    );
  };

  const renderActivityAttachmentsContent = () => (
    <ActivityAttachmentsPanel
      activity={activeActivity}
      canEdit={canAssociateActivityDocuments}
      disabled={saving}
      ensureActivity={activeActivity ? undefined : ensureActivityPersisted}
      onActivityUpdated={(activity) => {
        setLinkedActivity(activity);
        onActivityUpdated?.(activity);
      }}
      onError={setSaveError}
    />
  );

  const renderActivityViewDocumentsContent = () => {
    if (!activeTypeUsesWorkReport) {
      return renderActivityAttachmentsContent();
    }

    if (activeTypeUsesWorkReport && activeActivity) {
      return (
        <div className={styles.activityViewDocSummary}>
          {renderInvoiceDeliveryMismatchBanner()}
          {activeTypeCreatesDeliveryNote ? renderActivityDeliveryNoteSection() : null}
          {activeTypeCreatesDeliveryNote ? renderActivityInvoiceSection() : null}
          {linkedDocumentsExceptDeliveryNote.length > 0
            ? renderLinkedDocumentsList(linkedDocumentsExceptDeliveryNote)
            : null}
          {canAssociateActivityDocuments && !linkingDocumentsInView ? (
            <button
              type="button"
              className={ui.btnSecondary}
              onClick={() => setLinkingDocumentsInView(true)}
            >
              <Link2 size={16} aria-hidden />
              Añadir Documento
            </button>
          ) : null}
          {canAssociateActivityDocuments && linkingDocumentsInView
            ? renderDocumentLinker({
                disabled: syncingDocLinks,
                onCreateDocument: openCreateDocument,
                onDuplicateInvoice: openDuplicateInvoice,
                showDoneButton: true,
                showSyncMessage: true,
              })
            : null}
        </div>
      );
    }

    return <p className={styles.activityViewEmpty}>Sin documentos vinculados</p>;
  };

  const handleOpenClientProfile = () => {
    if (!formData.clientId) return;
    navigate(`/clients/${formData.clientId}`, {
      state: navigationStateForReturn(`${location.pathname}${location.search}`),
    });
  };

  const signatureSource = activeActivity;
  const signatureSlots = signatureSource
    ? normalizeActivityAssigneeSlots(signatureSource, activeEvent)
    : [];
  const slotSignatures = signatureSlots.filter((slot) =>
    Boolean(slot.workerSignature?.imageDataUrl?.trim()),
  );
  const legacySignature =
    slotSignatures.length === 0 ? signatureSource?.workerSignature : undefined;

  const viewerSignStatus =
    currentUser && signatureSource
      ? getWorkerHoursStatus(signatureSource, activeEvent, currentUser.id, boundaries)
      : null;
  const viewerHasSignature = Boolean(currentUser?.signatureDataUrl?.trim());

  useEffect(() => {
    if (!currentUser?.id || !viewerSignStatus?.canSignNow) return;
    setRealWorkedTimeByUser((prev) =>
      prev[currentUser.id] !== undefined
        ? prev
        : { ...prev, [currentUser.id]: { hours: '0', minutes: '0' } },
    );
  }, [currentUser?.id, viewerSignStatus?.canSignNow, activeActivity?.id]);

  const handleSignMyHours = useCallback(async (confirmedHours: number) => {
    if (!showSignatureFlow) return;
    const activity = activeActivity;
    if (!currentUser || !activity || !viewerSignStatus?.needsSignature) return;

    if (!viewerSignStatus.canSignNow) {
      setSaveError(
        'Solo puedes firmar cuando haya finalizado la fecha y hora de tu tramo asignado.',
      );
      return;
    }

    if (!viewerHasSignature) {
      setSaveError('Configura tu firma en Ajustes → Firma antes de confirmar horas.');
      return;
    }

    if (confirmedHours <= 0) {
      setSaveError('Indica horas y minutos reales (mayor que 0h 0m) antes de firmar.');
      return;
    }

    const assignedTo =
      formData.assignedTo.length > 0 ? formData.assignedTo : [currentUser.id];
    let assigneeSlots = resolveAssigneeSlotsForSave(
      assignedTo,
      formData.assigneeSlots,
      shiftsByUserId,
      shiftEventTimes,
    );

    if (!assigneeSlots) {
      const normalized = normalizeActivityAssigneeSlots(
        activity,
        eventToEdit,
        boundaries,
      );
      if (normalized.some((slot) => slot.userId === currentUser.id)) {
        assigneeSlots = normalized;
      }
    }

    if (!assigneeSlots?.some((slot) => slot.userId === currentUser.id)) {
      setSaveError('Completa tu turno y tramo en Asignación antes de firmar.');
      setIsEditMode(true);
      return;
    }

    const assigneeSlotsToSave = preserveAssigneeSlotSignatures(
      assigneeSlots,
      activity.assigneeSlots,
    );
    const hours = totalHoursFromAssigneeSlots(assigneeSlotsToSave);
    const signature = buildActivityWorkerSignature(currentUser, confirmedHours);
    if (!signature) {
      setSaveError('No se pudo generar la firma. Revisa tu firma en Ajustes.');
      return;
    }
    const assigneeSlotsWithSignature = assigneeSlotsToSave.map((slot) =>
      slot.userId === currentUser.id ? { ...slot, workerSignature: signature } : slot,
    );

    setSaving(true);
    setSaveError(null);
    try {
      let saved = await activitiesService.update(activity.id, {
        assigneeSlots: assigneeSlotsWithSignature,
        hours,
      });
      if (!isActivitySignedByWorker(saved, eventToEdit, currentUser.id)) {
        saved = applyWorkerSignatureFromUser(
          saved,
          currentUser,
          eventToEdit,
          confirmedHours,
        );
      }
      setLinkedActivity(saved);
      onActivityUpdated?.(saved);
      setRealWorkedTimeByUser((prev) => {
        const next = { ...prev };
        delete next[currentUser.id];
        return next;
      });
      const slots = normalizeActivityAssigneeSlots(saved, eventToEdit, boundaries);
      setFormData((current) => ({
        ...current,
        assignedTo: getAssigneeIdsFromSlots(slots),
        assigneeSlots: slotsToAssigneeFormRecord(slots),
      }));
      setIsEditMode(false);
      await notifyActivitySaved();
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : 'No se pudieron firmar las horas. Inténtalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    boundaries,
    currentUser,
    eventToEdit,
    formData.assigneeSlots,
    formData.assignedTo,
    activeActivity,
    notifyActivitySaved,
    onActivityUpdated,
    shiftEventTimes,
    shiftsByUserId,
    viewerHasSignature,
    viewerSignStatus?.canSignNow,
    viewerSignStatus?.needsSignature,
    showSignatureFlow,
  ]);

  const canClearAllSignatures =
    showSignatureFlow &&
    Boolean(
      activeActivity &&
        currentUser &&
        canCancelAllWorkerSignatures(currentUser, {
          activity: activeActivity,
          event: eventToEdit,
        }),
    );

  const assigneeSlotHasUnsavedChanges = useCallback(
    (userId: string) => {
      const saved = savedAssigneeSlots.find((item) => item.userId === userId);
      const draft =
        formData.assigneeSlots[userId] ??
        (saved
          ? {
              shift: saved.shift,
              startTime: saved.startTime,
              endTime: saved.endTime,
            }
          : null);
      if (!saved || !draft) return false;
      return (
        saved.shift !== draft.shift ||
        saved.startTime !== draft.startTime ||
        saved.endTime !== draft.endTime
      );
    },
    [formData.assigneeSlots, savedAssigneeSlots],
  );

  const handleSaveAssigneeSlotHours = useCallback(
    async (userId: string) => {
      const activity = activeActivity;
      if (!currentUser || !activity) return;

      if (
        !canEditAssigneeSlotHours(currentUser, {
          activity,
          event: activeEvent,
          targetUserId: userId,
        })
      ) {
        setSaveError('No tienes permiso para editar este tramo.');
        return;
      }

      const assignedTo =
        formData.assignedTo.length > 0 ? formData.assignedTo : [userId];
      const assigneeSlots = shiftSchedulingEnabled
        ? resolveAssigneeSlotsForSave(
            assignedTo,
            formData.assigneeSlots,
            shiftsByUserId,
            shiftEventTimes,
          )
        : resolveSimpleAssigneeSlotsForSave(
            assignedTo,
            formData.assigneeSlots,
            userId,
          );

      if (!assigneeSlots) {
        setSaveError(
          shiftSchedulingEnabled
            ? 'Indica un turno y tramo horario valido.'
            : 'Indica un tramo horario valido.',
        );
        return;
      }

      const assigneeSlotsToSave = preserveAssigneeSlotSignatures(
        assigneeSlots,
        activity.assigneeSlots,
      );
      const hours = totalHoursFromAssigneeSlots(assigneeSlotsToSave);

      setSavingSlotUserId(userId);
      setSaveError(null);
      try {
        const saved = await activitiesService.update(activity.id, {
          assigneeSlots: assigneeSlotsToSave,
          hours,
        });
        setLinkedActivity(saved);
        onActivityUpdated?.(saved);
        const slots = normalizeActivityAssigneeSlots(saved, activeEvent, boundaries);
        setFormData((current) => ({
          ...current,
          assignedTo: getAssigneeIdsFromSlots(slots),
          assigneeSlots: slotsToAssigneeFormRecord(slots),
        }));
        await notifyActivitySaved();
        setEditingSlotUserId((current) => (current === userId ? null : current));
      } catch (error) {
        setSaveError(
          error instanceof ApiError
            ? error.message
            : 'No se pudo guardar el tramo horario. Inténtalo de nuevo.',
        );
      } finally {
        setSavingSlotUserId(null);
      }
    },
    [
      activeActivity,
      activeEvent,
      boundaries,
      currentUser,
      formData.assignedTo,
      formData.assigneeSlots,
      notifyActivitySaved,
      onActivityUpdated,
      shiftEventTimes,
      shiftSchedulingEnabled,
      shiftsByUserId,
    ],
  );

  const executeCancelSignature = useCallback(async () => {
    const activity = activeActivity;
    const target = signatureCancelConfirm;
    if (!activity || !target || !currentUser) return;

    if (target.scope === 'user') {
      if (
        !canCancelWorkerSignature(currentUser, {
          activity,
          event: eventToEdit,
          targetUserId: target.userId,
        })
      ) {
        setSaveError('No tienes permiso para cancelar esta firma.');
        setSignatureCancelConfirm(null);
        return;
      }
    } else if (!canCancelAllWorkerSignatures(currentUser, { activity, event: eventToEdit })) {
      setSaveError('Solo un administrador puede eliminar todas las firmas.');
      setSignatureCancelConfirm(null);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const patch =
        target.scope === 'all'
          ? activityUpdatesCancelAllWorkerSignatures(activity, eventToEdit)
          : activityUpdatesCancelWorkerSignature(activity, eventToEdit, target.userId);
      const saved = await activitiesService.update(activity.id, patch);
      setLinkedActivity(saved);
      onActivityUpdated?.(saved);
      const slots = normalizeActivityAssigneeSlots(saved, eventToEdit, boundaries);
      setFormData((current) => ({
        ...current,
        assignedTo: getAssigneeIdsFromSlots(slots),
        assigneeSlots: slotsToAssigneeFormRecord(slots),
      }));
      if (target.scope === 'user' && target.userId === currentUser.id) {
        setRealWorkedTimeByUser((prev) => ({
          ...prev,
          [currentUser.id]: { hours: '0', minutes: '0' },
        }));
      }
      setSignatureCancelConfirm(null);
      await notifyActivitySaved();
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? error.message
          : 'No se pudo cancelar la firma. Inténtalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    activeActivity,
    boundaries,
    currentUser,
    eventToEdit,
    notifyActivitySaved,
    onActivityUpdated,
    signatureCancelConfirm,
  ]);

  const renderActivityViewAssigneeAvatars = () => {
    if (assignedUsers.length === 0) {
      return (
        <span className={styles.activityViewScheduleAssigneesEmpty}>
          Sin operarios
        </span>
      );
    }

    return (
      <ul
        className={cx(styles.assigneeAvatarList, styles.activityViewScheduleAssignees)}
        aria-label="Operarios asignados"
      >
        {assignedUsers.map((user) => (
          <li key={user.id}>
            <span
              className={cx(ui.userAvatar, styles.assigneeListAvatar)}
              title={user.name}
              aria-label={user.name}
            >
              {getUserInitials(user.name)}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const renderActivityViewAssignees = () => {
    if (activeTypeUsesWorkReport) {
      return null;
    }

    const assigneeFieldLabel = shiftSchedulingEnabled ? 'Asignación' : 'Operario';

    return (
    <div className={styles.activityViewField} aria-labelledby="activity-view-assignees">
      <span id="activity-view-assignees" className={styles.activityViewLabel}>
        {assigneeFieldLabel}
      </span>
      <div className={styles.assigneeListCard}>
        {assignedUsers.length > 0 ? (
          <ul className={styles.assigneeList} aria-label="Operarios asignados">
            {canClearAllSignatures ? (
              <li className={styles.assigneeListAdminBar}>
                <button
                  type="button"
                  className={styles.assigneeCancelSignatureBtn}
                  disabled={saving}
                  onClick={() => setSignatureCancelConfirm({ scope: 'all' })}
                >
                  Eliminar todas las firmas
                </button>
              </li>
            ) : null}
            {assignedUsers.map((user) => {
              const slot = activitySlots.find((item) => item.userId === user.id);
              const slotHours = slot ? hoursForAssigneeSlot(slot) : null;
              const assigneeStatus =
                signatureSource != null
                  ? getWorkerHoursStatus(
                      signatureSource,
                      activeEvent,
                      user.id,
                      boundaries,
                    )
                  : null;
              const isOwnRow = currentUser?.id === user.id;
              const workerSignature = workerSignatureForAssignee(
                user.id,
                slot,
                legacySignature,
                slotSignatures.length > 0,
              );
              const canSignRow =
                isOwnRow && assigneeStatus?.canSignNow && viewerHasSignature;
              const awaitingSlotEndRow = isOwnRow && assigneeStatus?.awaitingSlotEnd;
              const needsProfileRow =
                isOwnRow &&
                assigneeStatus?.needsSignature &&
                !viewerHasSignature &&
                !awaitingSlotEndRow;
              const activityDateStr =
                activeEvent?.date ?? signatureSource?.date ?? formData.date;
              const slotEndLabel =
                slot && activityDateStr
                  ? (() => {
                      const end = getAssigneeSlotEndDateTime(activityDateStr, slot);
                      return end
                        ? format(end, "d 'de' MMMM yyyy 'a las' HH:mm", { locale: es })
                        : null;
                    })()
                  : null;
              const canCancelRowSignature = Boolean(
                activeActivity &&
                  currentUser &&
                  workerSignature &&
                  canCancelWorkerSignature(currentUser, {
                    activity: activeActivity,
                    event: activeEvent,
                    targetUserId: user.id,
                  }),
              );
              const showHours =
                assigneeStatus != null && assigneeStatus.assignedHours > 0;
              const realWorkedTime =
                realWorkedTimeByUser[user.id] ?? EMPTY_REAL_WORKED_TIME;
              const confirmedRealWorkedHours = parseRealWorkedTimeInput(
                realWorkedTime.hours,
                realWorkedTime.minutes,
              );
              const workReport = activeActivity
                ? getActivityWorkReport(activeActivity, user.id)
                : null;
              const canEditRowSlotHours = Boolean(
                showPerAssigneeSlotSchedule &&
                  !activeTypeUsesWorkReport &&
                  activeActivity &&
                  currentUser &&
                  canEditAssigneeSlotHours(currentUser, {
                    activity: activeActivity,
                    event: activeEvent,
                    targetUserId: user.id,
                  }),
              );
              const editSlot =
                formData.assigneeSlots[user.id] ??
                (slot
                  ? {
                      shift: slot.shift,
                      startTime: slot.startTime,
                      endTime: slot.endTime,
                    }
                  : defaultAssigneeSlot(user.id, shiftsByUserId, shiftEventTimes));
              const draftSlotHours =
                isValidActivityTime(editSlot.startTime) &&
                isValidActivityTime(editSlot.endTime)
                  ? hoursForAssigneeSlot({
                      startTime: editSlot.startTime,
                      endTime: editSlot.endTime,
                    })
                  : null;
              const hasUnsavedSlotChanges = assigneeSlotHasUnsavedChanges(user.id);
              const isSavingRowSlot = savingSlotUserId === user.id;
              const showInlineSlotEditor =
                canEditRowSlotHours &&
                (!showViewMode ||
                  !slot ||
                  editingSlotUserId === user.id ||
                  hasUnsavedSlotChanges);
              const compactAssigneeRow =
                !(showHours && showSignatureFlow) && !canCancelRowSignature;

              return (
                <li
                  key={user.id}
                  className={cx(
                    styles.assigneeListItem,
                    workerSignature && styles.assigneeListItemSigned,
                  )}
                >
                  <div
                    className={cx(
                      styles.assigneeListRow,
                      compactAssigneeRow && styles.assigneeListRowCompact,
                    )}
                  >
                    <div className={styles.assigneeListPrimary}>
                      <span
                        className={cx(ui.userAvatar, styles.assigneeListAvatar)}
                        aria-hidden
                      >
                        {getUserInitials(user.name)}
                      </span>
                      <div className={styles.assigneeListMeta}>
                        <span className={styles.assigneeListName}>{user.name}</span>
                        {showPerAssigneeSlotSchedule ? (
                          slot || canEditRowSlotHours ? (
                            showInlineSlotEditor ? (
                              <div className={styles.assigneeListScheduleEdit}>
                                {shiftSchedulingEnabled &&
                                editSlot.shift &&
                                isShiftCode(editSlot.shift) ? (
                                  <ShiftStateBadge
                                    shift={editSlot.shift}
                                    compact
                                    title={SHIFT_META[editSlot.shift].tooltip}
                                  />
                                ) : null}
                                <div className={styles.assigneeListTimeInputs}>
                                  <Input
                                    id={`activity-view-slot-start-${user.id}`}
                                    type="time"
                                    className={styles.assigneeListTimeInput}
                                    value={editSlot.startTime}
                                    disabled={isSavingRowSlot || saving}
                                    onChange={(e) =>
                                      applyAssigneeTimeRange(user.id, {
                                        startTime: e.target.value,
                                      })
                                    }
                                    aria-label={`Inicio del tramo de ${user.name}`}
                                  />
                                  <span aria-hidden>-</span>
                                  <Input
                                    id={`activity-view-slot-end-${user.id}`}
                                    type="time"
                                    className={styles.assigneeListTimeInput}
                                    value={editSlot.endTime}
                                    disabled={isSavingRowSlot || saving}
                                    onChange={(e) =>
                                      applyAssigneeTimeRange(user.id, {
                                        endTime: e.target.value,
                                      })
                                    }
                                    aria-label={`Fin del tramo de ${user.name}`}
                                  />
                                </div>
                                {draftSlotHours != null ? (
                                  <span className={styles.assigneeListScheduleMuted}>
                                    · tramo {formatDashboardJobsHours(draftSlotHours)}h
                                  </span>
                                ) : null}
                                {hasUnsavedSlotChanges ? (
                                  <button
                                    type="button"
                                    className={styles.assigneeSaveSlotBtn}
                                    disabled={isSavingRowSlot || saving || draftSlotHours == null}
                                    onClick={() => void handleSaveAssigneeSlotHours(user.id)}
                                  >
                                    {isSavingRowSlot ? 'Guardando…' : 'Guardar tramo'}
                                  </button>
                                ) : showViewMode && editingSlotUserId === user.id ? (
                                  <button
                                    type="button"
                                    className={styles.assigneeEditSlotBtn}
                                    disabled={isSavingRowSlot || saving}
                                    onClick={() => setEditingSlotUserId(null)}
                                  >
                                    Cancelar
                                  </button>
                                ) : null}
                              </div>
                            ) : slot ? (
                              <div className={styles.assigneeListScheduleEdit}>
                                <span className={styles.assigneeListSchedule}>
                                  {shiftSchedulingEnabled ? (
                                    <ShiftStateBadge
                                      shift={slot.shift}
                                      compact
                                      title={SHIFT_META[slot.shift].tooltip}
                                    />
                                  ) : null}
                                  <span>
                                    {slot.startTime} - {slot.endTime}
                                    {slotHours != null ? (
                                      <span className={styles.assigneeListScheduleMuted}>
                                        {' '}
                                        · tramo {formatDashboardJobsHours(slotHours)}h
                                      </span>
                                    ) : null}
                                  </span>
                                </span>
                                {canEditRowSlotHours ? (
                                  <button
                                    type="button"
                                    className={styles.assigneeEditSlotBtn}
                                    disabled={saving}
                                    onClick={() => setEditingSlotUserId(user.id)}
                                  >
                                    Editar tramo
                                  </button>
                                ) : null}
                              </div>
                            ) : null
                          ) : (
                            <span className={styles.activityViewShiftMissing}>Sin tramo</span>
                          )
                        ) : null}
                      </div>
                    </div>

                    {showHours && showSignatureFlow ? (
                      <div
                        className={styles.assigneeListHours}
                        aria-label={`Horas de ${user.name}`}
                      >
                        <div className={styles.assigneeHourStat}>
                          <span className={styles.assigneeHourStatLabel}>Asign.</span>
                          <span className={styles.assigneeHourStatValue}>
                            {formatDashboardJobsHours(assigneeStatus.assignedHours)}h
                          </span>
                        </div>
                        <div
                          className={cx(
                            styles.assigneeHourStat,
                            assigneeStatus.isSigned && styles.assigneeHourStatSigned,
                            assigneeStatus.awaitingSlotEnd && styles.assigneeHourStatAwaiting,
                            assigneeStatus.canSignNow && styles.assigneeHourStatPending,
                          )}
                        >
                          <span className={styles.assigneeHourStatLabel}>Firm.</span>
                          <span className={styles.assigneeHourStatValue}>
                            {formatDashboardJobsHours(assigneeStatus.signedHours)}h
                          </span>
                        </div>
                      </div>
                    ) : compactAssigneeRow ? null : (
                      <span className={styles.assigneeListHoursPlaceholder} aria-hidden />
                    )}

                    {canCancelRowSignature ? (
                      <div className={styles.assigneeListActions}>
                        <button
                          type="button"
                          className={styles.assigneeCancelSignatureBtn}
                          disabled={saving}
                          onClick={() =>
                            setSignatureCancelConfirm({
                              scope: 'user',
                              userId: user.id,
                              userName: user.name,
                            })
                          }
                        >
                          Cancelar firma
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {workerSignature && showSignatureFlow ? (
                    <div className={styles.assigneeSignatureStrip}>
                      <img
                        src={workerSignature.imageDataUrl}
                        alt=""
                        className={styles.assigneeSignatureThumb}
                      />
                      <span className={styles.assigneeSignatureStripMeta}>
                        Firmado{' '}
                        {format(parseISO(workerSignature.signedAt), "d MMM yyyy, HH:mm", {
                          locale: es,
                        })}
                      </span>
                    </div>
                  ) : null}

                  {awaitingSlotEndRow && showSignatureFlow ? (
                    <p className={styles.assigneeListFootnote}>
                      {slotEndLabel
                        ? `Podrás firmar cuando finalice tu tramo (${slotEndLabel}).`
                        : 'Podrás firmar cuando finalice la fecha y hora de tu tramo asignado.'}
                    </p>
                  ) : null}
                  {canSignRow && showSignatureFlow ? (
                    <div className={styles.assigneeSignPanel}>
                      <div className={styles.assigneeRealHoursField}>
                        <span className={ui.label}>Tiempo real trabajado</span>
                        <div className={styles.assigneeRealHoursInputs}>
                          <div className={styles.assigneeRealHoursInputGroup}>
                            <label
                              className={styles.assigneeRealHoursInputLabel}
                              htmlFor={`activity-real-hours-h-${user.id}`}
                            >
                              Horas
                            </label>
                            <Input
                              id={`activity-real-hours-h-${user.id}`}
                              type="number"
                              min={0}
                              max={24}
                              step={1}
                              inputMode="numeric"
                              value={realWorkedTime.hours}
                              onChange={(e) =>
                                setRealWorkedTimeByUser((prev) => ({
                                  ...prev,
                                  [user.id]: {
                                    ...(prev[user.id] ?? EMPTY_REAL_WORKED_TIME),
                                    hours: sanitizeRealWorkedHoursInput(e.target.value),
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className={styles.assigneeRealHoursInputGroup}>
                            <label
                              className={styles.assigneeRealHoursInputLabel}
                              htmlFor={`activity-real-minutes-${user.id}`}
                            >
                              Minutos
                            </label>
                            <Input
                              id={`activity-real-minutes-${user.id}`}
                              type="number"
                              min={0}
                              max={59}
                              step={1}
                              inputMode="numeric"
                              value={realWorkedTime.minutes}
                              onChange={(e) =>
                                setRealWorkedTimeByUser((prev) => ({
                                  ...prev,
                                  [user.id]: {
                                    ...(prev[user.id] ?? EMPTY_REAL_WORKED_TIME),
                                    minutes: sanitizeRealWorkedMinutesInput(e.target.value),
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                        {slotHours != null ? (
                          <p className={styles.assigneeSignHint}>
                            Tramo asignado: {formatDashboardJobsHours(slotHours)}h. Indica horas
                            y minutos reales; con 0h 0m no se puede firmar.
                          </p>
                        ) : (
                          <p className={styles.assigneeSignHint}>
                            Indica horas y minutos reales; con 0h 0m no se puede firmar.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className={cx(ui.btnPrimary, ui.btnText)}
                        disabled={saving || confirmedRealWorkedHours <= 0}
                        onClick={() => void handleSignMyHours(confirmedRealWorkedHours)}
                      >
                        <PenLine size={16} aria-hidden />
                        Firmar mis horas
                      </button>
                    </div>
                  ) : needsProfileRow ? (
                    <div className={styles.assigneeSignPanel}>
                      <p className={styles.assigneeSignHint}>
                        Guarda tu firma manuscrita en Ajustes para confirmar tus horas.
                      </p>
                      <button
                        type="button"
                        className={ui.btnSecondary}
                        onClick={() => navigate('/settings?tab=signature')}
                      >
                        Ir a Ajustes → Firma
                      </button>
                    </div>
                  ) : activeTypeUsesWorkReport && activeActivity && isPastActivity ? (
                    workReport?.status === 'submitted' ? null : (
                      <p className={styles.assigneeListFootnote}>
                        {isAdmin && !isOwnRow
                          ? `${user.name} debe completar su informe de trabajo cuando acceda a la actividad.`
                          : isOwnRow
                            ? 'Completa tu informe de trabajo en la seccion de abajo.'
                            : 'Pendiente de informe de trabajo.'}
                      </p>
                    )
                  ) : assigneeStatus?.needsSignature && !isOwnRow && showSignatureFlow ? (
                    <p className={styles.assigneeListFootnote}>
                      {isAdmin
                        ? `${user.name} debe firmar sus horas cuando acceda a la actividad.`
                        : 'Pendiente de firma.'}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={cx(styles.activityViewEmpty, styles.assigneeListEmpty)}>
            Sin usuarios asignados
          </p>
        )}
      </div>
    </div>
    );
  };

  const renderActivityView = () => (
    <div className={styles.formSections}>
      <section className={ui.pageSection} aria-labelledby="activity-view-type">
        <h2 id="activity-view-type" className={ui.pageSectionTitle}>
          {activityDetailsSectionTitle}
        </h2>
        <div className={ui.card}>
          <div className={styles.sectionCardBody}>
            {selectedType && selectedTypeEmoji && (
              <div className={styles.selectedTypeBar}>
                <div className={styles.selectedTypeInfo}>
                  <span
                    className={cx(ui.activityEmojiBox, styles.selectedTypeIcon)}
                    style={{ '--type-color': selectedType.color } as React.CSSProperties}
                  >
                    <span aria-hidden style={{ fontSize: '0.875rem', lineHeight: 1 }}>{selectedTypeEmoji}</span>
                  </span>
                  <span>{selectedType.name}</span>
                </div>
              </div>
            )}
            <div className={styles.activityViewField}>
              <span className={styles.activityViewLabel}>Descripción</span>
              <p className={styles.activityViewDescription}>
                {formData.description || '—'}
              </p>
            </div>
            <div
              className={cx(
                styles.activityViewGrid,
                styles.activityViewGridSingle,
              )}
            >
              <div className={styles.activityViewField}>
                <span className={styles.activityViewLabel}>Contacto</span>
                {formData.clientId ? (
                  <button
                    type="button"
                    className={styles.activityViewClientButton}
                    onClick={handleOpenClientProfile}
                    title={`Ver perfil de ${clientName}`}
                  >
                    <span className={styles.activityViewClientInfo}>
                      <span className={styles.activityViewClientName}>{clientName}</span>
                      {selectedClient?.email ? (
                        <span className={styles.activityViewClientEmail}>{selectedClient.email}</span>
                      ) : null}
                    </span>
                  </button>
                ) : (
                  <span className={styles.activityViewValue}>{clientName}</span>
                )}
              </div>
            </div>
            <div className={styles.activityViewField} aria-labelledby="activity-view-schedule">
              <span id="activity-view-schedule" className={styles.activityViewLabel}>
                Fecha y hora
              </span>
              <div className={styles.activityViewScheduleValue}>
                <span className={styles.activityViewValue}>
                  {displayedCalendarDateLabel}
                </span>
                <span className={styles.activityViewScheduleMetaSep} aria-hidden="true">
                  ·
                </span>
                {activeTypeUsesWorkReport ? renderActivityViewAssigneeAvatars() : null}
                <span className={styles.activityViewValue}>
                  {displayedEventSpanCrossesMidnight ? (
                    displayedCalendarTimeLabel
                  ) : (
                    <>
                      {displayedEventTimeRange.startTime}
                      <span aria-hidden="true"> - </span>
                      {displayedEventTimeRange.endTime}
                    </>
                  )}
                </span>
                {activitySlots.length > 0 ? (
                  <span
                    className={styles.activityHoursHint}
                    title={scheduleHoursLabel.title}
                  >
                    · {scheduleHoursLabel.label}
                  </span>
                ) : null}
              </div>
            </div>
            {renderActivityViewAssignees()}
          </div>
        </div>
      </section>


      {activeTypeUsesWorkReport && activeActivity ? (
        <section
          className={ui.pageSection}
          id="activity-view-work-report"
          aria-labelledby={
            showWorkReportFormHeader || (isAdmin && assignedUsers.length > 0)
              ? 'activity-view-work-report-title'
              : undefined
          }
        >
          {showWorkReportFormHeader && currentUser ? (
            <div className={styles.activityWorkReportSectionTop}>
              <ActivityWorkReportFormHeader
                sectionTitleId="activity-view-work-report-title"
                currentUser={currentUser}
                status={getActivityWorkReportSurfaceStatus(activeActivity, currentUser.id)}
                workedMinutes={
                  getActivityWorkReport(activeActivity, currentUser.id)?.workedMinutes
                }
              />
            </div>
          ) : isAdmin && assignedUsers.length > 0 ? (
            <h2 id="activity-view-work-report-title" className={ui.pageSectionTitle}>
              Informes de trabajo
            </h2>
          ) : null}
          <div className={ui.card}>
            <ActivityWorkReportPanel
              activity={activeActivity}
              event={activeEvent}
              currentUser={currentUser}
              activityTypes={activityTypes}
              documents={clientDocuments}
              assignees={assignedUsers}
              clientEmail={selectedClient?.email}
              activityCreatesDeliveryNote={activeTypeCreatesDeliveryNote}
              canManageExtraItems={canManageWorkReportExtraItems}
              disabled={saving}
              formHeaderPlacement="section"
              workedTimeDraft={currentUserWorkReportTime}
              onWorkedTimeChange={handleWorkReportTimeChange}
              startTime={currentUserWorkReportSchedule.startTime}
              endTime={currentUserWorkReportSchedule.endTime}
              onStartTimeChange={handleWorkReportStartTimeChange}
              workReportActionsRef={workReportActionsRef}
              onActivityUpdated={async (activity) => {
                const synced = await persistActivityScheduleAfterWorkReport(activity);
                setLinkedActivity(synced);
                onActivityUpdated?.(synced);
              }}
              onDocumentsRefresh={refreshClientDocuments}
              onError={setSaveError}
            />
          </div>
        </section>
      ) : null}

      {showActivityDocumentsSection ? (
        <section
          className={ui.pageSection}
          id="activity-view-documents"
          aria-labelledby="activity-view-documents-title"
        >
          <h2 id="activity-view-documents-title" className={ui.pageSectionTitle}>
            Documentos
          </h2>
          <div className={ui.card}>
            <div className={styles.sectionCardBody}>{renderActivityViewDocumentsContent()}</div>
          </div>
        </section>
      ) : null}

      {eventToEdit && eventToEdit.history.length > 0 && (
        <section className={ui.pageSection} aria-labelledby="activity-view-history">
          <h2 id="activity-view-history" className={ui.pageSectionTitle}>
            Historial
          </h2>
          <div className={ui.card}>
            <div className={styles.sectionCardBody}>
              <div className={styles.activityViewHistory}>
                {eventToEdit.history.map((entry, index) => (
                  <div key={index} className={styles.historyItem}>
                    <span className={ui.fontMedium}>{entry.action}</span> por {entry.user} •{' '}
                    {format(parseISO(entry.timestamp), "d MMM 'a las' HH:mm", { locale: es })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  const renderTypeButton = (type: ActivityType, compact = false) => {
    const emoji = getActivityEmoji(type.icon);
    if (compact) {
      return (
        <button
          key={type.id}
          type="button"
          onClick={() => {
            setFormData({ ...formData, type: type.id });
            setChangingType(false);
          }}
          className={cx(
            styles.typeOptionCompact,
            formData.type === type.id && styles.typeOptionActive,
          )}
          style={{ '--type-color': type.color } as React.CSSProperties}
        >
          <span
            className={cx(ui.activityEmojiBox, styles.typeCompactIcon)}
            style={{ '--type-color': type.color } as React.CSSProperties}
          >
            <span aria-hidden style={{ fontSize: '0.75rem', lineHeight: 1 }}>{emoji}</span>
          </span>
          <span>{type.name}</span>
        </button>
      );
    }

    return (
      <button
        key={type.id}
        type="button"
        onClick={() => setFormData({ ...formData, type: type.id })}
        className={styles.typeOption}
        style={{ '--type-color': type.color } as React.CSSProperties}
      >
        <span
          className={cx(ui.activityEmojiBox, styles.typeIconWrap)}
          style={{ '--type-color': type.color } as React.CSSProperties}
        >
          <span aria-hidden style={{ fontSize: '0.875rem', lineHeight: 1 }}>{emoji}</span>
        </span>
        <span className={styles.typeLabel}>{type.name}</span>
      </button>
    );
  };

  const renderAddTypeButton = (compact = false) => {
    if (!isAdmin) return null;

    if (compact) {
      return (
        <button
          type="button"
          onClick={openTypeManager}
          className={styles.typeOptionCompactAdd}
        >
          <span className={styles.typeCompactAddIcon}>
            <Plus size={14} />
          </span>
          <span>Nuevo tipo</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={openTypeManager}
        className={styles.typeOptionAdd}
      >
        <span className={styles.typeAddIconWrap}>
          <Plus size={18} />
        </span>
        <span className={styles.typeLabel}>Nuevo tipo</span>
      </button>
    );
  };

  const renderTypeGrid = (compact = false) => (
    <div className={compact ? styles.typeGridCompact : styles.typeGrid}>
      {activityTypes.map((type) => renderTypeButton(type, compact))}
      {renderAddTypeButton(compact)}
    </div>
  );

  return (
    <>
      <ModalOverlay>
      <div
        className={cx(ui.modal, ui.modalLg, styles.activityModal)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-modal-title"
      >
        <ModalHeader title={modalTitle} titleId="activity-modal-title" onClose={handleRequestClose}>
          {activityPastAgo && (
            <span className={styles.activityPastAgo}>{activityPastAgo}</span>
          )}
        </ModalHeader>
        {showViewMode ? (
          <>
            <div className={ui.modalScroll}>
              {renderActivityView()}
              {saveError ? (
                <p className={cx(ui.alertError, styles.activityViewSaveError)} role="alert">
                  {saveError}
                </p>
              ) : null}
              {!canEdit && isPastActivity && !isAdmin && (
                <p className={ui.infoBox} style={{ marginTop: '1rem', marginBottom: 0 }}>
                  {activeTypeUsesWorkReport &&
                  currentUser &&
                  activeActivity &&
                  canSubmitActivityWorkReport(currentUser, {
                    activity: activeActivity,
                    event: activeEvent,
                  })
                    ? 'La actividad ya no se puede editar. Completa tu informe de trabajo; cuando todos lo envíen se generará el albarán automáticamente.'
                    : canManageFinishedDocuments
                      ? 'La actividad ya no se puede editar. El albarán se genera al completar los informes de trabajo.'
                      : 'Las actividades pasadas solo pueden editarlas o eliminarlas los administradores.'}
                </p>
              )}
            </div>
            {canEdit ? (
              <ModalFooter>
                <ModalActions>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveError(null);
                      setIsEditMode(true);
                    }}
                    className={modalBtnPrimary}
                  >
                    Editar
                  </button>
                </ModalActions>
              </ModalFooter>
            ) : null}
          </>
        ) : (
          <form onSubmit={handleSubmit} className={ui.modalForm}>
            <div className={cx(ui.modalScroll, showTypePicker && styles.typePickerBody)}>
              {showTypePicker ? (
                <div className={cx(ui.form, styles.typePickerForm)}>
                  {activityTypes.length > 0 || isAdmin ? (
                    renderTypeGrid()
                  ) : (
                    <EmptyState
                      emoji="🏷️"
                      description="Aún no hay tipos de actividad configurados."
                    />
                  )}
                </div>
              ) : (
                <div className={styles.formSections}>
                  <section className={ui.pageSection} aria-labelledby="activity-section-details">
                    <h2 id="activity-section-details" className={ui.pageSectionTitle}>
                      {activityDetailsSectionTitle}
                    </h2>
                    <div className={ui.card}>
                      <div className={styles.sectionCardBody}>
                        {!eventToEdit && !activityToEdit && directForm && !formData.type && (
                          <div className={ui.field}>
                            <label className={ui.label}>Tipo de actividad *</label>
                            {activityTypes.length > 0 || isAdmin ? (
                              renderTypeGrid(true)
                            ) : (
                              <EmptyState
                                emoji="🏷️"
                                description="Aún no hay tipos de actividad configurados."
                              />
                            )}
                          </div>
                        )}
                        {!eventToEdit && !activityToEdit && selectedType && selectedTypeEmoji && (
                          <div className={styles.selectedTypeBar}>
                            <div className={styles.selectedTypeInfo}>
                              <span
                                className={cx(ui.activityEmojiBox, styles.selectedTypeIcon)}
                                style={{ '--type-color': selectedType.color } as React.CSSProperties}
                              >
                                <span aria-hidden style={{ fontSize: '0.875rem', lineHeight: 1 }}>{selectedTypeEmoji}</span>
                              </span>
                              <span>{selectedType.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, type: '' })}
                              className={styles.changeTypeBtn}
                            >
                              Cambiar
                            </button>
                          </div>
                        )}
                        {isEditing && !changingType && selectedType && selectedTypeEmoji && (
                          <div className={styles.selectedTypeBar}>
                            <div className={styles.selectedTypeInfo}>
                              <span
                                className={cx(ui.activityEmojiBox, styles.selectedTypeIcon)}
                                style={{ '--type-color': selectedType.color } as React.CSSProperties}
                              >
                                <span aria-hidden style={{ fontSize: '0.875rem', lineHeight: 1 }}>{selectedTypeEmoji}</span>
                              </span>
                              <span>{selectedType.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setChangingType(true)}
                              className={styles.changeTypeBtn}
                            >
                              Cambiar
                            </button>
                          </div>
                        )}
                        {isEditing && changingType && (
                          <div className={ui.field}>
                            <label className={ui.label}>Tipo de actividad *</label>
                            {!formData.type && (
                              <p className={styles.noTypeHint}>
                                {UNKNOWN_ACTIVITY_TYPE_LABEL} — selecciona uno nuevo
                              </p>
                            )}
                            {renderTypeGrid(true)}
                          </div>
                        )}
                        {isEditing && !changingType && !selectedType && (
                          <div className={ui.field}>
                            <label className={ui.label}>Tipo de actividad *</label>
                            <p className={styles.noTypeHint}>
                              {UNKNOWN_ACTIVITY_TYPE_LABEL} — selecciona uno nuevo
                            </p>
                            {renderTypeGrid(true)}
                          </div>
                        )}
                        <SearchableSelect
                          id="activity-client"
                          label="Buscar cliente"
                          value={formData.clientId}
                          onChange={(clientId) => {
                            setFormData({ ...formData, clientId });
                            setLinkedDocumentIds([]);
                          }}
                          options={clientOptions}
                          placeholder="Buscar por nombre, email o teléfono…"
                          required
                        />
                        <div className={ui.field}>
                          <label className={ui.label} htmlFor="activity-date">
                            Fecha de la actividad *
                          </label>
                          <Input
                            id="activity-date"
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            required
                          />
                        </div>
                        {!shiftSchedulingEnabled && currentUser ? (
                          <div className={styles.assigneeSlotGrid}>
                            <div className={ui.field}>
                              <label className={ui.label} htmlFor="activity-simple-start">
                                Inicio *
                              </label>
                              <Input
                                id="activity-simple-start"
                                type="time"
                                value={displayedEventTimeRange.startTime}
                                onChange={(e) =>
                                  applySimpleSharedTimeRange({ startTime: e.target.value })
                                }
                                readOnly={simpleSharedTimeReadOnly}
                                disabled={simpleSharedTimeReadOnly}
                                required
                                aria-readonly={simpleSharedTimeReadOnly}
                              />
                            </div>
                            <div className={ui.field}>
                              <label className={ui.label} htmlFor="activity-simple-end">
                                Fin *
                              </label>
                              <Input
                                id="activity-simple-end"
                                type="time"
                                value={displayedEventTimeRange.endTime}
                                onChange={(e) =>
                                  applySimpleSharedTimeRange({ endTime: e.target.value })
                                }
                                readOnly={simpleSharedTimeReadOnly}
                                disabled={simpleSharedTimeReadOnly}
                                required
                                aria-readonly={simpleSharedTimeReadOnly}
                              />
                            </div>
                            {simpleSharedTimeReadOnly ? (
                              <p
                                className={cx(
                                  ui.textSmall,
                                  ui.textMuted,
                                  styles.assigneeSlotGridHint,
                                )}
                              >
                                {displayedEventSpanCrossesMidnight
                                  ? 'Resumen automatico: inicio mas temprano y fin mas tarde (continua al dia siguiente).'
                                  : 'Resumen automatico: inicio mas temprano y fin mas tarde de los operarios.'}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {(shiftSchedulingEnabled || formData.assignedTo.length > 0) && (
                          <p
                            className={cx(ui.textSmall, ui.textMuted, styles.activityHoursComputed)}
                            title={scheduleEditHint.title}
                          >
                            <strong>
                              {formatDashboardJobsHours(totalActivityHours)} h
                            </strong>
                            <span className={styles.activityHoursHint}>
                              {scheduleEditHint.suffix}
                            </span>
                          </p>
                        )}
                        <div className={ui.field}>
                          <label className={ui.label}>Descripción de la actividad</label>
                          <Textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            rows={4}
                            placeholder="Línea y descripción de la actividad"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className={ui.pageSection} aria-labelledby="activity-section-documents">
                    <h2 id="activity-section-documents" className={ui.pageSectionTitle}>
                      Documentos
                    </h2>
                    <div className={ui.card}>
                      <div className={styles.sectionCardBody}>
                        {selectedTypeUsesWorkReport ? (
                          <p className={cx(ui.textSmall, ui.textMuted)}>
                            Guarda la actividad para completar el informe de trabajo. Se generará un
                            albarán al finalizar.
                          </p>
                        ) : (
                          <ActivityAttachmentsPanel
                            activity={activeActivity}
                            canEdit={canAssociateActivityDocuments}
                            disabled={saving}
                            ensureActivity={activeActivity ? undefined : ensureActivityPersisted}
                            onActivityUpdated={(activity) => {
                              setLinkedActivity(activity);
                              onActivityUpdated?.(activity);
                            }}
                            onError={setSaveError}
                          />
                        )}
                      </div>
                    </div>
                  </section>

                  {showAssigneesEditSection ? (
                  <section className={ui.pageSection} aria-labelledby="activity-section-assignees">
                    <h2 id="activity-section-assignees" className={ui.pageSectionTitle}>
                      {shiftSchedulingEnabled ? 'Asignación' : 'Operarios'}
                    </h2>
                    <div className={ui.card}>
                      <div className={styles.sectionCardBody}>
                        {shiftSchedulingEnabled ? (
                          users.length > 0 ? (
                          <>
                            {canClearAllSignatures ? (
                              <div className={styles.assigneeListAdminBar}>
                                <button
                                  type="button"
                                  className={styles.assigneeCancelSignatureBtn}
                                  disabled={saving}
                                  onClick={() => setSignatureCancelConfirm({ scope: 'all' })}
                                >
                                  Eliminar todas las firmas
                                </button>
                              </div>
                            ) : null}
                            {users.map((user) => {
                            const plannedShift = shiftsByUserId.get(user.id);
                            const plannedMeta = plannedShift ? SHIFT_META[plannedShift] : null;
                            const selected = formData.assignedTo.includes(user.id);
                            const slot =
                              formData.assigneeSlots[user.id] ??
                              defaultAssigneeSlot(user.id, shiftsByUserId, shiftEventTimes);
                            const slotHours =
                              slot.shift && isShiftCode(slot.shift)
                                ? hoursForAssigneeSlot({
                                    startTime: slot.startTime,
                                    endTime: slot.endTime,
                                  })
                                : 0;
                            const slotForSignature = activitySlots.find(
                              (item) => item.userId === user.id,
                            );
                            const workerSignature = workerSignatureForAssignee(
                              user.id,
                              slotForSignature,
                              legacySignature,
                              slotSignatures.length > 0,
                            );
                            const canCancelRowSignature = Boolean(
                              activeActivity &&
                                currentUser &&
                                workerSignature &&
                                canCancelWorkerSignature(currentUser, {
                                  activity: activeActivity,
                                  event: eventToEdit,
                                  targetUserId: user.id,
                                }),
                            );
                            return (
                              <div key={user.id}>
                                <label className={ui.checkboxRow}>
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(e) => toggleAssignee(user.id, e.target.checked)}
                                    className={ui.checkbox}
                                  />
                                  <span className={cx(ui.userAvatar, styles.assigneeAvatar)} aria-hidden>
                                    {getUserInitials(user.name)}
                                  </span>
                                  <span className={ui.textSmall}>{user.name}</span>
                                  <span className={styles.assigneeShiftSlot}>
                                    {plannedMeta ? (
                                      <ShiftStateBadge
                                        shift={plannedMeta.code}
                                        compact
                                        title={`Turno planificado: ${plannedMeta.label}`}
                                      />
                                    ) : (
                                      <span className={styles.activityViewShiftMissing}>
                                        Sin turno planificado
                                      </span>
                                    )}
                                  </span>
                                </label>
                                {selected && (
                                  <div className={styles.assigneeSlotBlock}>
                                    <div className={styles.assigneeSlotGrid}>
                                      <div className={ui.field}>
                                        <label
                                          className={ui.label}
                                          htmlFor={`activity-shift-${user.id}`}
                                        >
                                          Turno *
                                        </label>
                                        <div className={styles.activityShiftField}>
                                          <Select
                                            id={`activity-shift-${user.id}`}
                                            value={slot.shift}
                                            onChange={(e) =>
                                              applyAssigneeShift(
                                                user.id,
                                                e.target.value as ShiftCode | '',
                                              )
                                            }
                                            required
                                          >
                                            <option value="">Seleccionar</option>
                                            {ACTIVITY_PLANNING_SHIFT_CODES.map((code) => (
                                              <option key={code} value={code}>
                                                {SHIFT_META[code].shortLabel} — {SHIFT_META[code].label}
                                              </option>
                                            ))}
                                          </Select>
                                          {slot.shift && isShiftCode(slot.shift) ? (
                                            <ShiftStateBadge shift={slot.shift} compact />
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className={ui.field}>
                                        <label
                                          className={ui.label}
                                          htmlFor={`activity-start-${user.id}`}
                                        >
                                          Inicio *
                                        </label>
                                        <Input
                                          id={`activity-start-${user.id}`}
                                          type="time"
                                          value={slot.startTime}
                                          onChange={(e) =>
                                            applyAssigneeTimeRange(user.id, {
                                              startTime: e.target.value,
                                            })
                                          }
                                          required
                                        />
                                      </div>
                                      <div className={ui.field}>
                                        <label
                                          className={ui.label}
                                          htmlFor={`activity-end-${user.id}`}
                                        >
                                          Fin *
                                        </label>
                                        <Input
                                          id={`activity-end-${user.id}`}
                                          type="time"
                                          value={slot.endTime}
                                          onChange={(e) =>
                                            applyAssigneeTimeRange(user.id, {
                                              endTime: e.target.value,
                                            })
                                          }
                                          required
                                        />
                                      </div>
                                    </div>
                                    <p className={styles.assigneeSlotHours}>
                                      <strong>{slotHours} h</strong> en este tramo
                                    </p>
                                    {activeActivity && selected && slotHours > 0 ? (
                                      <>
                                        <ActivityWorkerHoursStatus
                                          status={getWorkerHoursStatus(
                                            activeActivity,
                                            eventToEdit,
                                            user.id,
                                            boundaries,
                                          )}
                                          workerUserId={user.id}
                                          workerName={user.name}
                                          viewerUserId={currentUser?.id}
                                          isAdmin={isAdmin}
                                        />
                                        {canCancelRowSignature ? (
                                          <button
                                            type="button"
                                            className={styles.assigneeCancelSignatureBtn}
                                            disabled={saving}
                                            onClick={() =>
                                              setSignatureCancelConfirm({
                                                scope: 'user',
                                                userId: user.id,
                                                userName: user.name,
                                              })
                                            }
                                          >
                                            Cancelar firma
                                          </button>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          </>
                        ) : (
                          <p className={cx(ui.textSmall, ui.textMuted)}>
                            No se pudieron cargar los usuarios. Recarga la pagina o reinicia el servidor.
                          </p>
                        )
                        ) : users.length > 0 ? (
                          isAdmin ? (
                            <>
                              {users.map((user) => {
                                const selected = formData.assignedTo.includes(user.id);
                                const slot =
                                  formData.assigneeSlots[user.id] ??
                                  defaultAssigneeSlot(user.id, shiftsByUserId, shiftEventTimes);
                                const slotHours =
                                  isValidActivityTime(slot.startTime) &&
                                  isValidActivityTime(slot.endTime)
                                    ? hoursForAssigneeSlot({
                                        startTime: slot.startTime,
                                        endTime: slot.endTime,
                                      })
                                    : null;
                                return (
                                  <div key={user.id}>
                                    <label className={ui.checkboxRow}>
                                      <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={(e) => toggleAssignee(user.id, e.target.checked)}
                                        className={ui.checkbox}
                                      />
                                      <span
                                        className={cx(ui.userAvatar, styles.assigneeAvatar)}
                                        aria-hidden
                                      >
                                        {getUserInitials(user.name)}
                                      </span>
                                      <span className={ui.textSmall}>{user.name}</span>
                                    </label>
                                    {selected && formData.assignedTo.length > 1 ? (
                                      <div className={styles.assigneeSlotBlock}>
                                        <div className={styles.assigneeSlotGrid}>
                                          <div className={ui.field}>
                                            <label
                                              className={ui.label}
                                              htmlFor={`activity-simple-start-${user.id}`}
                                            >
                                              Inicio *
                                            </label>
                                            <Input
                                              id={`activity-simple-start-${user.id}`}
                                              type="time"
                                              value={slot.startTime}
                                              onChange={(e) =>
                                                applySimpleAssigneeTimeRange(user.id, {
                                                  startTime: e.target.value,
                                                })
                                              }
                                              required
                                            />
                                          </div>
                                          <div className={ui.field}>
                                            <label
                                              className={ui.label}
                                              htmlFor={`activity-simple-end-${user.id}`}
                                            >
                                              Fin *
                                            </label>
                                            <Input
                                              id={`activity-simple-end-${user.id}`}
                                              type="time"
                                              value={slot.endTime}
                                              onChange={(e) =>
                                                applySimpleAssigneeTimeRange(user.id, {
                                                  endTime: e.target.value,
                                                })
                                              }
                                              required
                                            />
                                          </div>
                                        </div>
                                        {slotHours != null ? (
                                          <p className={styles.assigneeSlotHours}>
                                            <strong>{slotHours} h</strong> en este tramo
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </>
                          ) : assignedUsers.length > 0 ? (
                            <ul className={styles.assigneeList} aria-label="Operarios asignados">
                              {assignedUsers.map((user) => (
                                <li key={user.id} className={styles.assigneeListItem}>
                                  <div className={styles.assigneeListRow}>
                                    <span
                                      className={cx(ui.userAvatar, styles.assigneeListAvatar)}
                                      aria-hidden
                                    >
                                      {getUserInitials(user.name)}
                                    </span>
                                    <div className={styles.assigneeListMeta}>
                                      <span className={styles.assigneeListName}>{user.name}</span>
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={cx(ui.textSmall, ui.textMuted)}>
                              No hay operarios asignados a esta actividad.
                            </p>
                          )
                        ) : (
                          <p className={cx(ui.textSmall, ui.textMuted)}>
                            No se pudieron cargar los usuarios. Recarga la pagina o reinicia el servidor.
                          </p>
                        )}
                        <p className={cx(ui.textSmall, ui.textMuted)}>
                          {shiftSchedulingEnabled
                            ? `Cada operario registra su tramo (turno e inicio/fin). Las horas se confirman con firma desde la vista de la actividad; aqui solo puedes cancelar una firma ya registrada. Se actualiza la planificacion (${shiftRangesLabel.morning}, etc. en Ajustes).`
                            : isAdmin
                              ? formData.assignedTo.length > 1
                                ? 'Selecciona los operarios y define el tramo de cada uno. El horario de arriba resume automaticamente el inicio mas temprano y el fin mas tarde.'
                                : 'Selecciona los operarios asignados. El horario de inicio y fin de la actividad se aplica a todos los seleccionados.'
                              : 'Operarios asignados a esta actividad. El horario se edita arriba en Inicio y Fin.'}
                        </p>
                      </div>
                    </div>
                  </section>
                  ) : null}

                  {eventToEdit && eventToEdit.history.length > 0 && (
                    <section className={ui.pageSection} aria-labelledby="activity-section-history">
                      <h2 id="activity-section-history" className={ui.pageSectionTitle}>
                        Historial
                      </h2>
                      <div className={ui.card}>
                        <div className={styles.sectionCardBody}>
                          {eventToEdit.history.map((entry, index) => (
                            <div key={index} className={styles.historyItem}>
                              <span className={ui.fontMedium}>{entry.action}</span> por {entry.user} •{' '}
                              {format(parseISO(entry.timestamp), "d MMM 'a las' HH:mm", {
                                locale: es,
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
            {!showTypePicker ? (
              <ModalFooter>
                {saveError && (
                  <p className={ui.alertError} style={{ marginBottom: '0.75rem' }}>
                    {saveError}
                  </p>
                )}
                <ModalActions>
                  <button
                    type="submit"
                    className={modalBtnPrimary}
                    disabled={!formData.type || saving}
                  >
                    {saving ? 'Guardando…' : isEditing ? 'Guardar Cambios' : 'Registrar Actividad'}
                  </button>
                  {eventToEdit && canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDelete(eventToEdit.id)}
                      className={ui.btnDanger}
                    >
                      Eliminar
                    </button>
                  )}
                </ModalActions>
              </ModalFooter>
            ) : null}
          </form>
        )}
      </div>
      {showTypeManager && isAdmin && (
        <ActivityTypeManager
          types={activityTypes}
          onUpdated={refreshActivityTypes}
          onClose={closeTypeManager}
          onCreated={handleTypeCreated}
          createOnly
        />
      )}
      </ModalOverlay>

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Eliminar actividad"
        message="¿Eliminar esta actividad? Esta acción no se puede deshacer."
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => {
          if (!deleting) setDeleteConfirm(null);
        }}
      />

      <ConfirmDialog
        open={signatureCancelConfirm !== null}
        title={
          signatureCancelConfirm?.scope === 'all'
            ? 'Eliminar todas las firmas'
            : 'Cancelar firma'
        }
        message={
          signatureCancelConfirm?.scope === 'all'
            ? '¿Eliminar todas las firmas de esta actividad? Los operarios deberán volver a firmar sus horas.'
            : signatureCancelConfirm?.scope === 'user'
              ? signatureCancelConfirm.userId === currentUser?.id
                ? '¿Cancelar tu firma? Las horas dejarán de estar confirmadas hasta que vuelvas a firmar.'
                : `¿Cancelar la firma de ${signatureCancelConfirm.userName}? Deberá volver a firmar sus horas.`
              : ''
        }
        confirmLabel={
          signatureCancelConfirm?.scope === 'all' ? 'Eliminar todas' : 'Cancelar firma'
        }
        loading={saving}
        onConfirm={() => void executeCancelSignature()}
        onCancel={() => {
          if (!saving) setSignatureCancelConfirm(null);
        }}
      />

      {documentModal && formData.clientId && (
        <DocumentFormModal
          open
          closeAllPopupsOnSave={false}
          onClose={() => {
            setDocumentModal(null);
            setDuplicateSourceInvoice(null);
          }}
          onSaved={handleDocumentSaved}
          clients={clients}
          initialClientId={formData.clientId}
          initialActivityId={resolvedActivityId ?? eventToEdit?.activityId ?? ''}
          externalActivityId={resolvedActivityId ?? eventToEdit?.activityId ?? ''}
          lockClientId
          defaultType={
            isAdmin && activityHasLinkedDeliveryNote(linkedDocs)
              ? 'invoice'
              : 'delivery-note'
          }
          duplicateFrom={documentModal.type === 'duplicate' ? duplicateSourceInvoice : null}
          editingDoc={documentModal.type === 'edit' ? documentModal.editingDoc ?? null : null}
          initialReloadFromDeliveryNotes={documentModal.reloadFromDeliveryNotes}
          linkedCalendarEvent={activeEvent}
          initialCreationMode={
            documentModal.type === 'create' ? (documentModal.creationMode ?? 'generate') : 'generate'
          }
          fixedDocType={
            documentModal.type === 'edit' && documentModal.editingDoc?.type === 'invoice'
              ? 'invoice'
              : undefined
          }
        />
      )}

      <ActivityDeliveryNotePreviewModal
        open={deliveryNotePreview.previewOpen}
        url={deliveryNotePreview.previewUrl}
        title={deliveryNotePreview.previewTitle}
        hint={deliveryNotePreview.previewHint}
        fileName={deliveryNotePreview.previewFileName}
        loading={deliveryNotePreview.previewLoading}
        error={deliveryNotePreview.previewError}
        persisted={deliveryNotePreview.previewPersisted}
        onClose={deliveryNotePreview.closePreview}
        onDownload={() => void deliveryNotePreview.downloadActivePreview()}
      />
    </>
  );
}
