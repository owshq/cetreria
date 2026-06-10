import { useCallback, useEffect, useMemo, useState } from 'react';

import { format, parseISO } from 'date-fns';

import { es } from 'date-fns/locale';

import { CircleMinus, ClipboardList, Plus } from 'lucide-react';

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

  formatDocumentAmount,

  formatHoursMinutes,

  hoursMinutesToWorkedMinutes,

  getActivityWorkReport,

  getActivityWorkReportExtraItems,

  getActivityWorkReportSurfaceStatus,

  getDefaultWorkReportWorkedMinutes,

  getHalconeriaConceptLabels,

  getLineItemConceptText,

  getUserInitials,

  hasMultipleWorkReportAssignees,

  isWorkspaceAdmin,

  normalizeConceptKey,

  resolveInvoiceConceptDefaultPrice,

  workedMinutesToHours,

} from '@shared/types';

import { activitiesService } from '@/api/activities';

import { ApiError } from '@/api/client';

import InvoiceConceptCombobox from '@/components/InvoiceConceptCombobox';

import { Input, Textarea } from '@/components/forms';

import { useActivityModal } from '@/context/activityModalContext';

import { useInvoiceConceptSettings } from '@/context/InvoiceConceptSettingsContext';

import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';

import { useWorkspace } from '@/context/useWorkspace';

import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';

import { cx } from '@/lib/cx';

import ui from '@/styles/shared.module.css';

import styles from '@/pages/Calendar.module.css';

import lineStyles from '@/components/DocumentFormModal.module.css';



type WorkReportDraft = {

  notes: string;

};



type WorkedTimeDraft = {

  hours: string;

  minutes: string;

};



const EMPTY_WORKED_TIME: WorkedTimeDraft = { hours: '', minutes: '' };



type ExtraItemDraft = {

  name: string;

  description: string;

  quantity: number;

  price: number;

};



const EMPTY_DRAFT: WorkReportDraft = { notes: '' };



function parseBoundedInt(raw: string, max: number): number {

  const trimmed = raw.trim();

  if (!trimmed) return 0;

  const value = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(value) || value < 0) return 0;

  return Math.min(max, value);

}



function splitWorkedMinutes(minutes: number): WorkedTimeDraft {

  if (!Number.isFinite(minutes) || minutes <= 0) return EMPTY_WORKED_TIME;

  const hours = Math.floor(minutes / 60);

  const mins = minutes % 60;

  return { hours: String(hours), minutes: String(mins) };

}



function sanitizeWorkedHoursInput(raw: string): string {

  const trimmed = raw.trim();

  if (!trimmed) return '';

  return String(Math.min(24, Math.max(0, parseBoundedInt(trimmed, 24))));

}



function sanitizeWorkedMinutesInput(raw: string): string {

  const trimmed = raw.trim();

  if (!trimmed) return '';

  return String(Math.min(59, Math.max(0, parseBoundedInt(trimmed, 59))));

}



function workReportStatusLabel(

  status: ActivityWorkReportSurfaceStatus,

  workedMinutes?: number,

): string {

  if (status === 'submitted') {

    return formatHoursMinutes(workedMinutesToHours(workedMinutes ?? 0)) ?? 'Enviado';

  }

  if (status === 'draft') return 'Borrador';

  return 'Pendiente';

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

  users: UserAssignee[];

  currentUser: Pick<UserAssignee, 'id' | 'name' | 'role'> | null;

  activityTypes: ActivityType[];

  documents?: Document[];

  canManageExtraItems?: boolean;

  disabled?: boolean;

  onActivityUpdated?: (activity: Activity) => void;

  onDocumentsRefresh?: () => void | Promise<void>;

  onError?: (message: string | null) => void;

};



export default function ActivityWorkReportPanel({

  activity,

  event,

  users,

  currentUser,

  activityTypes,

  documents = [],

  canManageExtraItems = false,

  disabled = false,

  onActivityUpdated,

  onDocumentsRefresh,

  onError,

}: ActivityWorkReportPanelProps) {

  const { notifyActivitySaved } = useActivityModal();

  const { boundaries } = useWorkspaceScheduleSettings();

  const { settings: conceptSettings } = useInvoiceConceptSettings();

  const { invoiceConceptFreeCreationEnabled } = useWorkspaceFeatureSettings();

  const { currentWorkspace } = useWorkspace();

  const canEditLinePrice =
    currentUser?.role === 'admin' || isWorkspaceAdmin(currentWorkspace?.role);

  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<WorkReportDraft>(EMPTY_DRAFT);

  const [workedTimeDraft, setWorkedTimeDraft] = useState<WorkedTimeDraft>(EMPTY_WORKED_TIME);

  const [extraItemsDraft, setExtraItemsDraft] = useState<ExtraItemDraft[]>([]);



  const canSubmit = useMemo(

    () =>

      Boolean(

        currentUser &&

          canSubmitActivityWorkReport(currentUser, { activity, event }),

      ),

    [activity, currentUser, event],

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



  const showOwnForm = canSubmit && canEditOwn && currentUser;

  const showExtraItemsSection = canManageExtraItems;

  const showSavedExtraItems = !showExtraItemsSection && savedExtraItems.length > 0;

  const showUnifiedButton = showOwnForm || showExtraItemsSection;

  const canSaveConcepts = showExtraItemsSection && extraItemsDirty;

  const canSubmitReport = Boolean(showOwnForm && draftWorkedMinutes > 0);

  const unifiedButtonEnabled = canSaveConcepts || canSubmitReport;



  useEffect(() => {

    if (!ownReport || ownReport.status === 'submitted') {

      setDraft(EMPTY_DRAFT);

      return;

    }

    setDraft({

      notes: ownReport.notes ?? '',

    });

  }, [activity.id, ownReport?.updatedAt, ownReport?.status, ownReport?.notes]);



  useEffect(() => {

    if (ownReport?.workedMinutes && ownReport.workedMinutes > 0) {

      setWorkedTimeDraft(splitWorkedMinutes(ownReport.workedMinutes));

      return;

    }

    if (defaultWorkedMinutes > 0) {

      setWorkedTimeDraft(splitWorkedMinutes(defaultWorkedMinutes));

      return;

    }

    setWorkedTimeDraft(EMPTY_WORKED_TIME);

  }, [activity.id, defaultWorkedMinutes, ownReport?.updatedAt, ownReport?.workedMinutes]);



  useEffect(() => {

    const items = getActivityWorkReportExtraItems(activity);

    setExtraItemsDraft(

      items.length > 0

        ? items.map(mapExtraItemDraft)

        : [],

    );

  }, [activity.id, activity.workReportExtraItems]);



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



  const handleUnifiedSubmit = useCallback(async () => {

    if (disabled || saving) return;



    const shouldSaveConcepts = showExtraItemsSection && extraItemsDirty;

    const shouldSubmitReport = Boolean(showOwnForm && canEditOwn && currentUser);



    if (!shouldSaveConcepts && !shouldSubmitReport) return;



    if (shouldSaveConcepts && !validateExtraItemsDraft()) return;



    if (shouldSubmitReport && draftWorkedMinutes <= 0) {

      onError?.('Indica las horas reales trabajadas para registrar el informe.');

      return;

    }



    setSaving(true);

    onError?.(null);



    try {

      let latestActivity = activity;



      if (shouldSaveConcepts) {

        const items = serializeExtraItems(extraItemsDraft);

        latestActivity = await activitiesService.updateWorkReportExtraItems(latestActivity.id, items);

        onActivityUpdated?.(latestActivity);

      }



      if (shouldSubmitReport) {

        latestActivity = await activitiesService.submitWorkReport(latestActivity.id, {

          workedMinutes: draftWorkedMinutes,

          notes: draft.notes.trim() || undefined,

          status: 'submitted',

        });

        onActivityUpdated?.(latestActivity);

      }



      await onDocumentsRefresh?.();

      await notifyActivitySaved();

    } catch (error) {

      onError?.(

        error instanceof ApiError

          ? error.message

          : shouldSubmitReport

            ? 'No se pudo guardar el informe de trabajo. Inténtalo de nuevo.'

            : 'No se pudo enviar el informe de trabajo. Inténtalo de nuevo.',

      );

    } finally {

      setSaving(false);

    }

  }, [

    activity,

    draftWorkedMinutes,

    canEditOwn,

    currentUser,

    disabled,

    draft,

    extraItemsDirty,

    extraItemsDraft,

    notifyActivitySaved,

    onActivityUpdated,

    onDocumentsRefresh,

    onError,

    saving,

    showExtraItemsSection,

    showOwnForm,

    validateExtraItemsDraft,

  ]);



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



  const assigneeReports = users.map((user) => ({

    user,

    report: getActivityWorkReport(activity, user.id),

    status: getActivityWorkReportSurfaceStatus(activity, user.id),

    isOwn: user.id === currentUser?.id,

  }));



  const teamReports = useMemo(

    () => assigneeReports.filter((entry) => !entry.isOwn),

    [assigneeReports],

  );



  const ownReportEntry = useMemo(

    () => assigneeReports.find((entry) => entry.isOwn) ?? null,

    [assigneeReports],

  );



  const showSubmittedOwn = Boolean(

    ownReportEntry?.report?.status === 'submitted' &&

      currentUser &&

      !showOwnForm,

  );



  const submitButtonLabel = saving

    ? 'Enviando…'

    : showOwnForm && ownStatus === 'submitted'

      ? 'Actualizar Informe de Trabajo'

      : 'Enviar Informe de Trabajo';



  return (

    <div className={cx(styles.sectionCardBody, styles.activityWorkReportPanel)}>

      {!canSubmit ? (

        <p className={styles.activityWorkReportNotice}>

          El informe se habilita cuando la actividad haya finalizado.

        </p>

      ) : null}



      {showOwnForm && currentUser ? (

        <>

          <header className={styles.activityWorkReportFormHeader}>

            <span

              className={cx(ui.userAvatar, styles.activityWorkReportAvatar)}

              aria-hidden

            >

              {getUserInitials(currentUser.name)}

            </span>

            <div className={styles.activityWorkReportFormHeading}>

              <h3 className={styles.activityWorkReportFormTitle}>Tu informe</h3>

              <p className={styles.activityWorkReportFormSubtitle}>{currentUser.name}</p>

            </div>

            <span

              className={cx(

                styles.activityWorkReportStatus,

                ownStatus === 'submitted'

                  ? styles.activityWorkReportStatusSubmitted

                  : ownStatus === 'draft'

                    ? styles.activityWorkReportStatusDraft

                    : styles.activityWorkReportStatusPending,

              )}

            >

              {workReportStatusLabel(ownStatus, ownReport?.workedMinutes)}

            </span>

          </header>



          <div className={styles.activityWorkReportHoursCard}>

            <p className={styles.activityWorkReportFieldLabel}>Horas trabajadas</p>

            <div className={styles.activityWorkReportHoursRow}>

              <div className={styles.activityWorkReportHoursUnit}>

                <label

                  className={styles.activityWorkReportHoursUnitLabel}

                  htmlFor={`activity-work-report-hours-${currentUser.id}`}

                >

                  Horas

                </label>

                <Input

                  id={`activity-work-report-hours-${currentUser.id}`}

                  type="number"

                  min={0}

                  max={24}

                  step={1}

                  inputMode="numeric"

                  className={styles.activityWorkReportHoursInput}

                  value={workedTimeDraft.hours}

                  disabled={disabled || saving}

                  onChange={(event) =>

                    setWorkedTimeDraft((prev) => ({

                      ...prev,

                      hours: sanitizeWorkedHoursInput(event.target.value),

                    }))

                  }

                />

              </div>

              <span className={styles.activityWorkReportHoursSep} aria-hidden>

                :

              </span>

              <div className={styles.activityWorkReportHoursUnit}>

                <label

                  className={styles.activityWorkReportHoursUnitLabel}

                  htmlFor={`activity-work-report-minutes-${currentUser.id}`}

                >

                  Min

                </label>

                <Input

                  id={`activity-work-report-minutes-${currentUser.id}`}

                  type="number"

                  min={0}

                  max={59}

                  step={1}

                  inputMode="numeric"

                  className={styles.activityWorkReportHoursInput}

                  value={workedTimeDraft.minutes}

                  disabled={disabled || saving}

                  onChange={(event) =>

                    setWorkedTimeDraft((prev) => ({

                      ...prev,

                      minutes: sanitizeWorkedMinutesInput(event.target.value),

                    }))

                  }

                />

              </div>

            </div>

            {defaultWorkedMinutes > 0 ? (

              <p className={styles.activityWorkReportHint}>

                {multipleAssignees ? 'Horas dedicadas' : 'Horas de la actividad'}:{' '}

                {formatHoursMinutes(workedMinutesToHours(defaultWorkedMinutes)) ?? '0m'}

              </p>

            ) : null}

          </div>



          <div className={ui.field}>

            <label className={ui.label} htmlFor={`activity-work-report-notes-${currentUser.id}`}>

              Notas <span className={styles.activityWorkReportOptional}>(opcional)</span>

            </label>

            <Textarea

              id={`activity-work-report-notes-${currentUser.id}`}

              rows={3}

              value={draft.notes}

              disabled={disabled || saving}

              onChange={(event) =>

                setDraft((prev) => ({ ...prev, notes: event.target.value }))

              }

              placeholder="Ej. zona, material o incidencias"

            />

          </div>

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

          {ownReportEntry.report.notes ? (

            <p className={styles.activityWorkReportSentMeta}>

              <span className={ui.fontMedium}>Notas: </span>

              {ownReportEntry.report.notes}

            </p>

          ) : null}

          {!canEditOwn ? (

            <p className={styles.activityWorkReportHint}>Ya no se puede modificar.</p>

          ) : null}

        </div>

      ) : null}



      {showExtraItemsSection ? (

        <div className={styles.activityWorkReportExtraItems}>

          <div className={styles.activityWorkReportExtraItemsHeader}>

            <div>

              <h3 className={styles.activityWorkReportExtraItemsTitle}>Conceptos adicionales</h3>

              <p className={styles.activityWorkReportExtraItemsDesc}>

                Se incluyen en el albarán junto con las horas del equipo.

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

                <span>Descripción</span>

                <span className={lineStyles.linesHeadQty}>Cant.</span>

                <span className={lineStyles.linesHeadPrice}>Precio</span>

                <span className={lineStyles.linesHeadSub}>Importe</span>

                <span />

              </div>

              {extraItemsDraft.map((item, index) => (

                <div key={index} className={lineStyles.lineRow}>

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

                  <span className={lineStyles.lineSubtotal}>

                    {formatDocumentAmount(extraItemAmount(item))}

                  </span>

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



      {showUnifiedButton ? (

        <button

          type="button"

          className={cx(ui.btnPrimaryBlock, styles.activityWorkReportExtraItemsSave)}

          disabled={disabled || saving || !unifiedButtonEnabled}

          onClick={() => void handleUnifiedSubmit()}

        >

          <ClipboardList size={16} aria-hidden />

          {submitButtonLabel}

        </button>

      ) : null}



      {teamReports.length > 0 ? (

        <section

          className={cx(styles.activityWorkReportTeam, styles.activityWorkReportTeamBelowAction)}

          aria-label="Informes del equipo"

        >

          <h3 className={styles.activityWorkReportTeamTitle}>Equipo</h3>

          <ul className={styles.activityWorkReportTeamList}>

            {teamReports.map(({ user, report, status }) => (

              <li key={user.id} className={styles.activityWorkReportTeamItem}>

                <span

                  className={cx(ui.userAvatar, styles.activityWorkReportTeamAvatar)}

                  aria-hidden

                >

                  {getUserInitials(user.name)}

                </span>

                <div className={styles.activityWorkReportTeamMeta}>

                  <span className={styles.activityWorkReportTeamName}>{user.name}</span>

                  {report?.notes ? (

                    <p className={styles.activityWorkReportTeamNotes}>{report.notes}</p>

                  ) : null}

                </div>

                <span

                  className={cx(

                    styles.activityWorkReportStatus,

                    status === 'submitted'

                      ? styles.activityWorkReportStatusSubmitted

                      : status === 'draft'

                        ? styles.activityWorkReportStatusDraft

                        : styles.activityWorkReportStatusPending,

                  )}

                >

                  {workReportStatusLabel(status, report?.workedMinutes)}

                </span>

              </li>

            ))}

          </ul>

        </section>

      ) : null}

    </div>

  );

}

