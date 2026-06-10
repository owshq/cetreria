import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity, CalendarEvent, ShiftCode } from '@shared/types';
import {
  SCHEDULE_MONTHLY_HOURS_WARNING,
  SHIFT_META,
  computeSchedulePeriodSummary,
  listUserSignedHoursOnDate,
  formatUserDayShiftHoursCompact,
  formatUserDayShiftHoursTitle,
  resolveUserDayShiftDisplay,
} from '@shared/types';
import { documentsService } from '@/api';
import EmptyState from '@/components/EmptyState';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import { useWorkspaceScheduleSettings } from '@/context/WorkspaceScheduleSettingsContext';
import { useActivityModal } from '@/context/ActivityModalContext';
import { getScheduleSummaryDays, formatScheduleJornadasLabel } from '@/lib/schedulePeriod';
import { buildScheduleJornadaRows } from '@/lib/scheduleJornadaRows';
import { scrollRegionProps } from '@/lib/scrollRegion';
import { cx } from '@/lib/cx';
import styles from './UserScheduleSidebarList.module.css';

type UserScheduleSidebarListProps = {
  userId: string;
  userName?: string;
  currentDate: Date;
  entriesByDate: Map<string, ShiftCode>;
  activities: Activity[];
  events: CalendarEvent[];
  maxVacationDays?: number;
  loading?: boolean;
  onSelectDate?: (date: string) => void;
};

export default function UserScheduleSidebarList({
  userId,
  userName,
  currentDate,
  entriesByDate,
  activities,
  events,
  maxVacationDays = 0,
  loading = false,
  onSelectDate,
}: UserScheduleSidebarListProps) {
  const { openEditByActivity } = useActivityModal();
  const { boundaries, shiftEventTimes } = useWorkspaceScheduleSettings();
  const [documents, setDocuments] = useState<Awaited<ReturnType<typeof documentsService.getBootstrap>>['documents']>([]);

  useEffect(() => {
    let cancelled = false;
    documentsService
      .getBootstrap()
      .then((data) => {
        if (!cancelled) setDocuments(data.documents);
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signedHoursByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of getScheduleSummaryDays(currentDate)) {
      if (day.inScope === false) continue;
      const signed = listUserSignedHoursOnDate(
        activities,
        events,
        userId,
        day.date,
        boundaries,
      );
      if (signed > 0) map.set(day.date, signed);
    }
    return map;
  }, [activities, events, userId, currentDate, boundaries]);

  const summary = useMemo(() => {
    const periodDays = getScheduleSummaryDays(currentDate);
    return computeSchedulePeriodSummary(periodDays, entriesByDate, {
      hoursCap: SCHEDULE_MONTHLY_HOURS_WARNING,
      signedHoursByDate,
    });
  }, [currentDate, entriesByDate, signedHoursByDate]);

  const jornadaItems = useMemo(
    () =>
      buildScheduleJornadaRows(
        summary.assignedDays,
        activities,
        events,
        documents,
        userId,
        shiftEventTimes,
        boundaries,
      ),
    [summary.assignedDays, activities, events, documents, userId, shiftEventTimes, boundaries],
  );

  const title = formatScheduleJornadasLabel(userName);
  const dayCount = summary.assignedDays.length;
  const metaSeparator = ' · ';

  return (
    <section className={styles.wrap} aria-label={title}>
      <div className={styles.summary}>
        <p className={styles.summaryTitle}>{title}</p>
        <p className={styles.summaryMeta}>
          {dayCount === 0 ? (
            'Ningún día con turno este mes'
          ) : (
            <>
              {summary.coverageLabel}
              {metaSeparator}
              <strong>{summary.workingHours} h</strong> firmadas
              {maxVacationDays > 0 && summary.vacationDaysInScope > 0 && (
                <>
                  {metaSeparator}
                  {summary.vacationDaysInScope} vacaciones
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className={styles.list} {...scrollRegionProps} aria-busy={loading || undefined}>
        {loading ? (
          <div className={styles.empty}>
            <p className={styles.loadingText}>Cargando jornadas…</p>
          </div>
        ) : jornadaItems.length > 0 ? (
          jornadaItems.map((row) => {
            const parsedDate = parseISO(row.date);
            const dateLabel = format(parsedDate, 'd MMM', { locale: es });
            const weekdayLabel = format(parsedDate, 'EEE', { locale: es });
            const shiftDisplay = resolveUserDayShiftDisplay(
              activities,
              events,
              userId,
              row.date,
              entriesByDate.get(row.date),
              boundaries,
            );
            const hasActivity = shiftDisplay.lockedByActivities;

            const handleClick = () => {
              if (row.activity) {
                openEditByActivity(row.activity, events);
                return;
              }
              onSelectDate?.(row.date);
            };

            return (
              <div key={row.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemMain}
                  onClick={handleClick}
                  title={
                    row.activity?.description?.trim() ||
                    `${SHIFT_META[row.shift].label}${row.hourRange ? `${metaSeparator}${row.hourRange}` : ''}`
                  }
                >
                  <span className={styles.itemDateRow}>
                    <span className={styles.itemDate}>
                      {dateLabel}
                      {metaSeparator}
                      {weekdayLabel}
                    </span>
                    {shiftDisplay.showActivityHours ? (
                      <span
                        className={styles.itemHours}
                        title={formatUserDayShiftHoursTitle(shiftDisplay)}
                      >
                        {formatUserDayShiftHoursCompact(shiftDisplay)}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.itemShiftRow}>
                    <ShiftStateBadge shift={row.shift} plain={!hasActivity} compact />
                    <span className={styles.itemShiftLabel}>{SHIFT_META[row.shift].label}</span>
                    {row.hourRange ? (
                      <span className={styles.itemHourRange}>{row.hourRange}</span>
                    ) : null}
                  </span>
                  {row.activity?.description?.trim() ? (
                    <span className={styles.itemActivity}>{row.activity.description.trim()}</span>
                  ) : (
                    <span className={styles.itemActivityMuted}>Sin actividad asignada</span>
                  )}
                </button>
              </div>
            );
          })
        ) : (
          <div className={styles.empty}>
            <EmptyState
              emoji="📅"
              compact
              description="Pulsa un día del calendario para registrar disponibilidad."
            />
          </div>
        )}
      </div>

      {summary.isOverload ? (
        <p className={cx(styles.alert, styles.alertWarn)} role="status">
          Muchas horas este mes ({summary.workingHours} h).
        </p>
      ) : null}
    </section>
  );
}
