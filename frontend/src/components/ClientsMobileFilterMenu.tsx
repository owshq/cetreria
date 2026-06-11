import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ClientGroup, UserAssignee } from '@shared/types';
import type { SavedTableView } from '@/lib/viewConfig';
import MobileFilterMenuItem from '@/components/MobileFilterMenuItem';
import { usePopupEscape } from '@/context/PopupStackContext';
import { ACTIVITIES_ALL_USERS_ID, isAllTeamUsers } from '@/lib/activitiesTeamFilter';
import styles from './DocumentsMobileFilterMenu.module.css';

type ClientsMobileFilterMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  groups: ClientGroup[];
  activeGroupId: string;
  onSelectGroup: (groupId: string) => void;
  savedViews: SavedTableView[];
  activeSavedViewId: string | null;
  onSelectView?: (view: SavedTableView) => void;
  assignees?: UserAssignee[];
  selectedOperatorId?: string;
  onSelectOperator?: (operatorId: string) => void;
};

export default function ClientsMobileFilterMenu({
  x,
  y,
  onClose,
  groups,
  activeGroupId,
  onSelectGroup,
  savedViews,
  activeSavedViewId,
  onSelectView,
  assignees = [],
  selectedOperatorId = ACTIVITIES_ALL_USERS_ID,
  onSelectOperator,
}: ClientsMobileFilterMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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
  }, [x, y, groups.length, savedViews.length, assignees.length]);

  const sortedAssignees = useMemo(
    () => [...assignees].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [assignees],
  );

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
      aria-label="Grupos de contactos"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className={styles.staticSection}>
        <div className={styles.sectionHeader} role="presentation">
          Grupos
        </div>
        <MobileFilterMenuItem
          selected={activeGroupId === 'all'}
          label="Todos"
          onClick={() => selectAndClose(() => onSelectGroup('all'))}
        />
        {groups.map((group) => (
          <MobileFilterMenuItem
            key={group.id}
            selected={activeGroupId === group.id}
            label={group.name}
            title={group.name}
            onClick={() => selectAndClose(() => onSelectGroup(group.id))}
          />
        ))}
      </div>

      {onSelectOperator && assignees.length > 0 && (
        <>
          <div className={styles.separator} role="separator" />
          <div className={styles.staticSection}>
            <div className={styles.sectionHeader} role="presentation">
              Operarios
            </div>
            <MobileFilterMenuItem
              selected={isAllTeamUsers(selectedOperatorId)}
              label="Todos"
              onClick={() => selectAndClose(() => onSelectOperator(ACTIVITIES_ALL_USERS_ID))}
            />
            {sortedAssignees.map((assignee) => (
              <MobileFilterMenuItem
                key={assignee.id}
                selected={selectedOperatorId === assignee.id}
                label={assignee.name}
                title={assignee.name}
                onClick={() => selectAndClose(() => onSelectOperator(assignee.id))}
              />
            ))}
          </div>
        </>
      )}

      {onSelectView && savedViews.length > 0 && (
        <>
          <div className={styles.separator} role="separator" />
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
      )}
    </div>,
    document.body,
  );
}
