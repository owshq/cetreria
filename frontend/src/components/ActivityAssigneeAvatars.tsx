import type { ActivityAssigneeSlot, UserAssignee } from '@shared/types';
import { isShiftCode, SHIFT_META } from '@shared/types';
import UserAvatar from '@/components/UserAvatar';
import { ShiftStateBadge } from '@/components/UserScheduleEditor';
import { useWorkspaceFeatureSettings } from '@/context/WorkspaceFeatureSettingsContext';
import { cx } from '@/lib/cx';
import ui from '@/styles/shared.module.css';
import styles from './ActivityAssigneeAvatars.module.css';

type ActivityAssigneeAvatarsProps = {
  users: UserAssignee[];
  assigneeSlots: ActivityAssigneeSlot[];
  maxVisible?: number;
  hiddenCount?: number;
  variant?: 'default' | 'nav' | 'table';
  stacked?: boolean;
  className?: string;
};

export default function ActivityAssigneeAvatars({
  users,
  assigneeSlots,
  maxVisible,
  hiddenCount: hiddenCountProp,
  variant = 'default',
  stacked = false,
  className,
}: ActivityAssigneeAvatarsProps) {
  const { shiftSchedulingEnabled } = useWorkspaceFeatureSettings();
  if (users.length === 0) return null;

  const visibleUsers = maxVisible != null ? users.slice(0, maxVisible) : users;
  const hiddenCount =
    hiddenCountProp ??
    (maxVisible != null ? Math.max(users.length - visibleUsers.length, 0) : 0);
  const namesLabel = users.map((user) => user.name).join(', ');

  return (
    <div
      className={cx(
        styles.root,
        variant === 'nav' && styles.nav,
        variant === 'table' && styles.table,
        stacked && styles.stacked,
        className,
      )}
      aria-label={`Asignado a ${namesLabel}`}
    >
      {visibleUsers.map((user) => {
        const slot = assigneeSlots.find((item) => item.userId === user.id);
        const shift = slot?.shift;
        return (
          <div key={user.id} className={styles.avatarWrap}>
            <UserAvatar user={user} size="sm" className={styles.avatar} />
            {shiftSchedulingEnabled && shift && isShiftCode(shift) ? (
              <ShiftStateBadge
                shift={shift}
                compact
                className={styles.shiftMark}
                title={`${user.name}: ${SHIFT_META[shift].label}`}
              />
            ) : null}
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <span className={styles.overflow} aria-hidden>
          +{hiddenCount}
        </span>
      ) : null}
      {variant === 'table' ? (
        <span className={cx(ui.fontMedium, ui.truncate, styles.tableNames)} title={namesLabel}>
          {namesLabel}
        </span>
      ) : null}
    </div>
  );
}
