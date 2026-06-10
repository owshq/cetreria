import { CircleMinus, Lock } from 'lucide-react';
import { authService } from '@/api';
import type { SavedTableView } from '@/lib/viewConfig';
import { canDeleteSavedTableView } from '@/lib/viewConfig';
import SecondarySidebarSectionHeader from '@/components/SecondarySidebarSectionHeader';
import { cx } from '@/lib/cx';
import styles from './SavedViewsNav.module.css';

type Props = {
  views: SavedTableView[];
  activeViewId?: string | null;
  onSelect: (view: SavedTableView) => void;
  onDelete: (viewId: string) => void;
  filtersOpen?: boolean;
  flushPadding?: boolean;
  /** Sin borde superior; espaciado lo define el contenedor padre (p. ej. sidebar Documentos). */
  stacked?: boolean;
};

export default function SavedViewsNav({
  views,
  activeViewId = null,
  onSelect,
  onDelete,
  filtersOpen = false,
  flushPadding = false,
  stacked = false,
}: Props) {
  if (views.length === 0) return null;

  const currentUser = authService.getCurrentUser();

  return (
    <div
      className={cx(
        styles.wrap,
        filtersOpen
          ? styles.wrapFiltersOpen
          : stacked
            ? styles.wrapStacked
            : styles.wrapDefault,
        flushPadding && styles.flushPadding,
      )}
    >
      {stacked ? (
        <SecondarySidebarSectionHeader title="Vistas" />
      ) : (
        <p className={styles.title}>Vistas</p>
      )}
      <nav className={styles.list} aria-label="Vistas">
        {views.map((view) => (
          <div key={view.id} className={styles.itemWrap}>
            <button
              type="button"
              className={cx(styles.item, activeViewId === view.id && styles.itemActive)}
              onClick={() => onSelect(view)}
              title={view.description || view.name}
              aria-pressed={activeViewId === view.id}
            >
              <span className={styles.itemIcon} aria-hidden>
                {view.icon}
              </span>
              <span className={styles.itemLabel}>{view.name}</span>
              {view.isPrivate && (
                <Lock
                  size={11}
                  strokeWidth={2}
                  className={styles.itemLock}
                  aria-label="Vista privada"
                />
              )}
            </button>
            <div className={styles.itemActions}>
              {canDeleteSavedTableView(view, currentUser) ? (
              <button
                type="button"
                className={styles.deleteBtn}
                aria-label={`Eliminar ${view.name}`}
                onClick={() => onDelete(view.id)}
              >
                <CircleMinus size={14} aria-hidden />
              </button>
              ) : null}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
