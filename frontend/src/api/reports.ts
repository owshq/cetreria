import type { Activity, Client, MonthlyReport, ReportKind } from '@shared/types';
import { apiFetch } from './client';

export type ReportSummary = {
  client: Client | undefined;
  activities: Activity[];
  totalHours: number;
};

export type SaveReportPayload = {
  from: string;
  to: string;
  clientIds?: string | string[];
  reportKind?: ReportKind;
  workerUserId?: string;
  reportLabel?: string;
  pdfSnapshot?: Record<string, unknown>;
};

function buildReportsQuery(from: string, to: string, clientIds: string[] = []): string {
  const params = new URLSearchParams({
    from,
    to,
  });
  if (clientIds.length > 0) {
    params.set('clientIds', clientIds.join(','));
  }
  return params.toString();
}

function normalizeClientIds(clientIds?: string | string[]): string[] | undefined {
  if (typeof clientIds === 'string') {
    return clientIds === 'all' ? undefined : [clientIds];
  }
  return clientIds?.length ? clientIds : undefined;
}

export const reportsService = {
  getPeriodSummary: (from: string, to: string, clientIds: string[] = []): Promise<ReportSummary[]> =>
    apiFetch(`/reports?${buildReportsQuery(from, to, clientIds)}`),

  getAll: (): Promise<MonthlyReport[]> => apiFetch('/reports'),

  getById: (id: string): Promise<MonthlyReport> => apiFetch(`/reports/${id}`),

  savePeriod: (payload: SaveReportPayload): Promise<MonthlyReport> => {
    const ids = normalizeClientIds(payload.clientIds);

    return apiFetch('/reports', {
      method: 'POST',
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        clientIds: ids,
        reportKind: payload.reportKind,
        workerUserId: payload.workerUserId,
        reportLabel: payload.reportLabel,
        pdfSnapshot: payload.pdfSnapshot,
      }),
    });
  },

  delete: (id: string): Promise<void> =>
    apiFetch(`/reports/${id}`, { method: 'DELETE' }),
};
