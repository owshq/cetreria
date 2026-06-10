import type { WorkspaceScheduleHoliday } from '@shared/types';
import { apiFetch } from './client';

export type HolidayBulkItem = {
  date: string;
  active: boolean;
};

export const scheduleHolidaysService = {
  getRange: (from: string, to: string): Promise<WorkspaceScheduleHoliday[]> => {
    const params = new URLSearchParams({ from, to });
    return apiFetch(`/schedule-holidays?${params}`);
  },

  saveBulk: (dates: HolidayBulkItem[]): Promise<WorkspaceScheduleHoliday[]> =>
    apiFetch('/schedule-holidays/bulk', {
      method: 'PUT',
      body: JSON.stringify({ dates }),
    }),
};
