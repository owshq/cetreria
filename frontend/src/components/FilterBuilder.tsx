import { Plus, CircleMinus } from 'lucide-react';
import SelectMenu from '@/components/SelectMenu';
import { cx } from '@/lib/cx';
import {
  createEmptyCondition,
  createEmptyFilterGroup,
  createId,
  getOperatorsForValueType,
  LOGIC_OPERATOR_DESCRIPTIONS,
  LOGIC_OPERATOR_LABELS,
  FILTER_OPERATOR_LABELS,
  removeFilterNode,
  updateFilterGroup,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
  type LogicOperator,
  type TableViewColumnDef,
} from '@/lib/tableViews';
import styles from './FilterBuilder.module.css';

type FilterBuilderProps<T, Ctx = undefined> = {
  columns: TableViewColumnDef<T, Ctx>[];
  filterRoot: FilterGroup;
  onChange: (next: FilterGroup) => void;
  depth?: number;
};

function operatorNeedsValue(operator: FilterCondition['operator']) {
  return operator !== 'empty' && operator !== 'not_empty';
}

export default function FilterBuilder<T, Ctx = undefined>({
  columns,
  filterRoot,
  onChange,
  depth = 0,
}: FilterBuilderProps<T, Ctx>) {
  const filterableColumns = columns.filter((column) => column.filterable);

  const updateGroup = (groupId: string, updater: (group: FilterGroup) => FilterGroup) => {
    onChange(updateFilterGroup(filterRoot, groupId, updater));
  };

  const renderGroup = (group: FilterGroup, nested: boolean) => (
    <div
      key={group.id}
      className={cx(styles.group, nested && styles.groupNested)}
    >
      <div className={styles.groupHeader}>
        <span className={styles.groupTitle}>{nested ? 'Subgrupo' : 'Coincidencias'}</span>
        <SelectMenu
          value={group.logic}
          onChange={(value) =>
            updateGroup(group.id, (current) => ({
              ...current,
              logic: value as LogicOperator,
            }))
          }
          options={(Object.keys(LOGIC_OPERATOR_LABELS) as LogicOperator[]).map((logic) => ({
            value: logic,
            label: LOGIC_OPERATOR_LABELS[logic],
          }))}
          ariaLabel="Operador lógico del grupo"
          className={styles.logicSelect}
        />
        <span className={styles.logicHint}>{LOGIC_OPERATOR_DESCRIPTIONS[group.logic]}</span>
        <div className={styles.groupActions}>
          {nested && (
            <button
              type="button"
              className={styles.groupActionBtn}
              onClick={() => onChange(removeFilterNode(filterRoot, group.id))}
            >
              <CircleMinus size={12} />
              Quitar grupo
            </button>
          )}
          <button
            type="button"
            className={styles.groupActionBtn}
            onClick={() =>
              updateGroup(group.id, (current) => ({
                ...current,
                children: [
                  ...current.children,
                  createEmptyCondition(filterableColumns[0]?.id ?? ''),
                ],
              }))
            }
          >
            <Plus size={12} />
            Condición
          </button>
          <button
            type="button"
            className={styles.groupActionBtn}
            onClick={() =>
              updateGroup(group.id, (current) => ({
                ...current,
                children: [...current.children, createEmptyFilterGroup('and')],
              }))
            }
          >
            <Plus size={12} />
            Grupo
          </button>
        </div>
      </div>

      {group.children.length === 0 ? (
        <div className={styles.emptyGroup}>
          Añade condiciones o subgrupos para construir la vista.
        </div>
      ) : (
        <div className={styles.conditionList}>
          {group.children.map((child) => renderNode(child, group.id))}
        </div>
      )}
    </div>
  );

  const renderNode = (node: FilterNode, parentGroupId: string) => {
    if (node.kind === 'group') {
      return renderGroup(node, true);
    }

    return renderCondition(node, parentGroupId);
  };

  const renderCondition = (condition: FilterCondition, parentGroupId: string) => {
    const column =
      filterableColumns.find((entry) => entry.id === condition.columnId) ?? filterableColumns[0];
    const operators = getOperatorsForValueType(column?.valueType ?? 'text');

    const patchCondition = (patch: Partial<FilterCondition>) => {
      updateGroup(parentGroupId, (current) => ({
        ...current,
        children: current.children.map((child) =>
          child.id === condition.id && child.kind === 'condition'
            ? { ...child, ...patch }
            : child,
        ),
      }));
    };

    const handleColumnChange = (columnId: string) => {
      const nextColumn = filterableColumns.find((entry) => entry.id === columnId);
      const nextOperators = getOperatorsForValueType(nextColumn?.valueType ?? 'text');
      patchCondition({
        columnId,
        operator: nextOperators[0] ?? 'contains',
        value: '',
      });
    };

    return (
      <div key={condition.id} className={styles.conditionRow}>
        <SelectMenu
          value={column?.id ?? ''}
          onChange={handleColumnChange}
          options={filterableColumns.map((entry) => ({
            value: entry.id,
            label: entry.label,
            emoji: entry.emoji,
          }))}
          ariaLabel="Campo"
          className={styles.fieldSelect}
        />
        <SelectMenu
          value={condition.operator}
          onChange={(value) =>
            patchCondition({
              operator: value as FilterCondition['operator'],
              value: operatorNeedsValue(value as FilterCondition['operator']) ? condition.value : '',
            })
          }
          options={operators.map((operator) => ({
            value: operator,
            label: FILTER_OPERATOR_LABELS[operator],
          }))}
          ariaLabel="Operador"
          className={styles.operatorSelect}
        />
        {operatorNeedsValue(condition.operator) ? (
          column?.filterOptions?.length ? (
            <SelectMenu
              value={condition.value}
              onChange={(value) => patchCondition({ value })}
              options={column.filterOptions.map((option) => ({
                value: option.value,
                label: option.label,
                dotColor: option.dotColor,
                emoji: option.emoji,
              }))}
              ariaLabel="Valor"
              className={styles.valueSelect}
            />
          ) : (
            <input
              type={column?.valueType === 'number' ? 'number' : column?.valueType === 'date' ? 'date' : 'text'}
              value={condition.value}
              onChange={(event) => patchCondition({ value: event.target.value })}
              className={styles.valueInput}
              placeholder="Valor"
            />
          )
        ) : (
          <div className={styles.valueInput} aria-hidden />
        )}
        <button
          type="button"
          className={styles.removeBtn}
          aria-label="Eliminar condición"
          onClick={() => onChange(removeFilterNode(filterRoot, condition.id))}
        >
          <CircleMinus size={14} />
        </button>
      </div>
    );
  };

  return <div className={styles.filterBuilder}>{renderGroup(filterRoot, depth > 0)}</div>;
}

export function createDefaultFilterRoot<T, Ctx>(
  columns: TableViewColumnDef<T, Ctx>[],
): FilterGroup {
  const firstColumn = columns.find((column) => column.filterable);
  return {
    id: createId(),
    kind: 'group',
    logic: 'and',
    children: firstColumn ? [createEmptyCondition(firstColumn.id)] : [],
  };
}
