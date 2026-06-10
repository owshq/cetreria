import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { format, isSameDay, isSameMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import type {
  Activity,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
  UserScheduleEntry,
} from '@shared/types';
import {
  HOLIDAY_SHIFT_CODE,
  SCHEDULE_LEGEND_CODES,
  SHIFT_META,
  canAssignVacationShift,
  countVacationDaysInYear,
  cycleShiftCode,
  listUserActivityEntriesOnDate,
  normalizeMaxVacationDays,
  resolveUserDayShiftDisplay,
  USER_DAY_SHIFT_LOCKED_MESSAGE,
  type ScheduleLegendCode,
  type ShiftCode,
  type UserDayActivityEntry,
} from '@shared/types';
import {
  activitiesService,
  clientsService,
  documentsService,
  eventsService,
  scheduleHolidaysService,
  userSchedulesService,
  usersService,
} from '@/api';
import { authService } from '@/api/auth';
import { useActivityTypes } from '@/context/ActivityTypesContext';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { buildDocumentsByActivity } from '@/lib/documentsByActivity';
import { useActivityPreviewHover } from '@/hooks/useActivityPreviewHover';
import {
  formatSchedulePeriodLabel,
  getScheduleDaysInView,
  getSchedulePeriodRange,
  toScheduleDateKey,
} from '@/lib/schedulePeriod';
import { cx } from '@/lib/cx';
import { useShiftColorPalette } from '@/hooks/useShiftColorPalette';
import { getShiftPaletteColor } from '@/lib/shiftColorPalette';
import calendarStyles from '@/pages/Calendar.module.css';
import ui from '@/styles/shared.module.css';
import ScheduleDayActivitiesPopover, {
  type ScheduleDayPreviewContext,
} from '@/components/ScheduleDayActivitiesPopover';
import UserScheduleSummary from '@/components/UserScheduleSummary';
import styles from './UserScheduleEditor.module.css';

type ScheduleHolidayModeToolbarButtonProps = {
  active: boolean;
  onToggle: () => void;
  className?: string;
  mobileFooter?: boolean;
};

type ScheduleShiftLegendProps = {
  className?: string;
  compact?: boolean;
};

const COMPACT_LEGEND_HIDDEN_CODES = new Set<ScheduleLegendCode>(['V', HOLIDAY_SHIFT_CODE]);

type ShiftStateBadgeProps = {
  shift: ShiftCode;
  compact?: boolean;
  className?: string;
  title?: string;
  /** Solo la inicial, sin contenedor (turno sin actividad asociada). */
  plain?: boolean;
};

export function ShiftStateBadge({ shift, compact, className, title, plain }: ShiftStateBadgeProps) {
  const meta = SHIFT_META[shift];
  const shiftColors = useShiftColorPalette();
  const color = getShiftPaletteColor(shift, shiftColors);

  return (
    <span
      className={cx(
        plain ? styles.shiftStatePlain : styles.monthDayBadge,
        !plain && compact && styles.shiftStateBadgeCompact,
        className,
      )}
      style={plain ? { color } : { backgroundColor: color }}
      title={title ?? meta.label}
      aria-label={meta.label}
    >
      {meta.shortLabel}
    </span>
  );
}

export function ScheduleShiftLegend({ className, compact }: ScheduleShiftLegendProps) {
  const legendCodes = compact
    ? SCHEDULE_LEGEND_CODES.filter((code) => !COMPACT_LEGEND_HIDDEN_CODES.has(code))
    : SCHEDULE_LEGEND_CODES;

  return (
    <div
      className={cx(styles.legend, compact && styles.legendCompact, className)}
      role="list"
      aria-label="Leyenda de turnos"
    >
      {legendCodes.map((code) => {
        const meta = SHIFT_META[code];
        return (
          <span
            key={code}
            className={styles.legendItem}
            role="listitem"
            title={compact ? meta.label : meta.tooltip}
            aria-label={meta.label}
          >
            <ShiftStateBadge shift={code} compact={compact} />
            {!compact && <span className={styles.legendLabel}>{meta.label}</span>}
          </span>
        );
      })}
    </div>
  );
}

type ScheduleAvailabilityModeToolbarButtonProps = {
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  mobileFooter?: boolean;
  sidebar?: boolean;
};

export function ScheduleAvailabilityModeToolbarButton({
  active,
  onToggle,
  disabled = false,
  className,
  mobileFooter = false,
  sidebar = false,
}: ScheduleAvailabilityModeToolbarButtonProps) {
  const label = active ? 'Marcando disponibilidad…' : 'Disponibilidad';

  return (
    <button
      type="button"
      className={cx(
        sidebar
          ? styles.holidaySidebarBtn
          : mobileFooter
            ? styles.holidayMobileFooterBtn
            : ui.toolbarBtnPrimary,
        styles.holidayToolbarBtn,
        active && styles.holidayToolbarBtnActive,
        className,
      )}
      aria-pressed={active}
      disabled={disabled}
      aria-label={
        disabled
          ? 'Selecciona un operario para registrar disponibilidad'
          : active
            ? 'Desactivar registro de disponibilidad'
            : 'Registrar disponibilidad en el calendario'
      }
      title={
        disabled
          ? 'Selecciona un operario en la lista para registrar su disponibilidad.'
          : active
            ? 'Pulsa un día del calendario para asignar o cambiar turno.'
            : 'Activa para registrar turnos pulsando los días del calendario.'
      }
      onClick={onToggle}
    >
      {mobileFooter || sidebar ? label : <span className={ui.toolbarBtnLabel}>{label}</span>}
    </button>
  );
}

export function ScheduleHolidayModeToolbarButton({
  active,
  onToggle,
  className,
  mobileFooter = false,
}: ScheduleHolidayModeToolbarButtonProps) {
  const label = active ? 'Marcando festivos…' : 'Marcar festivos';

  return (
    <button
      type="button"
      className={cx(
        mobileFooter ? styles.holidayMobileFooterBtn : ui.toolbarBtnPrimary,
        styles.holidayToolbarBtn,
        active && styles.holidayToolbarBtnActive,
        className,
      )}
      aria-pressed={active}
      aria-label={active ? 'Desactivar marcado de festivos' : 'Marcar festivos de empresa'}
      title={
        active
          ? 'Pulsa un día para añadir o quitar festivo (visible para todos).'
          : 'Activa para editar días festivos de empresa.'
      }
      onClick={onToggle}
    >
      {mobileFooter ? label : <span className={ui.toolbarBtnLabel}>{label}</span>}
    </button>
  );
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

type UserScheduleEditorProps = {
  userId: string;
  userName?: string;
  embedded?: boolean;
  /** Calendario y resumen en secciones hermanas (p. ej. ajustes de horario). */
  splitSections?: boolean;
  currentDate: Date;
  toolbarControlled?: boolean;
  onPeriodChange?: (date: Date) => void;
  holidayMode?: boolean;
  onHolidayModeChange?: (value: boolean) => void;
  /** Límite anual de vacaciones del usuario editado (desde assignee o perfil). */
  maxVacationDays?: number;
  isAdmin?: boolean;
  activities?: Activity[];
  events?: CalendarEvent[];
};

type UserScheduleEditorContextValue = {
  userId: string;
  userName?: string;
  embedded: boolean;
  splitSections: boolean;
  toolbarControlled: boolean;
  currentDate: Date;
  isAdmin: boolean;
  maxVacationDays: number;
  holidayMode: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  savedFlash: boolean;
  entriesByDate: Map<string, ShiftCode>;
  holidayDates: Set<string>;
  daysInView: Date[];
  dayActivitiesByDate: Map<string, UserDayActivityEntry[]>;
  resolvedActivities: Activity[];
  resolvedEvents: CalendarEvent[];
  activityPreview: ScheduleDayPreviewContext | null;
  vacationYear: number;
  vacationUsedInYear: number;
  assignableHint: string;
  handleCycleShift: (date: string) => void;
  toggleHoliday: (date: string) => void;
  setHolidayMode: (value: boolean | ((current: boolean) => boolean)) => void;
};

const UserScheduleEditorContext = createContext<UserScheduleEditorContextValue | null>(null);

function useUserScheduleEditorContext(): UserScheduleEditorContextValue {
  const value = useContext(UserScheduleEditorContext);
  if (!value) {
    throw new Error('UserScheduleEditor debe usarse dentro de UserScheduleEditorRoot.');
  }
  return value;
}

function useUserScheduleEditorState({
  userId,
  userName,
  embedded = false,
  splitSections = false,
  currentDate,
  toolbarControlled = false,
  holidayMode: holidayModeProp,
  onHolidayModeChange,
  maxVacationDays: maxVacationDaysProp,
  isAdmin: isAdminProp,
  activities: activitiesProp,
  events: eventsProp,
}: UserScheduleEditorProps): UserScheduleEditorContextValue {
  const currentUser = authService.getCurrentUser();
  const isAdmin = isAdminProp ?? currentUser?.role === 'admin';
  const { boundaries } = useWorkspaceScheduleSettings();
  const { activityTypes } = useActivityTypes();
  const [clients, setClients] = useState<Client[]>([]);
  const [assignees, setAssignees] = useState<UserAssignee[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const maxVacationDays = normalizeMaxVacationDays(
    maxVacationDaysProp ??
      (userId === currentUser?.id ? currentUser?.maxVacationDays : undefined),
  );

  const [entriesByDate, setEntriesByDate] = useState<Map<string, ShiftCode>>(new Map());
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [internalHolidayMode, setInternalHolidayMode] = useState(false);
  const holidayMode = holidayModeProp ?? internalHolidayMode;
  const setHolidayMode = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      const next = typeof value === 'function' ? value(holidayMode) : value;
      if (onHolidayModeChange) onHolidayModeChange(next);
      else setInternalHolidayMode(next);
    },
    [holidayMode, onHolidayModeChange],
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadedActivities, setLoadedActivities] = useState<Activity[]>([]);
  const [loadedEvents, setLoadedEvents] = useState<CalendarEvent[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedActivities = activitiesProp ?? loadedActivities;
  const resolvedEvents = eventsProp ?? loadedEvents;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      clientsService.getAll().catch(() => [] as Client[]),
      usersService.getAssignees().catch(() => [] as UserAssignee[]),
      documentsService.getBootstrap().then((data) => data.documents).catch(() => [] as Document[]),
    ]).then(([nextClients, nextAssignees, nextDocuments]) => {
      if (cancelled) return;
      setClients(nextClients);
      setAssignees(nextAssignees);
      setDocuments(nextDocuments);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activityPreview = useMemo<ScheduleDayPreviewContext | null>(() => {
    if (activityTypes.length === 0) return null;
    return {
      events: resolvedEvents,
      clientsMap: new Map(clients.map((client) => [client.id, client])),
      activityTypes,
      documentsByActivity: buildDocumentsByActivity(documents),
      assigneesById: new Map(assignees.map((user) => [user.id, user])),
      boundaries,
    };
  }, [activityTypes, assignees, boundaries, clients, documents, resolvedEvents]);

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => getSchedulePeriodRange(currentDate),
    [currentDate],
  );

  const daysInView = useMemo(() => getScheduleDaysInView(currentDate), [currentDate]);

  const vacationYear = currentDate.getFullYear();
  const vacationUsedInYear = useMemo(
    () => countVacationDaysInYear(entriesByDate, vacationYear),
    [entriesByDate, vacationYear],
  );

  const dayActivitiesByDate = useMemo(() => {
    const map = new Map<string, UserDayActivityEntry[]>();
    for (const day of daysInView) {
      const dateKey = toScheduleDateKey(day);
      const entries = listUserActivityEntriesOnDate(
        resolvedActivities,
        resolvedEvents,
        userId,
        dateKey,
        boundaries,
      );
      if (entries.length > 0) {
        map.set(dateKey, entries);
      }
    }
    return map;
  }, [daysInView, resolvedActivities, resolvedEvents, userId, boundaries]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const activityEventsPromise = Promise.all([
        activitiesProp
          ? Promise.resolve([] as Activity[])
          : activitiesService.getAll({ from: rangeFrom, to: rangeTo }),
        eventsProp ? Promise.resolve([] as CalendarEvent[]) : eventsService.getAll(),
      ]);
      const [entries, holidays, [activitiesResult, eventsResult]] = await Promise.all([
        userSchedulesService.getRange(rangeFrom, rangeTo, userId),
        scheduleHolidaysService.getRange(rangeFrom, rangeTo),
        activityEventsPromise,
      ]);
      const map = new Map<string, ShiftCode>();
      for (const entry of entries) {
        map.set(entry.date, entry.shift);
      }
      setEntriesByDate(map);
      setHolidayDates(new Set(holidays.map((h) => h.date)));
      if (!activitiesProp) setLoadedActivities(activitiesResult);
      if (!eventsProp) setLoadedEvents(eventsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el horario.');
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo, userId, activitiesProp, eventsProp]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!isAdmin) setHolidayMode(false);
  }, [isAdmin, setHolidayMode]);

  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  const persistShift = useCallback(
    async (date: string, shift: ShiftCode | null) => {
      if (shift === 'V') {
        const check = canAssignVacationShift(
          entriesByDate,
          date,
          maxVacationDays,
          entriesByDate.get(date) ?? null,
        );
        if (!check.ok) {
          setError(check.message);
          return;
        }
      }

      setSaving(true);
      setError(null);
      setSavedFlash(false);
      try {
        await userSchedulesService.saveBulk([{ userId, date, shift }]);
        setEntriesByDate((current) => {
          const next = new Map(current);
          if (shift) next.set(date, shift);
          else next.delete(date);
          return next;
        });
        flashSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar.');
        void loadEntries();
      } finally {
        setSaving(false);
      }
    },
    [userId, loadEntries, entriesByDate, maxVacationDays, flashSaved],
  );

  const handleCycleShift = useCallback(
    (date: string) => {
      const current = entriesByDate.get(date) ?? null;
      const display = resolveUserDayShiftDisplay(
        resolvedActivities,
        resolvedEvents,
        userId,
        date,
        current,
        boundaries,
      );
      if (display.lockedByActivities) {
        setError(USER_DAY_SHIFT_LOCKED_MESSAGE);
        return;
      }
      const next = cycleShiftCode(current, { maxVacationDays });
      void persistShift(date, next);
    },
    [
      entriesByDate,
      maxVacationDays,
      persistShift,
      resolvedActivities,
      resolvedEvents,
      userId,
      boundaries,
    ],
  );

  const toggleHoliday = useCallback(
    async (date: string) => {
      if (!isAdmin) return;
      const active = !holidayDates.has(date);
      setSaving(true);
      setError(null);
      setSavedFlash(false);
      try {
        await scheduleHolidaysService.saveBulk([{ date, active }]);
        setHolidayDates((current) => {
          const next = new Set(current);
          if (active) next.add(date);
          else next.delete(date);
          return next;
        });
        flashSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el festivo.');
        void loadEntries();
      } finally {
        setSaving(false);
      }
    },
    [isAdmin, holidayDates, loadEntries, flashSaved],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const assignableHint =
    maxVacationDays > 0
      ? `Mañana → Tarde → Noche → Libre → Vacaciones → sin turno`
      : `Mañana → Tarde → Noche → Libre → sin turno`;

  return {
    userId,
    userName,
    embedded,
    splitSections,
    toolbarControlled,
    currentDate,
    isAdmin,
    maxVacationDays,
    holidayMode,
    loading,
    saving,
    error,
    savedFlash,
    entriesByDate,
    holidayDates,
    daysInView,
    dayActivitiesByDate,
    resolvedActivities,
    resolvedEvents,
    activityPreview,
    vacationYear,
    vacationUsedInYear,
    assignableHint,
    handleCycleShift,
    toggleHoliday,
    setHolidayMode,
  };
}

export function UserScheduleEditorRoot({
  children,
  ...props
}: UserScheduleEditorProps & { children: ReactNode }) {
  const value = useUserScheduleEditorState(props);
  return (
    <UserScheduleEditorContext.Provider value={value}>{children}</UserScheduleEditorContext.Provider>
  );
}

export function UserScheduleEditorCalendar() {
  const {
    loading,
    daysInView,
    entriesByDate,
    holidayDates,
    dayActivitiesByDate,
    saving,
    holidayMode,
    isAdmin,
    handleCycleShift,
    toggleHoliday,
    currentDate,
    embedded,
    splitSections,
  } = useUserScheduleEditorContext();

  return (
    <div
      className={cx(
        styles.calendarPart,
        !splitSections && styles.calendarSticky,
        embedded && !splitSections && styles.calendarStickyEmbedded,
      )}
    >
      {loading ? (
        <p className={styles.bodyLoading}>Cargando horario…</p>
      ) : (
        <div className={calendarStyles.calendarSection}>
          <div className={calendarStyles.calendarMainShell}>
            <div className={cx(calendarStyles.monthCalendar, styles.scheduleMonthCalendar)}>
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className={calendarStyles.weekday}>
                {label}
              </div>
            ))}
            {daysInView.map((day, index) => {
              const dateKey = toScheduleDateKey(day);
              return (
                <ScheduleMonthDayCell
                  key={day.toISOString()}
                  day={day}
                  activeShift={entriesByDate.get(dateKey) ?? null}
                  isHoliday={holidayDates.has(dateKey)}
                  dayEntries={dayActivitiesByDate.get(dateKey) ?? []}
                  saving={saving}
                  holidayMode={holidayMode}
                  canEditHoliday={isAdmin}
                  onCycleShift={handleCycleShift}
                  onToggleHoliday={toggleHoliday}
                  referenceMonth={currentDate}
                  columnIndex={index}
                />
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserScheduleEditorDetails() {
  const {
    userName,
    embedded,
    splitSections,
    toolbarControlled,
    loading,
    saving,
    error,
    savedFlash,
    currentDate,
    entriesByDate,
    maxVacationDays,
    userId,
    resolvedActivities,
    resolvedEvents,
    vacationYear,
    vacationUsedInYear,
    assignableHint,
    isAdmin,
  } = useUserScheduleEditorContext();

  return (
    <>
      <div
        className={cx(
          styles.detailsPart,
          embedded && !splitSections && styles.scrollBodyEmbedded,
          embedded && splitSections && styles.detailsPartSplit,
        )}
      >
        <div className={styles.statusBar} aria-live="polite">
          {saving && <span className={styles.statusSaving}>Guardando…</span>}
          {!saving && savedFlash && <span className={styles.statusOk}>Guardado</span>}
          {error && <span className={styles.statusError}>{error}</span>}
        </div>

        {!splitSections && (
          <p className={styles.helpHint}>
            Pulsa un día para asignar turno ({assignableHint}). Las horas del resumen salen de las
            actividades asignadas.
          </p>
        )}

        {!splitSections && !loading && (
          <UserScheduleSummary
            userName={userName}
            currentDate={currentDate}
            entriesByDate={entriesByDate}
            maxVacationDays={maxVacationDays}
            userId={userId}
            activities={resolvedActivities}
            events={resolvedEvents}
            className={styles.summaryBottom}
          />
        )}
      </div>

      {(maxVacationDays > 0 || (maxVacationDays === 0 && !isAdmin) || !toolbarControlled) && (
        <footer className={styles.legendFooterFrame}>
          <div className={styles.legendFooterInner}>
            {maxVacationDays > 0 && (
              <p className={styles.vacationQuota} role="status">
                Vacaciones {vacationYear}: <strong>{vacationUsedInYear}</strong> / {maxVacationDays}
              </p>
            )}
            {maxVacationDays === 0 && !isAdmin && (
              <p className={styles.vacationQuotaMuted} role="status">
                Sin cupo de vacaciones asignado
              </p>
            )}
            {!toolbarControlled && <ScheduleShiftLegend />}
          </div>
        </footer>
      )}
    </>
  );
}

type MonthDayCellProps = {
  day: Date;
  activeShift: ShiftCode | null;
  isHoliday: boolean;
  dayEntries: UserDayActivityEntry[];
  saving: boolean;
  holidayMode: boolean;
  canEditHoliday: boolean;
  referenceMonth: Date;
  columnIndex: number;
  onCycleShift: (date: string) => void;
  onToggleHoliday: (date: string) => void;
};

type ScheduleDayShiftBadgeWithPreviewProps = {
  shift: ShiftCode;
  locked: boolean;
  entries: UserDayActivityEntry[];
  day: Date;
  preview: ScheduleDayPreviewContext | null;
};

function ScheduleDayShiftBadgeWithPreview({
  shift,
  locked,
  entries,
  day,
  preview,
}: ScheduleDayShiftBadgeWithPreviewProps) {
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const shiftEntries = useMemo(
    () => entries.filter((entry) => entry.shift === shift),
    [entries, shift],
  );
  const hasPreview = locked && shiftEntries.length > 0 && preview != null;
  const {
    previewOpen,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
  } = useActivityPreviewHover();

  useLayoutEffect(() => {
    setAnchorEl(badgeRef.current);
  }, [previewOpen, shiftEntries.length]);

  return (
    <>
      <span
        ref={badgeRef}
        className={styles.shiftBadgeAnchor}
        onMouseEnter={(event) => {
          if (!hasPreview) return;
          event.stopPropagation();
          handleMouseEnter();
        }}
        onMouseLeave={(event) => {
          if (!hasPreview) return;
          event.stopPropagation();
          handleMouseLeave();
        }}
        onFocus={(event) => {
          if (!hasPreview) return;
          event.stopPropagation();
          handleFocus();
        }}
        onBlur={(event) => {
          if (!hasPreview) return;
          event.stopPropagation();
          handleBlur();
        }}
      >
        <ShiftStateBadge
          shift={shift}
          title={SHIFT_META[shift].tooltip}
          plain={!locked}
        />
      </span>
      {hasPreview ? (
        <ScheduleDayActivitiesPopover
          anchorEl={anchorEl}
          open={previewOpen}
          day={day}
          entries={shiftEntries}
          preview={preview}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
      ) : null}
    </>
  );
}

function buildDayTooltip(
  meta: (typeof SHIFT_META)[ShiftCode] | null,
  dayEntries: UserDayActivityEntry[],
): string | undefined {
  const parts: string[] = [];
  if (meta) parts.push(meta.tooltip);
  for (const entry of dayEntries) {
    const shiftLabel = SHIFT_META[entry.shift].label;
    const description = entry.activity.description.trim() || 'Actividad';
    parts.push(`${description} · ${shiftLabel} · ${entry.startTime}–${entry.endTime} · ${entry.hours} h`);
  }
  if (dayEntries.length > 0 && !meta) parts.push('Sin turno planificado');
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function ScheduleMonthDayCell({
  day,
  activeShift,
  isHoliday,
  dayEntries,
  saving,
  holidayMode,
  canEditHoliday,
  onCycleShift,
  onToggleHoliday,
  referenceMonth,
  columnIndex,
}: MonthDayCellProps) {
  const { resolvedActivities, resolvedEvents, userId, activityPreview } =
    useUserScheduleEditorContext();
  const { boundaries } = useWorkspaceScheduleSettings();
  const shiftColors = useShiftColorPalette();
  const dayRef = useRef<HTMLButtonElement>(null);
  const [dayAnchorEl, setDayAnchorEl] = useState<HTMLButtonElement | null>(null);
  const {
    previewOpen: activitiesPreviewOpen,
    canHover,
    handleMouseEnter: scheduleActivitiesShow,
    handleMouseLeave: scheduleActivitiesHide,
    handleFocus: scheduleActivitiesFocus,
    handleBlur: scheduleActivitiesBlur,
  } = useActivityPreviewHover();
  const dateKey = toScheduleDateKey(day);
  const shiftDisplay = resolveUserDayShiftDisplay(
    resolvedActivities,
    resolvedEvents,
    userId,
    dateKey,
    activeShift,
    boundaries,
  );
  const meta = activeShift ? SHIFT_META[activeShift] : null;
  const holidayMeta = SHIFT_META[HOLIDAY_SHIFT_CODE];
  const isToday = isSameDay(day, new Date());
  const isOtherMonth = !isSameMonth(day, referenceMonth);
  const activityEntries = shiftDisplay.activityEntries;
  const dayTooltip = buildDayTooltip(meta, activityEntries);
  const lockedByActivities = shiftDisplay.lockedByActivities;
  const hasActivities = activityEntries.length > 0;
  const totalActivityHours = shiftDisplay.displayHours;
  const showDayActivitiesPreview = canHover && hasActivities && activityPreview != null;

  useLayoutEffect(() => {
    setDayAnchorEl(dayRef.current);
  }, [activitiesPreviewOpen, hasActivities]);

  const handleClick = () => {
    if (holidayMode && canEditHoliday) {
      onToggleHoliday(dateKey);
      return;
    }
    onCycleShift(dateKey);
  };

  return (
    <>
      <button
        ref={dayRef}
        type="button"
        className={cx(
          calendarStyles.dayCell,
          calendarStyles.dayCellInteractive,
          styles.scheduleDayCell,
          isOtherMonth && calendarStyles.dayCellOtherMonth,
          isHoliday && styles.scheduleDayHoliday,
          hasActivities && styles.monthDayHasActivities,
          lockedByActivities && styles.scheduleDayShiftLocked,
          columnIndex % 7 === 6 && calendarStyles.dayCellLastCol,
        )}
        onClick={handleClick}
        onMouseEnter={showDayActivitiesPreview ? scheduleActivitiesShow : undefined}
        onMouseLeave={showDayActivitiesPreview ? scheduleActivitiesHide : undefined}
        onFocus={showDayActivitiesPreview ? scheduleActivitiesFocus : undefined}
        onBlur={showDayActivitiesPreview ? scheduleActivitiesBlur : undefined}
        disabled={saving || (holidayMode && !canEditHoliday)}
        title={dayTooltip}
        aria-label={`${format(day, 'd MMMM yyyy', { locale: es })}${
          isHoliday ? ', festivo' : ''
        }${meta ? `, turno ${meta.label}` : hasActivities ? ', sin turno planificado' : ', sin turno'}${
          hasActivities
            ? `, ${activityEntries.length} tramo${activityEntries.length === 1 ? '' : 's'}, ${totalActivityHours} horas`
            : ''
        }`}
      >
        <div
          className={cx(
            calendarStyles.dayLabel,
            isToday && calendarStyles.dayLabelToday,
            isOtherMonth && calendarStyles.dayLabelMuted,
          )}
        >
          <span className={cx(calendarStyles.dayNumber, isToday && calendarStyles.todayNumber)}>
            {format(day, 'd')}
          </span>
        </div>
        <div className={cx(calendarStyles.events, styles.scheduleDayBadges)}>
          {isHoliday && (
            <span
              className={styles.monthDayBadge}
              style={{ backgroundColor: getShiftPaletteColor(HOLIDAY_SHIFT_CODE, shiftColors) }}
              title={holidayMeta.tooltip}
            >
              {holidayMeta.shortLabel}
            </span>
          )}
          {shiftDisplay.displayShifts.length > 0 ? (
            shiftDisplay.displayShifts.map((shift) => (
              <ScheduleDayShiftBadgeWithPreview
                key={shift}
                shift={shift}
                locked={lockedByActivities}
                entries={activityEntries}
                day={day}
                preview={activityPreview}
              />
            ))
          ) : !isHoliday ? (
            <span className={styles.monthDayEmpty} aria-hidden />
          ) : null}
        </div>
      </button>

      {showDayActivitiesPreview ? (
        <ScheduleDayActivitiesPopover
          anchorEl={dayAnchorEl}
          open={activitiesPreviewOpen}
          day={day}
          entries={activityEntries}
          preview={activityPreview}
          onMouseEnter={scheduleActivitiesShow}
          onMouseLeave={scheduleActivitiesHide}
        />
      ) : null}
    </>
  );
}

function UserScheduleEditorCombined() {
  const {
    userName,
    embedded,
    toolbarControlled,
    currentDate,
    isAdmin,
    holidayMode,
    setHolidayMode,
  } = useUserScheduleEditorContext();

  return (
    <div className={cx(styles.wrap, embedded && styles.wrapEmbedded)}>
      {!embedded && !toolbarControlled && (
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <p className={styles.subtitle}>
              {userName
                ? `Turnos de ${userName}`
                : 'Planifica turnos y vacaciones por día.'}
            </p>
            <p className={styles.periodHint}>{formatSchedulePeriodLabel(currentDate)}</p>
          </div>
        </div>
      )}

      {isAdmin && !toolbarControlled && (
        <div className={styles.adminTools}>
          <ScheduleHolidayModeToolbarButton
            active={holidayMode}
            onToggle={() => setHolidayMode((value) => !value)}
          />
        </div>
      )}

      <UserScheduleEditorCalendar />
      <UserScheduleEditorDetails />
    </div>
  );
}

export default function UserScheduleEditor(props: UserScheduleEditorProps) {
  return (
    <UserScheduleEditorRoot {...props}>
      <UserScheduleEditorCombined />
    </UserScheduleEditorRoot>
  );
}

export function scheduleEntriesToMap(entries: UserScheduleEntry[]): Map<string, ShiftCode> {
  return new Map(entries.map((entry) => [entry.date, entry.shift]));
}
