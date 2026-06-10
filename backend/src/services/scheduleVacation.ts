import type { User, UserScheduleEntry } from '@shared/types';
import {
  canAssignVacationShift,
  countVacationDaysInYear,
  normalizeMaxVacationDays,
  type ShiftCode,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listAll } from '../db/repository.js';

export async function getUserMaxVacationDays(userId: string): Promise<number> {
  const users = await listAll<User>(DB_NAMES.users);
  const user = users.find((entry) => entry.id === userId);
  return normalizeMaxVacationDays(user?.maxVacationDays);
}

export function buildEntriesMapForUser(
  all: UserScheduleEntry[],
  userId: string,
): Map<string, ShiftCode> {
  const map = new Map<string, ShiftCode>();
  for (const entry of all) {
    if (entry.userId === userId) map.set(entry.date, entry.shift);
  }
  return map;
}

export function validateVacationAssignment(
  entriesByDate: Map<string, ShiftCode>,
  userId: string,
  date: string,
  shift: ShiftCode,
  maxVacationDays: number,
): string | null {
  if (shift !== 'V') return null;

  const existing = entriesByDate.get(date) ?? null;
  const check = canAssignVacationShift(entriesByDate, date, maxVacationDays, existing);
  if (!check.ok) return check.message;

  const year = Number.parseInt(date.slice(0, 4), 10);
  const used = countVacationDaysInYear(entriesByDate, year);
  if (existing !== 'V' && used >= maxVacationDays) {
    return `Límite de vacaciones del año (${maxVacationDays} días).`;
  }

  return null;
}
