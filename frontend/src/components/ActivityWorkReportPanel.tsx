import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';

import { format, parseISO } from 'date-fns';

import { es } from 'date-fns/locale';

import { CircleMinus, ClipboardList, Plus, Trash2 } from 'lucide-react';

import type {
  Activity,
  ActivityType,
  ActivityWorkReportSurfaceStatus,
  CalendarEvent,
  Document,
  UserAssignee,
} from '@shared/types';

import {

  buildDocumentConceptCatalog,

  canEditActivityWorkReport,

  canSubmitActivityWorkReport,

  findActivityDeliveryNoteForWorker,

  DEFAULT_DOCUMENT_TAX_RATE,

  formatDocumentAmount,

  formatHoursMinutes,

  formatWorkReportNotesSummary,

  hoursMinutesToWorkedMinutes,

  getActivityWorkReport,

  getActivityWorkReportExtraItems,

  getActivityWorkReportZones,

  getActivityWorkReportSurfaceStatus,

  getDefaultWorkReportWorkedMinutes,

  getHalconeriaConceptLabels,

  getLineItemConceptText,

  getUserInitials,

  hasMultipleWorkReportAssignees,

  isActivityStarted,

  normalizeConceptKey,

  resolveInvoiceConceptDefaultPrice,

  validateWorkReportSubmitClientEmail,

  workedMinutesToHours,

  workReportHasZoneContent,

} from '@shared/types';

import { activitiesService, invalidateActivitiesCache } from '@/api/activities';

import { ApiError } from '@/api/client';

import { documentsService } from '@/api/documents';

import ConfirmDialog from '@/components/ConfirmDialog';

import { workspaceBillingSettingsService } from '@/api/workspaceBillingSettings';

import ActivityWorkReportZonesEditor, {
  buildWorkReportFormSnapshot,
  buildWorkReportSavedSnapshot,
  mapWorkReportZonesFromActivity,
  mergeWorkReportZoneDrafts,
  serializeWorkReportZoneDrafts,
  type WorkReportZoneDraft,
} from '@/components/ActivityWorkReportZonesEditor';
import InvoiceConceptCombobox from '@/components/InvoiceConceptCombobox';

import NumericPartSelect from '@/components/forms/NumericPartSelect';
import TimeSelect from '@/components/forms/TimeSelect';

import { useActivityModal } from '@/context/activityModalContext';

import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';

import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';

import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';

import { cx } from '@/lib/cx';

import { resolveWorkspaceBillingSettings } from '@/lib/resolveWorkspaceBillingSettings';

import ui from '@/styles/shared.module.css';

import styles from '@/pages/Calendar.module.css';

import lineStyles from '@/components/DocumentFormModal.module.css';



export type WorkedTimeDraft = {

  hours: string;

  minutes: string;

};



export const EMPTY_WORKED_TIME: WorkedTimeDraft = { hours: '', minutes: '' };



type ExtraItemDraft = {

  name: string;

  description: string;

  quantity: number;

  price: number;

};



function parseBoundedInt(raw: string, max: number): number {

  const trimmed = raw.trim();

  if (!trimmed) return 0;

  const value = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(value) || value < 0) return 0;

  return Math.min(max, value);

}



export function splitWorkedMinutes(minutes: number): WorkedTimeDraft {

  if (!Number.isFinite(minutes) || minutes <= 0) return EMPTY_WORKED_TIME;

  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  return { hours: String(hours), minutes: String(mins) };

}



function timeToMinutesHHmm(time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
  if ([hours, minutes].some((value) => Number.isNaN(value))) return null;
  return hours * 60 + minutes;
}



function minutesToTimeHHmm(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}



function endTimeFromStartAndWorkedMinutes(
  startTime: string,
  workedMinutes: number,
): string | null {
  const start = timeToMinutesHHmm(startTime);
  if (start == null || workedMinutes <= 0) return null;
  return minutesToTimeHHmm(start + workedMinutes);
}



function workReportStatusLabel(

  status: ActivityWorkReportSurfaceStatus,

  workedMinutes?: number,

): string {

  if (status === 'submitted') {

    return formatHoursMinutes(workedMinutesToHours(workedMinutes ?? 0)) ?? 'Informe enviado';

  }

  if (status === 'draft') return 'Borrador';

  return 'Informe pendiente';

}



function workReportSurfaceStatusPresentation(

  status: ActivityWorkReportSurfaceStatus,

  options?: { workedMinutes?: number; statusLabel?: string },

): { label: string; tone: string } {

  const { workedMinutes, statusLabel } = options ?? {};

  if (statusLabel === 'Borrador guardado') {

    return { label: statusLabel, tone: styles.activityViewDeliveryNoteStatusDraft };

  }

  if (statusLabel === 'Cambios sin guardar') {

    return { label: statusLabel, tone: styles.activityViewDeliveryNoteStatusPending };

  }

  if (status === 'submitted') {

    return {

      label: workReportStatusLabel(status, workedMinutes),

      tone: styles.activityViewDeliveryNoteStatusIssued,

    };

  }

  if (status === 'draft') {

    return { label: 'Borrador', tone: styles.activityViewDeliveryNoteStatusDraft };

  }

  return { label: 'Informe pendiente', tone: styles.activityViewDeliveryNoteStatusPending };

}



type ActivityWorkReportHoursCardProps = {

  userId: string;

  workedTimeDraft: WorkedTimeDraft;

  onWorkedTimeChange: (draft: WorkedTimeDraft) => void;

  startTime?: string;

  endTime?: string;

  onStartTimeChange?: (startTime: string) => void;

  defaultWorkedMinutes: number;

  multipleAssignees: boolean;

  disabled?: boolean;

  saving?: boolean;

  compact?: boolean;

  className?: string;

};



export function ActivityWorkReportHoursCard({

  userId,

  workedTimeDraft,

  onWorkedTimeChange,

  startTime = '',

  endTime = '',

  onStartTimeChange,

  defaultWorkedMinutes,

  multipleAssignees,

  disabled = false,

  saving = false,

  compact = false,

  className,

}: ActivityWorkReportHoursCardProps) {

  const showScheduleFields = Boolean(onStartTimeChange);

  const workedMinutes = hoursMinutesToWorkedMinutes(
    parseBoundedInt(workedTimeDraft.hours, 24),
    parseBoundedInt(workedTimeDraft.minutes, 59),
  );

  const computedEndTime =
    showScheduleFields && /^\d{2}:\d{2}$/.test(startTime.trim()) && workedMinutes > 0
      ? endTimeFromStartAndWorkedMinutes(startTime.trim(), workedMinutes)
      : null;

  const displayEndTime = computedEndTime ?? (endTime && /^\d{2}:\d{2}$/.test(endTime) ? endTime : null);

  return (

    <div className={cx(styles.activityWorkReportHoursCard, compact && styles.activityWorkReportHoursCardCompact, className)}>

      {!compact && !showScheduleFields ? (
        <p className={styles.activityWorkReportFieldLabel}>Horas trabajadas</p>
      ) : null}

      <div className={styles.activityWorkReportHoursRow}>

        {showScheduleFields ? (
          <div
            className={cx(
              styles.activityWorkReportHoursUnit,
              styles.activityWorkReportHoursUnitStart,
            )}
          >
            <label
              className={styles.activityWorkReportHoursUnitLabel}
              htmlFor={`activity-work-report-start-${userId}-hour`}
            >
              Inicio
            </label>
            <TimeSelect
              id={`activity-work-report-start-${userId}`}
              value={startTime}
              disabled={disabled || saving}
              ariaLabel="Hora de inicio"
              className={styles.activityWorkReportTimeSelect}
              onChange={(nextStartTime) => onStartTimeChange?.(nextStartTime)}
            />
          </div>
        ) : null}

        <div className={styles.activityWorkReportHoursDurationGroup}>
        <div className={cx(styles.activityWorkReportHoursUnit, styles.activityWorkReportHoursUnitDuration)}>

          <label

            className={styles.activityWorkReportHoursUnitLabel}

            htmlFor={`activity-work-report-hours-${userId}`}

          >

            Horas

          </label>

          <NumericPartSelect

            id={`activity-work-report-hours-${userId}`}

            max={24}

            className={styles.activityWorkReportHoursInput}

            value={workedTimeDraft.hours}

            disabled={disabled || saving}

            ariaLabel="Horas trabajadas"

            onChange={(hours) =>

              onWorkedTimeChange({

                ...workedTimeDraft,

                hours,

              })

            }

          />

        </div>

        <span className={styles.activityWorkReportHoursSep} aria-hidden>

          :

        </span>

        <div className={cx(styles.activityWorkReportHoursUnit, styles.activityWorkReportHoursUnitDuration)}>

          <label

            className={styles.activityWorkReportHoursUnitLabel}

            htmlFor={`activity-work-report-minutes-${userId}`}

          >

            Min

          </label>

          <NumericPartSelect

            id={`activity-work-report-minutes-${userId}`}

            max={59}

            className={styles.activityWorkReportHoursInput}

            value={workedTimeDraft.minutes}

            disabled={disabled || saving}

            ariaLabel="Minutos trabajados"

            onChange={(minutes) =>

              onWorkedTimeChange({

                ...workedTimeDraft,

                minutes,

              })

            }

          />

        </div>

        </div>

      </div>

      {showScheduleFields && displayEndTime ? (
        <p className={styles.activityWorkReportHint}>
          Fin calculado: {displayEndTime}
        </p>
      ) : null}

      {defaultWorkedMinutes > 0 ? (

        <p className={styles.activityWorkReportHint}>

          {multipleAssignees ? 'Horas dedicadas planificadas' : 'Horas planificadas'}:{' '}

          {formatHoursMinutes(workedMinutesToHours(defaultWorkedMinutes)) ?? '0m'}

        </p>

      ) : null}

    </div>

  );

}



type ActivityWorkReportFormHeaderProps = {

  currentUser: Pick<UserAssignee, 'id' | 'name' | 'role'>;

  status: ActivityWorkReportSurfaceStatus;

  workedMinutes?: number;

  /** Cuando se usa como titulo de seccion fuera del panel. */

  sectionTitleId?: string;

  /** Sustituye la etiqueta de estado (ej. Borrador guardado). */

  statusLabel?: string;

};



export function ActivityWorkReportFormHeader({

  currentUser,

  status,

  workedMinutes,

  sectionTitleId,

  statusLabel,

}: ActivityWorkReportFormHeaderProps) {

  const TitleTag = sectionTitleId ? 'h2' : 'h3';

  const statusPresentation = workReportSurfaceStatusPresentation(status, {

    workedMinutes,

    statusLabel,

  });



  return (

    <header

      className={cx(

        styles.activityWorkReportFormHeader,

        sectionTitleId && styles.activityWorkReportSectionHeader,

      )}

    >

      <span

        className={cx(ui.userAvatar, styles.activityWorkReportAvatar)}

        aria-hidden

      >

        {getUserInitials(currentUser.name)}

      </span>

      <div className={styles.activityWorkReportFormHeading}>

        <TitleTag

          id={sectionTitleId}

          className={styles.activityWorkReportFormTitle}

        >

          Tu informe

        </TitleTag>

        <p className={styles.activityWorkReportFormSubtitle}>{currentUser.name}</p>

      </div>

      <span

        className={cx(

          styles.activityViewDeliveryNoteStatus,

          statusPresentation.tone,

        )}

      >

        {statusLabel ?? statusPresentation.label}

      </span>

    </header>

  );

}



function mapExtraItemDraft(

  item: Pick<ExtraItemDraft, 'name' | 'description' | 'quantity' | 'price'>,

): ExtraItemDraft {

  const concept = getLineItemConceptText(item);

  return {

    name: item.name?.trim() || concept,

    description: item.description?.trim() ?? '',

    quantity: item.quantity,

    price: item.price,

  };

}



function extraItemAmount(item: ExtraItemDraft): number {

  const qty = Number.isFinite(item.quantity) ? item.quantity : 0;

  const price = Number.isFinite(item.price) ? item.price : 0;

  return qty * price;

}



function extraItemGrossAmount(net: number, taxRate: number): number {

  const safeRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0;

  return Math.round(net * (1 + safeRate / 100) * 100) / 100;

}



function serializeExtraItems(items: ExtraItemDraft[]) {

  return items

    .map(mapExtraItemDraft)

    .filter((item) => Boolean(getLineItemConceptText(item)))

    .map((item) => ({

      name: item.name,

      description: item.description,

      quantity: item.quantity,

      price: item.price,

    }));

}



type ActivityWorkReportPanelProps = {

  activity: Activity;

  event: CalendarEvent | null;

  currentUser: Pick<UserAssignee, 'id' | 'name' | 'role'> | null;

  activityTypes: ActivityType[];

  documents?: Document[];

  canManageExtraItems?: boolean;

  disabled?: boolean;

  onActivityUpdated?: (activity: Activity) => void;

  onDocumentsRefresh?: () => void | Promise<void>;

  onError?: (message: string | null) => void;

  /** Mueve el encabezado del formulario fuera del panel (titulo de seccion del modal). */
  formHeaderPlacement?: 'panel' | 'section';

  workedTimeDraft?: WorkedTimeDraft;

  onWorkedTimeChange?: (draft: WorkedTimeDraft) => void;

  startTime?: string;

  endTime?: string;

  onStartTimeChange?: (startTime: string) => void;

  onWorkReportSaveStateChange?: (state: { isDirty: boolean; isSaved: boolean }) => void;

  workReportActionsRef?: MutableRefObject<ActivityWorkReportActionsHandle | null>;

  /** Operarios asignados; el admin los ve todos con zonas e imagenes. */
  assignees?: Pick<UserAssignee, 'id' | 'name'>[];

  clientEmail?: string;

  activityCreatesDeliveryNote?: boolean;

};

export type ActivityWorkReportActionsHandle = {
  saveDraft: () => void;
  submitReport: () => void;
};



export default function ActivityWorkReportPanel({

  activity,

  event,

  currentUser,

  activityTypes,

  documents = [],

  canManageExtraItems = false,

  disabled = false,

  onActivityUpdated,

  onDocumentsRefresh,

  onError,

  formHeaderPlacement = 'panel',

  workedTimeDraft: workedTimeDraftProp,

  onWorkedTimeChange,

  startTime = '',

  endTime = '',

  onStartTimeChange,

  onWorkReportSaveStateChange,

  workReportActionsRef,

  assignees = [],

  clientEmail,

  activityCreatesDeliveryNote = false,

}: ActivityWorkReportPanelProps) {

  const { notifyActivitySaved } = useActivityModal();

  const { boundaries } = useWorkspaceScheduleSettings();

  const { settings: conceptSettings } = useInvoiceConceptSettings();

  const { invoiceConceptFreeCreationEnabled } = useWorkspaceFeatureSettings();

  const canEditLinePrice = canManageExtraItems;

  const [saving, setSaving] = useState(false);

  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  const [savingMode, setSavingMode] = useState<'draft' | 'submit' | 'concepts' | null>(null);

  const [zonesDraft, setZonesDraft] = useState<WorkReportZoneDraft[]>(() =>
    mapWorkReportZonesFromActivity(null),
  );

  const [savedFormSnapshot, setSavedFormSnapshot] = useState(() =>
    buildWorkReportSavedSnapshot(null),
  );

  const [internalWorkedTimeDraft, setInternalWorkedTimeDraft] =
    useState<WorkedTimeDraft>(EMPTY_WORKED_TIME);

  const isWorkedTimeControlled = workedTimeDraftProp !== undefined;

  const workedTimeDraft = isWorkedTimeControlled
    ? workedTimeDraftProp
    : internalWorkedTimeDraft;

  const setWorkedTimeDraft = useCallback(
    (updater: WorkedTimeDraft | ((prev: WorkedTimeDraft) => WorkedTimeDraft)) => {
      const next =
        typeof updater === 'function'
          ? updater(isWorkedTimeControlled ? workedTimeDraftProp! : internalWorkedTimeDraft)
          : updater;
      if (isWorkedTimeControlled) {
        onWorkedTimeChange?.(next);
      } else {
        setInternalWorkedTimeDraft(next);
      }
    },
    [
      internalWorkedTimeDraft,
      isWorkedTimeControlled,
      onWorkedTimeChange,
      workedTimeDraftProp,
    ],
  );

  const [extraItemsDraft, setExtraItemsDraft] = useState<ExtraItemDraft[]>([]);

  const pendingUnsavedBaselineKeyRef = useRef<string | null>(null);
  const onWorkedTimeChangeRef = useRef(onWorkedTimeChange);

  useEffect(() => {
    onWorkedTimeChangeRef.current = onWorkedTimeChange;
  }, [onWorkedTimeChange]);

  const syncWorkReportBaselineFromActivity = useCallback(
    (updated: Activity) => {
      if (!currentUser) return;
      const report = getActivityWorkReport(updated, currentUser.id);
      if (!report) return;

      setZonesDraft((current) =>
        mergeWorkReportZoneDrafts(current, getActivityWorkReportZones(report)),
      );
      setSavedFormSnapshot(buildWorkReportSavedSnapshot(report));
      pendingUnsavedBaselineKeyRef.current = null;

      if (isWorkedTimeControlled && report.workedMinutes > 0) {
        onWorkedTimeChangeRef.current?.(splitWorkedMinutes(report.workedMinutes));
      }
    },
    [currentUser, isWorkedTimeControlled],
  );

  const [workspaceTaxRate, setWorkspaceTaxRate] = useState(DEFAULT_DOCUMENT_TAX_RATE);



  const canSubmit = useMemo(

    () =>

      Boolean(

        currentUser &&

          canSubmitActivityWorkReport(currentUser, { activity, event }),

      ),

    [activity, currentUser, event],

  );



  const activityStarted = useMemo(

    () => isActivityStarted({ activity, event }),

    [activity, event],

  );



  const ownReport = currentUser ? getActivityWorkReport(activity, currentUser.id) : null;

  const ownStatus = currentUser

    ? getActivityWorkReportSurfaceStatus(activity, currentUser.id)

    : 'none';

  const canEditOwn = Boolean(

    currentUser &&

      canEditActivityWorkReport(currentUser, {

        activity,

        event,

        targetUserId: currentUser.id,

      }),

  );

  const ownDeliveryNote = useMemo(() => {
    if (!currentUser || !activity.id) return null;
    return (
      findActivityDeliveryNoteForWorker(
        activity.id,
        currentUser.id,
        documents,
        activity,
      ) ?? null
    );
  }, [activity, currentUser, documents]);

  const isLockedByDeliveryNote = Boolean(ownDeliveryNote);



  const multipleAssignees = useMemo(

    () => hasMultipleWorkReportAssignees(activity, event),

    [activity, event],

  );

  const defaultWorkedMinutes = useMemo(() => {

    if (!currentUser) return 0;

    return getDefaultWorkReportWorkedMinutes(

      activity,

      event,

      currentUser.id,

      boundaries,

    );

  }, [activity, boundaries, currentUser, event]);



  const draftWorkedMinutes = useMemo(

    () =>

      hoursMinutesToWorkedMinutes(

        parseBoundedInt(workedTimeDraft.hours, 24),

        parseBoundedInt(workedTimeDraft.minutes, 59),

      ),

    [workedTimeDraft.hours, workedTimeDraft.minutes],

  );



  const savedExtraItems = useMemo(

    () => getActivityWorkReportExtraItems(activity).map(mapExtraItemDraft),

    [activity],

  );



  const conceptCatalog = useMemo(() => {

    const lineLabels = [

      ...extraItemsDraft.map((item) => item.name),

      ...savedExtraItems.map((item) => item.name),

    ];

    const extraLabels = invoiceConceptFreeCreationEnabled

      ? [...getHalconeriaConceptLabels(), ...lineLabels]

      : lineLabels;

    const catalogDocs = invoiceConceptFreeCreationEnabled ? documents : [];

    return buildDocumentConceptCatalog(catalogDocs, conceptSettings, extraLabels);

  }, [

    conceptSettings,

    documents,

    extraItemsDraft,

    savedExtraItems,

    invoiceConceptFreeCreationEnabled,

  ]);



  const extraItemsDirty = useMemo(() => {

    const current = serializeExtraItems(extraItemsDraft);

    const saved = serializeExtraItems(savedExtraItems);

    return JSON.stringify(current) !== JSON.stringify(saved);

  }, [extraItemsDraft, savedExtraItems]);



  const isAdmin = currentUser?.role === 'admin';

  const isOwnAssignee = Boolean(

    currentUser && assignees.some((user) => user.id === currentUser.id),

  );

  const showOwnForm =

    canEditOwn && currentUser && !isLockedByDeliveryNote && (!isAdmin || isOwnAssignee);

  const showExtraItemsSection =
    showOwnForm && canManageExtraItems && activityStarted;

  const showSavedExtraItems = !showExtraItemsSection && savedExtraItems.length > 0;

  const hasZoneDraftContent = useMemo(
    () => workReportHasZoneContent(zonesDraft),
    [zonesDraft],
  );

  const currentFormSnapshot = useMemo(
    () => buildWorkReportFormSnapshot(zonesDraft, draftWorkedMinutes),
    [draftWorkedMinutes, zonesDraft],
  );

  const workReportDraftDirty = useMemo(
    () => currentFormSnapshot !== savedFormSnapshot,
    [currentFormSnapshot, savedFormSnapshot],
  );

  const canSaveWorkReportDraft = Boolean(
    showOwnForm &&
      canEditOwn &&
      ((workReportDraftDirty && (draftWorkedMinutes > 0 || hasZoneDraftContent)) ||
        (showExtraItemsSection && extraItemsDirty)),
  );

  const canSendWorkReport = Boolean(
    showOwnForm && canEditOwn && canSubmit && draftWorkedMinutes > 0,
  );

  const showDraftSavedState = Boolean(
    showOwnForm &&
      !extraItemsDirty &&
      !workReportDraftDirty &&
      ownReport?.status === 'draft',
  );

  const showDraftButton = Boolean(showOwnForm && canEditOwn);

  const showSubmitButton = Boolean(showOwnForm && canEditOwn && canSubmit);

  const showWorkReportActions = showDraftButton || showSubmitButton;

  const draftButtonLabel =
    savingMode === 'draft'
      ? 'Guardando…'
      : showDraftSavedState
        ? 'Borrador guardado'
        : showExtraItemsSection && extraItemsDirty && !workReportDraftDirty
          ? 'Guardar conceptos'
          : ownReport
            ? 'Actualizar borrador'
            : 'Guardar borrador';

  const submitButtonLabel =
    savingMode === 'submit' ? 'Enviando…' : 'Enviar informe de trabajo';

  const ensureZonesPersisted = useCallback(async (): Promise<Activity | null> => {
    if (!currentUser || disabled || saving || !activity.id) return null;

    const serialized = serializeWorkReportZoneDrafts(zonesDraft);
    if (serialized.length === 0) return activity;

    const needsSave = workReportDraftDirty || !ownReport;
    if (!needsSave) return activity;

    try {
      const updated = await activitiesService.submitWorkReport(activity.id, {
        workedMinutes: draftWorkedMinutes,
        zones: serialized,
        status: 'draft',
      });
      syncWorkReportBaselineFromActivity(updated);
      await onActivityUpdated?.(updated);
      return updated;
    } catch (error) {
      onError?.(
        error instanceof ApiError
          ? error.message
          : 'No se pudo guardar las zonas del informe. Intentalo de nuevo.',
      );
      return null;
    }
  }, [
    activity,
    currentUser,
    disabled,
    draftWorkedMinutes,
    onActivityUpdated,
    onError,
    ownReport,
    saving,
    syncWorkReportBaselineFromActivity,
    workReportDraftDirty,
    zonesDraft,
  ]);

  useEffect(() => {
    const report = currentUser ? getActivityWorkReport(activity, currentUser.id) : null;
    const zones = mapWorkReportZonesFromActivity(report);
    setZonesDraft(zones);
    const baselineKey = `${activity.id}:${currentUser?.id ?? ''}`;
    const savedMinutes =
      report?.workedMinutes && report.workedMinutes > 0 ? report.workedMinutes : null;

    if (savedMinutes != null) {
      pendingUnsavedBaselineKeyRef.current = null;
      setSavedFormSnapshot(buildWorkReportFormSnapshot(zones, savedMinutes));
    } else {
      pendingUnsavedBaselineKeyRef.current = baselineKey;
    }

    if (
      isWorkedTimeControlled &&
      report?.workedMinutes &&
      report.workedMinutes > 0
    ) {
      onWorkedTimeChangeRef.current?.(splitWorkedMinutes(report.workedMinutes));
    }
  }, [activity.id, currentUser?.id, isWorkedTimeControlled]);

  useEffect(() => {
    if (!pendingUnsavedBaselineKeyRef.current) return;

    const expectedMinutes =
      ownReport?.workedMinutes && ownReport.workedMinutes > 0
        ? ownReport.workedMinutes
        : defaultWorkedMinutes;

    if (expectedMinutes > 0 && draftWorkedMinutes === 0) return;

    setSavedFormSnapshot(buildWorkReportFormSnapshot(zonesDraft, draftWorkedMinutes));
    pendingUnsavedBaselineKeyRef.current = null;
  }, [defaultWorkedMinutes, draftWorkedMinutes, ownReport?.workedMinutes, zonesDraft]);

  useEffect(() => {
    if (!ownReport || workReportDraftDirty) return;
    syncWorkReportBaselineFromActivity(activity);
  }, [activity.id, ownReport?.updatedAt, syncWorkReportBaselineFromActivity, workReportDraftDirty]);

  useEffect(() => {
    onWorkReportSaveStateChange?.({
      isDirty: workReportDraftDirty,
      isSaved: showDraftSavedState,
    });
  }, [onWorkReportSaveStateChange, showDraftSavedState, workReportDraftDirty]);



  useEffect(() => {
    if (isWorkedTimeControlled) return;

    if (ownReport?.workedMinutes && ownReport.workedMinutes > 0) {
      setInternalWorkedTimeDraft(splitWorkedMinutes(ownReport.workedMinutes));
      return;
    }

    if (defaultWorkedMinutes > 0) {
      setInternalWorkedTimeDraft(splitWorkedMinutes(defaultWorkedMinutes));
      return;
    }

    setInternalWorkedTimeDraft(EMPTY_WORKED_TIME);
  }, [
    activity.id,
    defaultWorkedMinutes,
    isWorkedTimeControlled,
    ownReport?.updatedAt,
    ownReport?.workedMinutes,
  ]);



  useEffect(() => {

    const items = getActivityWorkReportExtraItems(activity);

    setExtraItemsDraft(

      items.length > 0

        ? items.map(mapExtraItemDraft)

        : [],

    );

  }, [activity.id, activity.workReportExtraItems]);



  useEffect(() => {

    if (!showExtraItemsSection) return;

    let cancelled = false;

    void (async () => {

      const settings = await workspaceBillingSettingsService.get().catch(() => null);

      if (cancelled || !settings) return;

      const resolved = await resolveWorkspaceBillingSettings(settings);

      if (cancelled) return;

      setWorkspaceTaxRate(resolved.defaultTaxRate);

    })();

    return () => {

      cancelled = true;

    };

  }, [showExtraItemsSection]);



  const validateExtraItemsDraft = useCallback((): boolean => {

    if (extraItemsDraft.some((item) => item.name.trim() === '' && item.description.trim() === '')) {

      onError?.('Todas las líneas necesitan un concepto.');

      return false;

    }

    if (extraItemsDraft.some((item) => item.quantity <= 0)) {

      onError?.('La cantidad debe ser mayor que 0.');

      return false;

    }

    return true;

  }, [extraItemsDraft, onError]);



  const persistExtraItemsIfDirty = useCallback(
    async (latestActivity: Activity): Promise<Activity> => {
      if (!showExtraItemsSection || !extraItemsDirty) return latestActivity;
      const items = serializeExtraItems(extraItemsDraft);
      const updated = await activitiesService.updateWorkReportExtraItems(latestActivity.id, items);
      onActivityUpdated?.(updated);
      return updated;
    },
    [extraItemsDirty, extraItemsDraft, onActivityUpdated, showExtraItemsSection],
  );

  const handleSaveDraft = useCallback(async () => {
    if (disabled || saving) return;

    const shouldSaveReport = Boolean(showOwnForm && canEditOwn && workReportDraftDirty);
    const shouldSaveConcepts = showExtraItemsSection && extraItemsDirty;

    if (!shouldSaveReport && !shouldSaveConcepts) return;

    if (shouldSaveConcepts && !validateExtraItemsDraft()) return;

    if (shouldSaveReport && draftWorkedMinutes <= 0 && !hasZoneDraftContent) {
      onError?.('Indica horas trabajadas o anade notas por zonas.');
      return;
    }

    setSaving(true);
    setSavingMode(shouldSaveReport ? 'draft' : 'concepts');
    onError?.(null);

    try {
      let latestActivity = activity;

      if (shouldSaveConcepts) {
        latestActivity = await persistExtraItemsIfDirty(latestActivity);
      }

      if (shouldSaveReport) {
        latestActivity = await activitiesService.submitWorkReport(latestActivity.id, {
          workedMinutes: draftWorkedMinutes,
          zones: serializeWorkReportZoneDrafts(zonesDraft),
          status: 'draft',
        });
        syncWorkReportBaselineFromActivity(latestActivity);
      }

      await onActivityUpdated?.(latestActivity);
      await onDocumentsRefresh?.();
      await notifyActivitySaved();
    } catch (error) {
      onError?.(
        error instanceof ApiError
          ? error.message
          : 'No se pudo guardar el borrador. Intentalo de nuevo.',
      );
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }, [
    activity,
    canEditOwn,
    currentUser,
    disabled,
    draftWorkedMinutes,
    extraItemsDirty,
    hasZoneDraftContent,
    notifyActivitySaved,
    onActivityUpdated,
    onDocumentsRefresh,
    onError,
    persistExtraItemsIfDirty,
    saving,
    showExtraItemsSection,
    showOwnForm,
    syncWorkReportBaselineFromActivity,
    validateExtraItemsDraft,
    workReportDraftDirty,
    zonesDraft,
  ]);

  const handleSubmitReport = useCallback(async () => {
    if (disabled || saving || !showOwnForm || !canEditOwn || !canSubmit) return;

    if (showExtraItemsSection && extraItemsDirty && !validateExtraItemsDraft()) return;

    if (draftWorkedMinutes <= 0) {
      onError?.('Indica las horas reales trabajadas para enviar el informe.');
      return;
    }

    const emailError = validateWorkReportSubmitClientEmail(
      clientEmail,
      activityCreatesDeliveryNote,
    );
    if (emailError) {
      onError?.(emailError);
      return;
    }

    setSaving(true);
    setSavingMode('submit');
    onError?.(null);

    try {
      let latestActivity = activity;

      if (showExtraItemsSection && extraItemsDirty) {
        latestActivity = await persistExtraItemsIfDirty(latestActivity);
      }

      latestActivity = await activitiesService.submitWorkReport(latestActivity.id, {
        workedMinutes: draftWorkedMinutes,
        zones: serializeWorkReportZoneDrafts(zonesDraft),
        status: 'submitted',
      });
      syncWorkReportBaselineFromActivity(latestActivity);

      await onActivityUpdated?.(latestActivity);
      await onDocumentsRefresh?.();
      await notifyActivitySaved();
    } catch (error) {
      onError?.(
        error instanceof ApiError
          ? error.message
          : 'No se pudo enviar el informe de trabajo. Intentalo de nuevo.',
      );
    } finally {
      setSaving(false);
      setSavingMode(null);
    }
  }, [
    activity,
    activityCreatesDeliveryNote,
    canEditOwn,
    canSubmit,
    clientEmail,
    disabled,
    draftWorkedMinutes,
    extraItemsDirty,
    notifyActivitySaved,
    onActivityUpdated,
    onDocumentsRefresh,
    onError,
    persistExtraItemsIfDirty,
    saving,
    showExtraItemsSection,
    showOwnForm,
    syncWorkReportBaselineFromActivity,
    validateExtraItemsDraft,
    zonesDraft,
  ]);

  const handleDeleteDeliveryNoteToReopen = useCallback(async () => {
    if (!ownDeliveryNote || disabled || saving || !activity.id) return;

    setSaving(true);
    onError?.(null);
    try {
      await documentsService.delete(ownDeliveryNote.id);
      invalidateActivitiesCache();
      const refreshed = await activitiesService.getById(activity.id);
      if (refreshed) {
        onActivityUpdated?.(refreshed);
      }
      await onDocumentsRefresh?.();
      await notifyActivitySaved();
      setReopenConfirmOpen(false);
    } catch (error) {
      onError?.(
        error instanceof ApiError
          ? error.message
          : 'No se pudo eliminar el albaran. Intentalo de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    activity.id,
    disabled,
    notifyActivitySaved,
    onActivityUpdated,
    onDocumentsRefresh,
    onError,
    ownDeliveryNote,
    saving,
  ]);

  useEffect(() => {
    if (!workReportActionsRef) return;
    workReportActionsRef.current = {
      saveDraft: () => {
        void handleSaveDraft();
      },
      submitReport: () => {
        void handleSubmitReport();
      },
    };
    return () => {
      workReportActionsRef.current = null;
    };
  }, [handleSaveDraft, handleSubmitReport, workReportActionsRef]);



  const handleAddExtraItem = useCallback(() => {

    setExtraItemsDraft((current) => [

      ...current,

      { name: '', description: '', quantity: 1, price: 0 },

    ]);

  }, []);



  const handleRemoveExtraItem = useCallback((index: number) => {

    setExtraItemsDraft((current) => current.filter((_, itemIndex) => itemIndex !== index));

  }, []);



  const handleExtraItemChange = useCallback(

    (index: number, field: keyof ExtraItemDraft, value: string | number) => {

      setExtraItemsDraft((current) => {

        const next = [...current];

        if (field === 'name' && typeof value === 'string') {

          const conceptKey = normalizeConceptKey(value);

          const catalogPrice = resolveInvoiceConceptDefaultPrice(conceptKey, conceptSettings);

          const hasCatalogPrice = conceptSettings.some(

            (setting) => setting.normalizedKey === conceptKey,

          );

          next[index] = {

            ...next[index],

            name: value,

            price: hasCatalogPrice ? catalogPrice : next[index].price,

          };

        } else {

          next[index] = { ...next[index], [field]: value };

        }

        return next;

      });

    },

    [conceptSettings],

  );



  const ownReportEntry = useMemo(() => {
    if (!currentUser) return null;
    const report = getActivityWorkReport(activity, currentUser.id);
    return {
      report,
      status: getActivityWorkReportSurfaceStatus(activity, currentUser.id),
    };
  }, [activity, currentUser]);

  const submittedReportZones = useMemo(
    () => mapWorkReportZonesFromActivity(ownReportEntry?.report),
    [ownReportEntry?.report],
  );



  const showSubmittedOwn = Boolean(
    ownReportEntry?.report?.status === 'submitted' &&
      currentUser &&
      (!showOwnForm || isLockedByDeliveryNote),
  );



  const showHoursSection =
    showOwnForm &&
    currentUser &&
    activityStarted &&
    formHeaderPlacement === 'section';

  const assigneeOverviewEntries = useMemo(() => {
    if (!isAdmin || assignees.length === 0) return [];
    return assignees
      .filter((user) => {
        if (user.id !== currentUser?.id) return true;
        return !showOwnForm && !showSubmittedOwn;
      })
      .map((user) => {
        const report = getActivityWorkReport(activity, user.id);
        const status = getActivityWorkReportSurfaceStatus(activity, user.id);
        const statusPresentation = workReportSurfaceStatusPresentation(status, {
          workedMinutes: report?.workedMinutes,
        });
        const notesSummary = formatWorkReportNotesSummary(report);
        const meta =
          status === 'submitted'
            ? notesSummary ||
              (report?.submittedAt
                ? `Enviado · ${format(parseISO(report.submittedAt), "d MMM yyyy, HH:mm", { locale: es })}`
                : 'Informe enviado.')
            : status === 'draft' && report?.workedMinutes
              ? `${workReportStatusLabel(status, report.workedMinutes)} registradas`
              : 'Falta informe de trabajo.';
        return { user, statusPresentation, meta };
      });
  }, [
    activity,
    assignees,
    currentUser?.id,
    isAdmin,
    showOwnForm,
    showSubmittedOwn,
  ]);

  const showAssigneeOverview = assigneeOverviewEntries.length > 0;

  return (

    <>

    <div className={cx(styles.sectionCardBody, styles.activityWorkReportPanel)}>

      {showHoursSection ? (
        <div className={styles.activityWorkReportHoursSection}>
          <ActivityWorkReportHoursCard
            userId={currentUser.id}
            workedTimeDraft={workedTimeDraft}
            onWorkedTimeChange={setWorkedTimeDraft}
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={onStartTimeChange}
            defaultWorkedMinutes={defaultWorkedMinutes}
            multipleAssignees={multipleAssignees}
            disabled={disabled}
            saving={saving}
          />
        </div>
      ) : null}

      {!activityStarted ? (

        <p className={styles.activityWorkReportNotice}>

          El informe se habilita cuando empiece la actividad.

        </p>

      ) : canEditOwn && !canSubmit ? (

        <p className={styles.activityWorkReportNotice}>

          Puedes ir anotando el informe y guardarlo como borrador. Enviarlo cuando termine la actividad.

        </p>

      ) : null}

      {showAssigneeOverview ? (
        <div className={styles.activityWorkReportAssigneeOverview}>
          <div className={styles.activityViewDocGroupBody}>
            {assigneeOverviewEntries.map(({ user, statusPresentation, meta }) => (
              <div key={user.id} className={styles.activityViewDeliveryNoteCard}>
                <div className={styles.activityViewDeliveryNoteCardMain}>
                  <span className={cx(ui.userAvatar, styles.assigneeAvatar)} aria-hidden>
                    {getUserInitials(user.name)}
                  </span>
                  <div className={styles.activityViewDeliveryNoteCardInfo}>
                    <div className={styles.activityViewDeliveryNoteCardHeader}>
                      <span className={styles.activityViewDeliveryNoteCardTitle}>{user.name}</span>
                      <span
                        className={cx(
                          styles.activityViewDeliveryNoteStatus,
                          statusPresentation.tone,
                        )}
                      >
                        {statusPresentation.label}
                      </span>
                    </div>
                    <p className={styles.activityViewDeliveryNoteCardMeta}>{meta}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showOwnForm && currentUser ? (

        <>

          {formHeaderPlacement === 'panel' ? (

            <div className={styles.activityWorkReportTopRow}>

              <ActivityWorkReportFormHeader

                currentUser={currentUser}

                status={ownStatus}

                workedMinutes={ownReport?.workedMinutes}

              />

              <ActivityWorkReportHoursCard

                userId={currentUser.id}

                workedTimeDraft={workedTimeDraft}

                onWorkedTimeChange={setWorkedTimeDraft}

                startTime={startTime}

                endTime={endTime}

                onStartTimeChange={onStartTimeChange}

                defaultWorkedMinutes={defaultWorkedMinutes}

                multipleAssignees={multipleAssignees}

                disabled={disabled}

                saving={saving}

                compact

              />

            </div>

          ) : null}



          <ActivityWorkReportZonesEditor
            activityId={activity.id}
            zones={zonesDraft}
            disabled={disabled || saving}
            reportUserId={currentUser?.id}
            ensureZonesPersisted={ensureZonesPersisted}
            onZonesChange={setZonesDraft}
            onActivityUpdated={async (updated) => {
              syncWorkReportBaselineFromActivity(updated);
              await onActivityUpdated?.(updated);
            }}
            onError={onError}
          />

        </>

      ) : null}



      {showSubmittedOwn && ownReportEntry?.report ? (

        <div className={styles.activityWorkReportSentBanner}>

          <p className={styles.activityWorkReportSentTitle}>Informe enviado</p>

          <p className={styles.activityWorkReportSentMeta}>

            {workReportStatusLabel('submitted', ownReportEntry.report.workedMinutes)}

            {ownReportEntry.report.submittedAt

              ? ` · ${format(parseISO(ownReportEntry.report.submittedAt), "d MMM yyyy, HH:mm", { locale: es })}`

              : ''}

          </p>

          <ActivityWorkReportZonesEditor
            activityId={activity.id}
            zones={submittedReportZones}
            readOnly
            onZonesChange={() => undefined}
            onActivityUpdated={() => undefined}
          />

          {isLockedByDeliveryNote ? (
            <>
              <p className={styles.activityWorkReportHint}>
                El albaran ya esta emitido. Elimina el albaran para volver a editar el informe
                y generar uno nuevo.
              </p>
              <button
                type="button"
                className={cx(ui.btnSecondary, styles.activityWorkReportReopenBtn)}
                disabled={disabled || saving}
                onClick={() => setReopenConfirmOpen(true)}
              >
                <Trash2 size={16} aria-hidden />
                {saving ? 'Eliminando…' : 'Eliminar albaran y rehacer informe'}
              </button>
            </>
          ) : !canEditOwn ? (
            <p className={styles.activityWorkReportHint}>Ya no se puede modificar.</p>
          ) : null}

        </div>

      ) : null}

      {showExtraItemsSection ? (

        <div className={styles.activityWorkReportExtraItems}>

          <div className={styles.activityWorkReportExtraItemsHeader}>

            <div>

              <p className={styles.activityWorkReportFieldLabel}>Conceptos adicionales</p>

              <p className={styles.activityWorkReportExtraItemsDesc}>

                Se incluyen en el albaran de cada operario junto con sus horas.

              </p>

            </div>

            <button

              type="button"

              className={ui.btnSecondary}

              disabled={disabled || saving}

              onClick={handleAddExtraItem}

            >

              <Plus size={16} aria-hidden />

              Añadir línea

            </button>

          </div>



          {extraItemsDraft.length > 0 ? (

            <div className={lineStyles.linesTable}>

              <div className={lineStyles.linesHead} aria-hidden>

                <span>#</span>

                <span>Concepto</span>

                <span className={lineStyles.linesHeadQty}>Cant.</span>

                <span className={lineStyles.linesHeadPrice}>Precio</span>

                <span className={lineStyles.linesHeadSub}>Importe</span>

                <span />

              </div>

              {extraItemsDraft.map((item, index) => (

                <div key={index} className={styles.activityWorkReportExtraItemLine}>

                  <div className={styles.activityWorkReportExtraItemMain}>

                    <span className={lineStyles.lineIndex}>{index + 1}</span>

                    <div className={lineStyles.lineFieldStack}>

                      <InvoiceConceptCombobox

                        value={item.name}

                        onChange={(next) => handleExtraItemChange(index, 'name', next)}

                        options={conceptCatalog}

                        placeholder="Buscar concepto…"

                        className={lineStyles.lineInput}

                        disabled={disabled || saving}

                        aria-label={`Concepto línea ${index + 1}`}

                      />

                    </div>

                    <div className={lineStyles.lineFieldStack}>

                      <input

                        type="number"

                        min={1}

                        value={item.quantity}

                        disabled={disabled || saving}

                        onChange={(event) =>

                          handleExtraItemChange(

                            index,

                            'quantity',

                            parseInt(event.target.value, 10) || 0,

                          )

                        }

                        className={cx(lineStyles.lineInput, lineStyles.lineInputNum)}

                        aria-label={`Cantidad línea ${index + 1}`}

                      />

                    </div>

                    <div className={lineStyles.lineFieldStack}>

                      <input

                        type="number"

                        min={0}

                        step={0.01}

                        value={item.price}

                        readOnly={!canEditLinePrice}

                        disabled={disabled || saving || !canEditLinePrice}

                        onChange={(event) =>

                          handleExtraItemChange(

                            index,

                            'price',

                            parseFloat(event.target.value) || 0,

                          )

                        }

                        className={cx(lineStyles.lineInput, lineStyles.lineInputNum)}

                        aria-label={`Precio línea ${index + 1}`}

                      />

                    </div>

                    <div className={styles.activityWorkReportExtraItemSubtotal}>

                      <span className={lineStyles.lineSubtotal}>

                        {formatDocumentAmount(extraItemAmount(item))}

                      </span>

                      <span className={styles.activityWorkReportExtraItemGross}>

                        {formatDocumentAmount(

                          extraItemGrossAmount(extraItemAmount(item), workspaceTaxRate),

                        )}{' '}

                        + IVA

                      </span>

                    </div>

                    <button

                      type="button"

                      onClick={() => handleRemoveExtraItem(index)}

                      className={lineStyles.removeLineBtn}

                      disabled={disabled || saving}

                      aria-label={`Eliminar línea ${index + 1}`}

                    >

                      <CircleMinus size={16} />

                    </button>

                  </div>

                  <div className={styles.activityWorkReportExtraItemDescription}>

                    <input

                      type="text"

                      placeholder="Descripción"

                      value={item.description}

                      disabled={disabled || saving}

                      onChange={(event) =>

                        handleExtraItemChange(index, 'description', event.target.value)

                      }

                      className={lineStyles.lineInput}

                      aria-label={`Descripción línea ${index + 1}`}

                    />

                  </div>

                </div>

              ))}

            </div>

          ) : (

            <p className={styles.activityWorkReportExtraItemsEmpty}>

              Sin líneas extra. Pulsa &quot;Añadir línea&quot; para materiales u otros servicios.

            </p>

          )}

        </div>

      ) : null}



      {showSavedExtraItems ? (

        <ul className={styles.assigneeList} aria-label="Conceptos adicionales del albarán">

          {savedExtraItems.map((item, index) => (

            <li key={`${item.name}-${index}`} className={styles.assigneeListItem}>

              <span className={styles.assigneeListName}>{getLineItemConceptText(item)}</span>

              <span className={styles.assigneeListFootnote}>

                {item.quantity} x {formatDocumentAmount(item.price)} ={' '}

                {formatDocumentAmount(extraItemAmount(item))}

              </span>

            </li>

          ))}

        </ul>

      ) : null}



      {showWorkReportActions ? (

        <div className={styles.activityWorkReportActionsWrap}>

          {showDraftSavedState ? (
            <p className={styles.activityWorkReportSaveStateSaved} role="status">
              Borrador guardado
            </p>
          ) : workReportDraftDirty || extraItemsDirty ? (
            <p className={styles.activityWorkReportSaveStateDirty} role="status">
              Cambios sin guardar
            </p>
          ) : null}

          <div className={styles.activityWorkReportActions}>

          {showDraftButton ? (

            <button

              type="button"

              className={cx(
                ui.btnSecondary,
                styles.activityWorkReportActionBtn,
                showDraftSavedState && styles.activityWorkReportDraftSaved,
              )}

              disabled={disabled || saving || (!canSaveWorkReportDraft && !showDraftSavedState)}

              onClick={() => void handleSaveDraft()}

            >

              <ClipboardList size={16} aria-hidden />

              {draftButtonLabel}

            </button>

          ) : null}

          {showSubmitButton ? (

            <button

              type="button"

              className={cx(ui.btnPrimaryBlock, styles.activityWorkReportActionBtn)}

              disabled={disabled || saving || !canSendWorkReport}

              onClick={() => void handleSubmitReport()}

            >

              <ClipboardList size={16} aria-hidden />

              {submitButtonLabel}

            </button>

          ) : null}

        </div>

        </div>

      ) : null}

    </div>

    <ConfirmDialog
      open={reopenConfirmOpen}
      title="Rehacer informe"
      message="Se eliminara el albaran vinculado y el informe volvera a borrador para que puedas editarlo de nuevo aqui."
      confirmLabel="Eliminar albaran"
      loading={saving}
      onConfirm={() => void handleDeleteDeliveryNoteToReopen()}
      onCancel={() => {
        if (!saving) setReopenConfirmOpen(false);
      }}
    />

    </>

  );

}

