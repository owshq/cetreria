import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import SecondarySidebarSectionHeader from '@/components/SecondarySidebarSectionHeader';
import ContextMenu, { type ContextMenuEntry } from '@/components/ContextMenu';
import { ViewFilterIcon } from '@/components/icons/ViewFilterIcon';
import { cx } from '@/lib/cx';
import type { ReportKind } from '@shared/types';
import styles from './ReportsKindNav.module.css';

export type SavedReportKindFilter = ReportKind | 'all';

export type ReportsKindNavOption = {
  id: SavedReportKindFilter;
  label: string;
};

type ReportsKindNavProps = {
  options: ReportsKindNavOption[];
  activeKind: SavedReportKindFilter;
  onSelect: (kind: SavedReportKindFilter) => void;
  compact?: boolean;
};

type FilterMenuState = {
  x: number;
  y: number;
};

export default function ReportsKindNav({
  options,
  activeKind,
  onSelect,
  compact = false,
}: ReportsKindNavProps) {
  const [filterMenu, setFilterMenu] = useState<FilterMenuState | null>(null);

  const activeLabel = useMemo(
    () => options.find((option) => option.id === activeKind)?.label ?? 'Todos',
    [activeKind, options],
  );

  const isFilterActive = activeKind !== 'all';

  const menuItems = useMemo((): ContextMenuEntry[] => {
    if (options.length <= 1) return [];

    return [
      { kind: 'header', id: 'kind-header', label: 'Tipo' },
      ...options.map((option) => ({
        id: option.id,
        label: option.label,
        selected: activeKind === option.id,
        onSelect: () => onSelect(option.id),
      })),
    ];
  }, [activeKind, onSelect, options]);

  const openFilterMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setFilterMenu({
      x: rect.right,
      y: rect.bottom + 4,
    });
  };

  if (options.length <= 1) return null;

  if (compact) {
    return (
      <>
        <div className={styles.searchFilterRoot}>
          <button
            type="button"
            className={cx(
              styles.searchFilterBtn,
              (isFilterActive || filterMenu !== null) && styles.searchFilterBtnActive,
            )}
            aria-haspopup="menu"
            aria-expanded={filterMenu !== null}
            aria-label={`Tipo de informe: ${activeLabel}`}
            title={`Tipo: ${activeLabel}`}
            onClick={openFilterMenu}
          >
            <ViewFilterIcon className={styles.searchFilterIcon} />
          </button>
        </div>
        {filterMenu ? (
          <ContextMenu
            x={filterMenu.x}
            y={filterMenu.y}
            anchorX="end"
            ariaLabel="Tipo de informe"
            onClose={() => setFilterMenu(null)}
            items={menuItems}
          />
        ) : null}
      </>
    );
  }

  return (
    <section className={styles.wrap} aria-label="Tipo de informe">
      <SecondarySidebarSectionHeader title="Tipo" />
      <nav className={styles.list} role="list">
        {options.map((option) => {
          const active = activeKind === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={cx(styles.item, active && styles.itemActive)}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(option.id)}
            >
              <span className={styles.label}>{option.label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
