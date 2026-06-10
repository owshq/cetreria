import { useCallback, useMemo, useState } from 'react';
import { addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { authService } from '@/api/auth';
import {
  ScheduleHolidayModeToolbarButton,
  ScheduleShiftLegend,
  UserScheduleEditorCalendar,
  UserScheduleEditorDetails,
  UserScheduleEditorRoot,
} from '@/components/UserScheduleEditor';
import WorkspaceShiftSettings from '@/pages/WorkspaceShiftSettings';
import { formatSchedulePeriodLabel } from '@/lib/schedulePeriod';
import ui from '@/styles/shared.module.css';
import styles from './UserScheduleSettings.module.css';

export default function UserScheduleSettings() {
  const currentUser = authService.getCurrentUser();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [holidayMode, setHolidayMode] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const periodLabel = useMemo(
    () => formatSchedulePeriodLabel(currentDate),
    [currentDate],
  );

  const handlePeriodChange = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  if (!currentUser) return null;

  const editorProps = {
    userId: currentUser.id,
    userName: currentUser.name,
    embedded: true as const,
    splitSections: true as const,
    toolbarControlled: true as const,
    currentDate,
    onPeriodChange: handlePeriodChange,
    maxVacationDays: currentUser.maxVacationDays,
    isAdmin,
    holidayMode,
    onHolidayModeChange: setHolidayMode,
  };

  return (
    <UserScheduleEditorRoot {...editorProps}>
      <section className={ui.pageSection} aria-label="Calendario de turnos">
        <div className={styles.toolbar}>
          <div className={styles.periodNav}>
            <button
              type="button"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className={ui.btnIcon}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <h2 className={ui.pageSectionTitle}>{periodLabel}</h2>
            <button
              type="button"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className={ui.btnIcon}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className={styles.toolbarActions}>
            <ScheduleShiftLegend compact className={styles.toolbarLegend} />
            {isAdmin && (
              <ScheduleHolidayModeToolbarButton
                active={holidayMode}
                onToggle={() => setHolidayMode((value) => !value)}
              />
            )}
          </div>
        </div>
        <div className={styles.calendarSectionCard}>
          <UserScheduleEditorCalendar />
        </div>
        <div className={styles.scheduleMeta}>
          <UserScheduleEditorDetails />
        </div>
      </section>

      {isAdmin && <WorkspaceShiftSettings />}
    </UserScheduleEditorRoot>
  );
}
