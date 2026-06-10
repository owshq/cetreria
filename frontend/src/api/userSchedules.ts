import type { ShiftCode, UserScheduleEntry } from '@shared/types';
import { apiFetch } from './client';

export type ScheduleBulkItem = {
  userId: string;
  date: string;
  shift: ShiftCode | null;
};

export const userSchedulesService = {
  getRange: (from: string, to: string, userId?: string): Promise<UserScheduleEntry[]> => {
    const params = new URLSearchParams({ from, to });
    if (userId) params.set('userId', userId);
    return apiFetch(`/user-schedules?${params}`);
  },

  getWorkspaceRange: (from: string, to: string): Promise<UserScheduleEntry[]> => {
    const params = new URLSearchParams({ from, to });
    return apiFetch(`/user-schedules/workspace?${params}`);
  },

  saveBulk: (entries: ScheduleBulkItem[]): Promise<UserScheduleEntry[]> =>
    apiFetch('/user-schedules/bulk', {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),
};
