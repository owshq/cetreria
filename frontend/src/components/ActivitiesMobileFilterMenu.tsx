import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UserAssignee } from '@shared/types';
import { ACTIVITIES_ALL_USERS_ID, isAllTeamUsers } from '@/lib/activitiesTeamFilter';
import type { SavedTableView } from '@/lib/viewConfig';
import { SearchField } from '@/components/forms';
import MobileFilterMenuItem from '@/components/MobileFilterMenuItem';
import { usePopupEscape } from '@/context/PopupStackContext';
import styles from './DocumentsMobileFilterMenu.module.css';

type ActivitiesMobileFilterMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  assignees: UserAssignee[];
  currentUserId: string;
  selectedUserId: string;
  isAdmin: boolean;
  onSelectUser: (userId: string) => void;
  savedViews: SavedTableView[];
  activeSavedViewId: string | null;
  onSelectView?: (view: SavedTableView) => void;
};

export default function ActivitiesMobileFilterMenu({
  x,
  y,
  onClose,
  assignees,
  currentUserId,
  selectedUserId,
  isAdmin,
  onSelectUser,
  savedViews,
  activeSavedViewId,
  onSelectView,
}: ActivitiesMobileFilterMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [userSearch, setUserSearch] = useState('');

  usePopupEscape(true, onClose);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const sortedAssignees = useMemo(() => {
    const list = [...assignees];
    list.sort((a, b) => {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
      return a.name.localeCompare(b.name, 'es');
    });
    return list;
  }, [assignees, currentUserId]);

  const visibleAssignees = useMemo(() => {
    const term = userSearch.trim().toLowerCase();
    if (!term) return sortedAssignees;
    return sortedAssignees.filter((user) => user.name.toLowerCase().includes(term));
  }, [sortedAssignees, userSearch]);

  const showUserSearch = isAdmin && sortedAssignees.length > 3;

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const padding = 8;
    const { width, height } = el.getBoundingClientRect();
    let left = x;
    let top = y;

    if (left + width > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - width - padding);
    }
    if (top + height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - height - padding);
    }

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, userSearch, assignees.length, savedViews.length, isAdmin]);

  const selectAndClose = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="menu"
      aria-label="Filtros de actividades"
      onContextMenu={(event) => event.preventDefault()}
    >
      {isAdmin ? (
        <>
          <div className={styles.sectionHeader} role="presentation">
            Operarios
          </div>
          {showUserSearch ? (
            <div className={styles.searchWrap}>
              <SearchField
                wrapperClassName={styles.searchField}
                placeholder="Buscar operario"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
            </div>
          ) : null}
          <div className={styles.clientsList} role="listbox" aria-label="Operarios">
            <MobileFilterMenuItem
              selected={isAllTeamUsers(selectedUserId)}
              label="Todos"
              onClick={() => selectAndClose(() => onSelectUser(ACTIVITIES_ALL_USERS_ID))}
            />
            {visibleAssignees.length > 0 ? (
              visibleAssignees.map((user) => (
                <MobileFilterMenuItem
                  key={user.id}
                  selected={user.id === selectedUserId}
                  label={user.id === currentUserId ? `${user.name} (tú)` : user.name}
                  title={user.name}
                  onClick={() => selectAndClose(() => onSelectUser(user.id))}
                />
              ))
            ) : (
              <p className={styles.clientsEmpty}>Sin coincidencias</p>
            )}
          </div>
        </>
      ) : null}

      {onSelectView && savedViews.length > 0 ? (
        <>
          {isAdmin ? <div className={styles.separator} role="separator" /> : null}
          <div className={styles.staticSection}>
            <div className={styles.sectionHeader} role="presentation">
              Vistas
            </div>
            {savedViews.map((view) => (
              <MobileFilterMenuItem
                key={view.id}
                selected={activeSavedViewId === view.id}
                label={view.name}
                title={view.description || view.name}
                leadingIcon={view.icon}
                onClick={() => selectAndClose(() => onSelectView(view))}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
