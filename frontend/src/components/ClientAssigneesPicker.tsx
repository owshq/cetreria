import { useMemo } from 'react';
import type { UserAssignee } from '@shared/types';
import UserAvatar from '@/components/UserAvatar';
import { cx } from '@/lib/cx';
import styles from './ClientAssigneesPicker.module.css';

type ClientAssigneesPickerProps = {
  assignees: UserAssignee[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  /** Operarios que ya ven el contacto por actividades o eventos (no asignacion explicita). */
  accessViaScheduleUserIds?: string[];
  disabled?: boolean;
};

export default function ClientAssigneesPicker({
  assignees,
  selectedUserIds,
  onChange,
  accessViaScheduleUserIds = [],
  disabled = false,
}: ClientAssigneesPickerProps) {
  const sortedAssignees = useMemo(
    () => [...assignees].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [assignees],
  );

  const scheduleAccessSet = useMemo(
    () => new Set(accessViaScheduleUserIds),
    [accessViaScheduleUserIds],
  );

  const toggleUser = (userId: string) => {
    if (disabled) return;
    if (scheduleAccessSet.has(userId) && !selectedUserIds.includes(userId)) return;
    onChange(
      selectedUserIds.includes(userId)
        ? selectedUserIds.filter((id) => id !== userId)
        : [...selectedUserIds, userId],
    );
  };

  if (sortedAssignees.length === 0) {
    return <p className={styles.emptyText}>No hay operarios en el equipo.</p>;
  }

  return (
    <ul className={styles.assigneeList} aria-label="Operarios del workspace">
      {sortedAssignees.map((user) => {
        const explicitlySelected = selectedUserIds.includes(user.id);
        const viaScheduleOnly =
          scheduleAccessSet.has(user.id) && !explicitlySelected;
        const checked = explicitlySelected || viaScheduleOnly;
        const itemDisabled = disabled || viaScheduleOnly;
        return (
          <li key={user.id}>
            <label
              className={cx(
                styles.assigneeItem,
                checked && styles.assigneeItemActive,
                viaScheduleOnly && styles.assigneeItemScheduleAccess,
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={itemDisabled}
                onChange={() => toggleUser(user.id)}
              />
              <UserAvatar user={user} size="sm" />
              <span className={styles.assigneeName}>{user.name}</span>
              {viaScheduleOnly ? (
                <span className={styles.scheduleAccessBadge}>Por actividad</span>
              ) : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
