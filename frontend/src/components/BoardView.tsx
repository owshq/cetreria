import type { ReactNode } from 'react';
import EmptyState from '@/components/EmptyState';
import ViewGroupTitle from '@/components/ViewGroupTitle';
import { cx } from '@/lib/cx';
import type { TableViewGroup } from '@/lib/tableViews';
import ui from '@/styles/shared.module.css';
import styles from './BoardView.module.css';

type BoardViewProps<T> = {
  groups: TableViewGroup<T>[];
  getItemKey: (item: T) => string;
  renderCard: (item: T) => ReactNode;
  onCardClick?: (item: T) => void;
  emptyDescription?: string;
};

export default function BoardView<T>({
  groups,
  getItemKey,
  renderCard,
  onCardClick,
  emptyDescription = 'No hay elementos para mostrar en el tablero.',
}: BoardViewProps<T>) {
  if (groups.length === 0) {
    return (
      <div className={styles.emptyBoard}>
        <EmptyState emoji="📋" description={emptyDescription} compact />
      </div>
    );
  }

  return (
    <div className={styles.board}>
      {groups.map((group) => (
        <div key={group.key} className={cx(ui.pageSectionFill, styles.columnWrapper)}>
          <div className={ui.pageSectionTitleRow}>
            <ViewGroupTitle
              label={group.label}
              dotColor={group.dotColor}
              badgeClassName={group.badgeClassName}
              className={ui.pageSectionTitle}
              as="h2"
            />
            <span className={cx(ui.textMuted, ui.textXs)}>{group.items.length}</span>
          </div>
          <div className={cx(ui.card, styles.columnCard)} aria-label={group.label}>
            <div className={cx(styles.columnBody, ui.listPanelShell)}>
              <div className={ui.listPanel}>
                {group.items.map((item) => {
                  const cardContent = (
                    <div className={ui.listPanelItemBody}>{renderCard(item)}</div>
                  );

                  if (!onCardClick) {
                    return (
                      <div key={getItemKey(item)} className={ui.listPanelItem}>
                        {cardContent}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={getItemKey(item)}
                      className={cx(ui.listPanelItem, styles.clickableItem)}
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest('a, button, input, label, textarea, select')
                        ) {
                          return;
                        }
                        onCardClick(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        if (
                          event.target instanceof Element &&
                          event.target.closest('a, button, input, label, textarea, select')
                        ) {
                          return;
                        }
                        event.preventDefault();
                        onCardClick(item);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {cardContent}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
