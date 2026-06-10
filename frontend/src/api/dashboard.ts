import { apiFetch } from './client';

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  newClientsInPeriod: number;
  periodActivities: number;
  activitiesChangePercent: number | null;
  periodHours: number;
  hoursChangePercent: number | null;
  pendingDocuments: number;
  periodDocuments: number;
  pendingDocumentsPercent: number | null;
  paidDocuments: number;
  sentDocuments: number;
  draftDocuments: number;
  periodDocumentsAmount: number;
  paidDocumentsAmount: number;
  sentDocumentsAmount: number;
  draftDocumentsAmount: number;
  pendingDocumentsAmount: number;
}

export const dashboardService = {
  getStats: (from: string, to: string): Promise<DashboardStats> =>
    apiFetch(`/dashboard/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};
