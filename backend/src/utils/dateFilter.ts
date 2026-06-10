import { isDateInRange } from '@shared/types';

export function filterByDateRange<T extends { date: string }>(
  items: T[],
  from?: string,
  to?: string,
): T[] {
  if (!from || !to) return items;
  return items.filter((item) => isDateInRange(item.date, from, to));
}
