import { useMemo, useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import type { UserAssignee } from '@shared/types';
import { ACTIVITIES_ALL_USERS_ID, isAllTeamUsers } from '@/lib/activitiesTeamFilter';
import { cx } from '@/lib/cx';
import { scrollRegionProps } from '@/lib/scrollRegion';
import UserAvatar from '@/components/UserAvatar';
import SecondarySidebarSectionHeader from '@/components/SecondarySidebarSectionHeader';
import { SearchField } from '@/components/forms';
import styles from './ActivitiesScheduleNav.module.css';

type ActivitiesScheduleNavProps = {
  assignees: UserAssignee[];
  currentUserId: string;
  selectedUserId: string;
  isAdmin: boolean;
  onSelect: (userId: string) => void;
  /** Cabecera «Operarios» con búsqueda colapsable (sidebar secundario de actividades). */
  sectionHeader?: boolean;
  loading?: boolean;
};

export default function ActivitiesScheduleNav({
  assignees,
  currentUserId,
  selectedUserId,
  isAdmin,
  onSelect,
  sectionHeader = false,
  loading = false,
}: ActivitiesScheduleNavProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    const term = searchTerm.toLowerCase().trim();
    if (!term) return sortedAssignees;
    return sortedAssignees.filter((user) => user.name.toLowerCase().includes(term));
  }, [sortedAssignees, searchTerm]);

  useEffect(() => {
    if (sortedAssignees.length === 0) return;
    if (isAllTeamUsers(selectedUserId)) return;
    if (!sortedAssignees.some((user) => user.id === selectedUserId)) {
      onSelect(sortedAssignees[0]!.id);
    }
  }, [sortedAssignees, selectedUserId, onSelect]);

  const canSearch = sortedAssignees.length > 3;
  const showSearchField = canSearch && (!sectionHeader || searchOpen);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (canSearch) return;
    setSearchOpen(false);
    setSearchTerm('');
  }, [canSearch]);

  const searchToggle = sectionHeader && canSearch ? (
    <button
      type="button"
      className={styles.searchToggleBtn}
      aria-label={searchOpen ? 'Ocultar búsqueda' : 'Buscar operario'}
      aria-expanded={searchOpen}
      onClick={() => setSearchOpen((open) => !open)}
    >
      <Search size={14} strokeWidth={1.75} aria-hidden />
    </button>
  ) : null;

  return (
    <section className={styles.wrap} aria-label="Actividades del equipo">
      {sectionHeader ? (
        <SecondarySidebarSectionHeader title="Operarios" action={searchToggle} />
      ) : null}
      {showSearchField ? (
        <div className={styles.search}>
          <SearchField
            ref={searchInputRef}
            wrapperClassName={styles.searchField}
            placeholder="Buscar operario"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
      ) : null}
      <div className={styles.list} role="list" {...scrollRegionProps} aria-busy={loading || undefined}>
        {loading ? (
          <div className={styles.empty}>
            <p className={styles.loadingText}>Cargando...</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              role="listitem"
              className={cx(styles.item, styles.itemAll, isAllTeamUsers(selectedUserId) && styles.itemActive)}
              aria-current={isAllTeamUsers(selectedUserId) ? 'true' : undefined}
              onClick={() => onSelect(ACTIVITIES_ALL_USERS_ID)}
            >
              <span className={styles.name}>Todos</span>
            </button>
            {visibleAssignees.length > 0 ? (
              visibleAssignees.map((user) => {
                const active = user.id === selectedUserId;
                return (
                  <button
                    key={user.id}
                    type="button"
                    role="listitem"
                    className={cx(styles.item, active && styles.itemActive)}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelect(user.id)}
                  >
                    <UserAvatar user={user} size="sm" />
                    <span className={styles.name}>
                      {user.name}
                      {user.id === currentUserId ? (
                        <span className={styles.youTag}> (tú)</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            ) : searchTerm.trim() ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>No hay operarios que coincidan con la búsqueda.</p>
              </div>
            ) : assignees.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>No hay operarios en el equipo.</p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
