import express from 'express';
import cors from 'cors';
import { initJsonDb } from './db/store.js';
import { syncDbFromRemoteBeforeRequest } from './vercel/dbRemoteSync.js';
import authRoutes from './routes/auth.js';
import workspacesRoutes from './routes/workspaces.js';
import usersRoutes from './routes/users.js';
import clientsRoutes from './routes/clients.js';
import activitiesRoutes from './routes/activities.js';
import activityWorkReportRoutes from './routes/activityWorkReport.js';
import activityAttachmentsRoutes from './routes/activityAttachments.js';
import activityTypesRoutes from './routes/activityTypes.js';
import clientGroupsRoutes from './routes/clientGroups.js';
import documentTypeGroupsRoutes from './routes/documentTypeGroups.js';
import invoiceConceptSettingsRoutes from './routes/invoiceConceptSettings.js';
import workspaceBillingSettingsRoutes from './routes/workspaceBillingSettings.js';
import workspaceScheduleSettingsRoutes from './routes/workspaceScheduleSettings.js';
import workspaceFeatureSettingsRoutes from './routes/workspaceFeatureSettings.js';
import workspaceAppearanceSettingsRoutes from './routes/workspaceAppearanceSettings.js';
import publicAppearanceRoutes from './routes/publicAppearance.js';
import eventsRoutes from './routes/events.js';
import documentsRoutes from './routes/documents.js';
import electronicInvoicingRoutes from './routes/electronicInvoicing.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationsRoutes from './routes/notifications.js';
import notificationsWsHttpRoutes from './routes/notificationsWsHttp.js';
import savedTableViewsRoutes from './routes/savedTableViews.js';
import tableViewStateRoutes from './routes/tableViewState.js';
import userInteractionsRoutes from './routes/userInteractions.js';
import userSchedulesRoutes from './routes/userSchedules.js';
import scheduleHolidaysRoutes from './routes/scheduleHolidays.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.use(async (_req, _res, next) => {
    try {
      await syncDbFromRemoteBeforeRequest();
      next();
    } catch (err) {
      console.error('Error al sincronizar db remota', err);
      next(err);
    }
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await initJsonDb();
      res.json({ ok: true, database: 'json' });
    } catch {
      res.status(503).json({ ok: false, database: 'json' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/workspaces', workspacesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/clients', clientsRoutes);
  app.use('/api/client-groups', clientGroupsRoutes);
  app.use('/api/document-type-groups', documentTypeGroupsRoutes);
  app.use('/api/activities', activitiesRoutes);
  app.use('/api/activities/:id/work-report', activityWorkReportRoutes);
  app.use('/api/activities/:id/attachments', activityAttachmentsRoutes);
  app.use('/api/activity-types', activityTypesRoutes);
  app.use('/api/invoice-concept-settings', invoiceConceptSettingsRoutes);
  app.use('/api/workspace-billing-settings', workspaceBillingSettingsRoutes);
  app.use('/api/workspace-schedule-settings', workspaceScheduleSettingsRoutes);
  app.use('/api/workspace-feature-settings', workspaceFeatureSettingsRoutes);
  app.use('/api/workspace-appearance-settings', workspaceAppearanceSettingsRoutes);
  app.use('/api/public', publicAppearanceRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/documents', documentsRoutes);
  app.use('/api/electronic-invoicing', electronicInvoicingRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/ws/notifications', notificationsWsHttpRoutes);
  app.use('/api/saved-table-views', savedTableViewsRoutes);
  app.use('/api/table-view-state', tableViewStateRoutes);
  app.use('/api/user-interactions', userInteractionsRoutes);
  app.use('/api/user-schedules', userSchedulesRoutes);
  app.use('/api/schedule-holidays', scheduleHolidaysRoutes);

  return app;
}
