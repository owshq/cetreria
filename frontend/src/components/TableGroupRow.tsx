import ViewGroupTitle from '@/components/ViewGroupTitle';
import tableStyles from '@/components/ConfigurableTable.module.css';
import ui from '@/styles/shared.module.css';

type TableGroupRowProps = {
  label: string;
  count: number;
  itemIds: string[];
  colSpan: number;
  dotColor?: string;
  badgeClassName?: string;
  selectedIds: string[];
  onToggleSelect: () => void;
};

export default function TableGroupRow({
  label,
  count,
  itemIds,
  colSpan,
  dotColor,
  badgeClassName,
  selectedIds,
  onToggleSelect,
}: TableGroupRowProps) {
  const showSelect = count > 0;
  const allSelected = itemIds.length > 0 && itemIds.every((id) => selectedIds.includes(id));
  const someSelected = itemIds.some((id) => selectedIds.includes(id));

  return (
    <td colSpan={colSpan} className={ui.tableGroupCell}>
      <div className={ui.tableGroupCellInner}>
        <div className={tableStyles.selectCheckboxSlot}>
          {showSelect ? (
            <input
              type="checkbox"
              className={tableStyles.rowCheckbox}
              checked={allSelected}
              ref={(input) => {
                if (input) input.indeterminate = someSelected && !allSelected;
              }}
              onChange={onToggleSelect}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Seleccionar grupo ${label}`}
            />
          ) : null}
        </div>
        <span className={ui.tableGroupLabel}>
          {dotColor || badgeClassName ? (
            <ViewGroupTitle label={label} dotColor={dotColor} badgeClassName={badgeClassName} />
          ) : (
            label
          )}
          <span className={ui.textMuted}> ({count})</span>
        </span>
      </div>
    </td>
  );
}
