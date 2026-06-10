import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UserAssignee } from '@shared/types';
import { isAllTeamUsers } from '@/lib/activitiesTeamFilter';
import type { SavedTableView } from '@/lib/viewConfig';
import ActivitiesMobileFilterMenu from '@/components/ActivitiesMobileFilterMenu';
import { cx } from '@/lib/cx';
import styles from './ActivitiesTableNav.module.css';

type ActivitiesTableNavProps = {
  assignees: UserAssignee[];
  currentUserId: string;
  selectedUserId: string;
  isAdmin: boolean;
  onSelectUser: (userId: string) => void;
  savedViews: SavedTableView[];
  activeSavedViewId: string | null;
  onSelectView: (view: SavedTableView) => void;
  loading?: boolean;
  compact?: boolean;
  compactPlacement?: 'footer' | 'toolbar';
};

type MobileFilterMenuState = {
  x: number;
  y: number;
};

export default function ActivitiesTableNav({
  assignees,
  currentUserId,
  selectedUserId,
  isAdmin,
  onSelectUser,
  savedViews,
  activeSavedViewId,
  onSelectView,
  loading = false,
  compact = false,
  compactPlacement = 'footer',
}: ActivitiesTableNavProps) {
  const [mobileFilterMenu, setMobileFilterMenu] = useState<MobileFilterMenuState | null>(null);

  const activeView = savedViews.find((view) => view.id === activeSavedViewId);
  const selectedAssignee = assignees.find((user) => user.id === selectedUserId);

  const compactTriggerLabel = useMemo(() => {
    if (activeSavedViewId && activeView) {
      return activeView.name;
    }
    if (isAdmin && !isAllTeamUsers(selectedUserId) && selectedAssignee) {
      return selectedAssignee.id === currentUserId
        ? `${selectedAssignee.name} (tú)`
        : selectedAssignee.name;
    }
    return 'Todos';
  }, [
    activeSavedViewId,
    activeView,
    isAdmin,
    selectedUserId,
    selectedAssignee,
    currentUserId,
  ]);

  const isFilterActive =
    Boolean(activeSavedViewId) || (isAdmin && !isAllTeamUsers(selectedUserId));

  const hasFilterOptions = isAdmin || savedViews.length > 0;

  const openMobileFilterMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMobileFilterMenu({
      x: rect.left,
      y: rect.bottom + 4,
    });
  };

  const mobileFilterMenuPortal = mobileFilterMenu ? (
    <ActivitiesMobileFilterMenu
      x={mobileFilterMenu.x}
      y={mobileFilterMenu.y}
      onClose={() => setMobileFilterMenu(null)}
      assignees={assignees}
      currentUserId={currentUserId}
      selectedUserId={selectedUserId}
      isAdmin={isAdmin}
      onSelectUser={onSelectUser}
      savedViews={savedViews}
      activeSavedViewId={activeSavedViewId}
      onSelectView={onSelectView}
    />
  ) : null;

  if (!hasFilterOptions) {
    return null;
  }

  if (compact && compactPlacement === 'toolbar') {
    return (
      <>
        <button
          type="button"
          className={cx(
            styles.activitiesToolbarFilterBtn,
            isFilterActive && styles.activitiesToolbarFilterBtnActive,
          )}
          aria-haspopup="menu"
          aria-expanded={mobileFilterMenu !== null}
          aria-label={`Filtros: ${compactTriggerLabel}`}
          disabled={loading}
          onClick={openMobileFilterMenu}
        >
          <span className={styles.activitiesNavCompactTriggerLabel}>{compactTriggerLabel}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
        {mobileFilterMenuPortal}
      </>
    );
  }

  return null;
}
