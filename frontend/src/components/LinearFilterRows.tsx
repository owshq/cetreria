import { Minus, Plus } from 'lucide-react';
import { Input } from '@/components/forms';
import SelectMenu from '@/components/SelectMenu';
import {
  createEmptyFilterRule,
  createId,
  getOperatorsForValueType,
  type LinearFilterRule,
  type LogicOperator,
} from '@/lib/viewConfig';
import { FILTER_OPERATOR_LABELS, FILTER_OPERATOR_SYMBOLS, type TableViewColumnDef } from '@/lib/tableViews';
import { cx } from '@/lib/cx';
import styles from './LinearFilterRows.module.css';

type Props<T, Ctx = undefined> = {
  columns: TableViewColumnDef<T, Ctx>[];
  rules: LinearFilterRule[];
  onChange: (rules: LinearFilterRule[]) => void;
  stacked?: boolean;
  defaultColumnId?: string;
};

function operatorNeedsValue(operator: LinearFilterRule['operator']) {
  return operator !== 'empty' && operator !== 'not_empty';
}

const JOIN_OPTIONS: LogicOperator[] = ['and', 'or', 'nor', 'nand'];
const PLACEHOLDER_RULE_ID = '__placeholder__';

export default function LinearFilterRows<T, Ctx = undefined>({
  columns,
  rules,
  onChange,
  stacked = false,
  defaultColumnId,
}: Props<T, Ctx>) {
  const filterableColumns = columns.filter((column) => column.filterable);
  const firstColumnId =
    filterableColumns.find((column) => column.id === defaultColumnId)?.id ??
    filterableColumns[0]?.id ??
    '';

  const isPlaceholderOnly = rules.length === 0;
  const displayRules: LinearFilterRule[] = isPlaceholderOnly
    ? [
        {
          ...createEmptyFilterRule(''),
          id: PLACEHOLDER_RULE_ID,
          joinWithPrevious: null,
        },
      ]
    : rules;

  const updateRule = (ruleId: string, patch: Partial<LinearFilterRule>) => {
    if (isPlaceholderOnly) {
      onChange([{ ...displayRules[0], ...patch, id: createId() }]);
      return;
    }
    onChange(
      rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    );
  };

  const updateJoin = (ruleId: string, joinWithPrevious: LogicOperator) => {
    updateRule(ruleId, { joinWithPrevious });
  };

  const addRule = () => {
    if (isPlaceholderOnly) {
      onChange([
        { ...createEmptyFilterRule(''), joinWithPrevious: null },
        { ...createEmptyFilterRule(''), joinWithPrevious: 'and' },
      ]);
      return;
    }
    onChange([
      ...rules,
      {
        ...createEmptyFilterRule(firstColumnId),
        joinWithPrevious: 'and',
      },
    ]);
  };

  const removeRule = (ruleId: string) => {
    const next = rules.filter((rule) => rule.id !== ruleId);
    if (next.length > 0) next[0] = { ...next[0], joinWithPrevious: null };
    onChange(next);
  };

  return (
    <div className={styles.conditionBlock}>
      {displayRules.map((rule, index) => {
        const column = rule.columnId
          ? filterableColumns.find((entry) => entry.id === rule.columnId)
          : undefined;
        const operators = getOperatorsForValueType(column?.valueType ?? 'text');

        return (
          <div key={rule.id}>
            {index > 0 && (
              <div className={styles.joinRow}>
                <div className={styles.joinToggle}>
                  {JOIN_OPTIONS.map((logic) => (
                    <button
                      key={logic}
                      type="button"
                      className={
                        (rule.joinWithPrevious ?? 'and') === logic
                          ? styles.joinBtnActive
                          : styles.joinBtn
                      }
                      onClick={() => updateJoin(rule.id, logic)}
                    >
                      {logic.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={cx(styles.ruleRow, stacked && styles.ruleRowStacked)}>
              <SelectMenu
                value={rule.columnId}
                onChange={(columnId) => {
                  const nextColumn = filterableColumns.find((entry) => entry.id === columnId);
                  const nextOperators = getOperatorsForValueType(nextColumn?.valueType ?? 'text');
                  updateRule(rule.id, {
                    columnId,
                    operator: nextOperators[0] ?? 'contains',
                    value: '',
                  });
                }}
                options={filterableColumns.map((entry) => ({
                  value: entry.id,
                  label: entry.label,
                  emoji: entry.emoji,
                }))}
                ariaLabel="Variable"
                className={styles.fieldSelect}
                compact
                menuPortal
              />
              <SelectMenu
                value={rule.operator}
                onChange={(value) =>
                  updateRule(rule.id, {
                    operator: value as LinearFilterRule['operator'],
                    value: operatorNeedsValue(value as LinearFilterRule['operator'])
                      ? rule.value
                      : '',
                  })
                }
                options={operators.map((operator) => ({
                  value: operator,
                  label: FILTER_OPERATOR_LABELS[operator],
                  symbol: FILTER_OPERATOR_SYMBOLS[operator],
                }))}
                ariaLabel="Operador"
                className={styles.operatorSelect}
                compact
                menuPortal
                symbolOnlyTrigger
              />
              {operatorNeedsValue(rule.operator) ? (
                column?.filterOptions?.length ? (
                  <SelectMenu
                    value={rule.value}
                    onChange={(value) => updateRule(rule.id, { value })}
                    options={column.filterOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                      dotColor: option.dotColor,
                      emoji: option.emoji,
                    }))}
                    ariaLabel="Valor"
                    className={styles.valueSelect}
                    compact
                    menuPortal
                  />
                ) : (
                  <Input
                    type={
                      column?.valueType === 'number'
                        ? 'number'
                        : column?.valueType === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={rule.value}
                    onChange={(event) => updateRule(rule.id, { value: event.target.value })}
                    className={styles.valueInput}
                    placeholder="Valor"
                  />
                )
              ) : (
                <div className={styles.valueSpacer} aria-hidden />
              )}
              {index === 0 ? (
                <button type="button" className={styles.addBtn} onClick={addRule} aria-label="Añadir condición">
                  <Plus size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeRule(rule.id)}
                  aria-label="Eliminar condición"
                >
                  <Minus size={16} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

