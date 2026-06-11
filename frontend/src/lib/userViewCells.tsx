import type { MutableRefObject, ReactNode } from 'react';
import { CalendarDays, CircleMinus, ListTodo, Pencil } from 'lucide-react';
import type { User } from '@shared/types';
import { getKnownHalconeriaPassword, getUserRoleLabel } from '@shared/types';
import UserAvatar from '@/components/UserAvatar';
import { PasswordLockIcon } from '@/components/icons/PasswordLockIcon';
import ui from '@/styles/shared.module.css';
import styles from '@/pages/Users.module.css';

export type UserPanelMode = 'schedule' | 'activities';

type RenderUserCellArgs = {
  columnId: string;
  user: Omit<User, 'password'>;
  currentUserId?: string;
  editingRoleId: string | null;
  roleDraft: string;
  onRoleDraftChange: (value: string) => void;
  onStartRoleEdit: (user: Omit<User, 'password'>) => void;
  onFinishRoleEdit: (user: Omit<User, 'password'>) => void;
  onCancelRoleEdit: () => void;
  roleEditCancelledRef: MutableRefObject<boolean>;
  onEdit: (user: Omit<User, 'password'>) => void;
  onDelete: (id: string) => void;
  userPanelMode?: UserPanelMode | null;
  onOpenUserPanel?: (user: Omit<User, 'password'>) => void;
  passwordOverrides: Record<string, string>;
  revealedPasswordUserIds: ReadonlySet<string>;
  onTogglePasswordVisibility: (userId: string) => void;
};

export function renderUserCell({
  columnId,
  user,
  currentUserId,
  editingRoleId,
  roleDraft,
  onRoleDraftChange,
  onStartRoleEdit,
  onFinishRoleEdit,
  onCancelRoleEdit,
  roleEditCancelledRef,
  onEdit,
  userPanelMode,
  onOpenUserPanel,
  onDelete,
  passwordOverrides,
  revealedPasswordUserIds,
  onTogglePasswordVisibility,
}: RenderUserCellArgs): ReactNode {
  switch (columnId) {
    case 'user':
      return (
        <div className={styles.userCell}>
          <UserAvatar user={user} />
          <div>
            <div className={ui.fontMedium}>{user.name}</div>
            {user.id === currentUserId && <span className={ui.textXs}>(Tú)</span>}
          </div>
        </div>
      );
    case 'email':
      return <div className={ui.textSmall}>{user.email}</div>;
    case 'role':
      if (user.role === 'admin') {
        return <span className={ui.badgeAdmin}>{getUserRoleLabel(user)}</span>;
      }
      if (editingRoleId === user.id) {
        return (
          <input
            type="text"
            className={styles.roleLabelInput}
            value={roleDraft}
            onChange={(e) => onRoleDraftChange(e.target.value)}
            onBlur={() => {
              if (roleEditCancelledRef.current) {
                roleEditCancelledRef.current = false;
                return;
              }
              void onFinishRoleEdit(user);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                roleEditCancelledRef.current = true;
                onCancelRoleEdit();
              }
            }}
            autoFocus
            aria-label={`Rol de ${user.name}`}
          />
        );
      }
      return (
        <button
          type="button"
          className={styles.roleLabelCell}
          onClick={() => onStartRoleEdit(user)}
          aria-label={`Editar rol de ${user.name}`}
        >
          <span className={styles.roleLabelText}>{getUserRoleLabel(user)}</span>
          <Pencil size={14} className={styles.roleLabelPencil} aria-hidden />
        </button>
      );
    case 'password': {
      const plainPassword = passwordOverrides[user.id] ?? getKnownHalconeriaPassword(user.email);
      const revealed = revealedPasswordUserIds.has(user.id);
      return (
        <div className={styles.passwordCell}>
          <span className={styles.passwordValue}>
            {plainPassword ? (revealed ? plainPassword : '••••••••') : '—'}
          </span>
          {plainPassword ? (
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => onTogglePasswordVisibility(user.id)}
              aria-label={revealed ? `Ocultar contraseña de ${user.name}` : `Mostrar contraseña de ${user.name}`}
              aria-pressed={revealed}
            >
              <PasswordLockIcon unlocked={revealed} />
            </button>
          ) : null}
        </div>
      );
    }
    case 'actions': {
      const panelLabel = userPanelMode === 'schedule' ? 'Horario' : 'Actividades';
      return (
        <div className={ui.flexEnd}>
          {onOpenUserPanel && userPanelMode ? (
            <button
              type="button"
              onClick={() => onOpenUserPanel(user)}
              className={ui.btnIcon}
              title={panelLabel}
              aria-label={`${panelLabel} de ${user.name}`}
            >
              {userPanelMode === 'schedule' ? (
                <CalendarDays size={16} />
              ) : (
                <ListTodo size={16} />
              )}
            </button>
          ) : null}
          <button type="button" onClick={() => onEdit(user)} className={ui.btnIcon} title="Editar">
            <Pencil size={16} />
          </button>
          {user.id !== currentUserId && (
            <button type="button" onClick={() => onDelete(user.id)} className={ui.btnIconDanger} title="Eliminar">
              <CircleMinus size={16} />
            </button>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}
