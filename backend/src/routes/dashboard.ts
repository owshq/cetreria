import { Router } from 'express';
import type { Activity, CalendarEvent, Client, Document } from '@shared/types';
import {
  filterActivitiesAssignedToUser,
  filterDocumentsForUser,
  getPreviousDateRange,
  getUnpaidDocumentsLinkedToActivities,
  isClientCreatedAtInRange,
  isDateInRange,
  percentChange,
  sumDocumentTotalByStatus,
  sumDocumentTotals,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { listDocumentTypeGroupsForWorkspace } from '../db/documentTypeGroups.js';
import { listAllInWorkspace } from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

router.get('/stats', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;

  if (!from || !to) {
    res.status(400).json({ error: 'Parámetros from y to requeridos (yyyy-MM-dd)' });
    return;
  }

  const workspaceId = req.workspaceId!;
  const isAdmin = req.user!.role === 'admin';
  const [clients, activities, events, documents, documentTypeGroups] = await Promise.all([
    listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
    listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
    listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
    listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    listDocumentTypeGroupsForWorkspace(workspaceId),
  ]);

  const scopedActivities = isAdmin
    ? activities
    : filterActivitiesAssignedToUser(activities, events, req.user!.id);
  const scopedDocuments = isAdmin
    ? documents
    : filterDocumentsForUser(documents, activities, events, req.user!, documentTypeGroups);

  const periodActivities = scopedActivities.filter((a) => isDateInRange(a.date, from, to));
  const periodDocuments = scopedDocuments.filter((d) => isDateInRange(d.date, from, to));
  const periodHours = periodActivities.reduce((sum, a) => sum + a.hours, 0);

  const prev = getPreviousDateRange(from, to);
  const prevActivities = scopedActivities.filter((a) => isDateInRange(a.date, prev.from, prev.to));
  const prevHours = prevActivities.reduce((sum, a) => sum + a.hours, 0);

  const paidDocuments = periodDocuments.filter((d) => d.status === 'paid').length;
  const sentDocuments = periodDocuments.filter((d) => d.status === 'sent').length;
  const draftDocuments = periodDocuments.filter((d) => d.status === 'draft').length;
  const unpaidActivityDocuments = getUnpaidDocumentsLinkedToActivities(
    scopedDocuments,
    periodActivities,
  );
  const pendingDocuments = unpaidActivityDocuments.length;
  const totalDocuments = periodDocuments.length;

  const periodDocumentsAmount = periodDocuments.reduce((sum, doc) => sum + doc.total, 0);
  const paidDocumentsAmount = sumDocumentTotalByStatus(periodDocuments, 'paid');
  const sentDocumentsAmount = sumDocumentTotalByStatus(periodDocuments, 'sent');
  const draftDocumentsAmount = sumDocumentTotalByStatus(periodDocuments, 'draft');
  const pendingDocumentsAmount = sumDocumentTotals(unpaidActivityDocuments);

  res.json({
    totalClients: isAdmin ? clients.length : 0,
    activeClients: isAdmin ? clients.filter((c) => c.status === 'active').length : 0,
    newClientsInPeriod: isAdmin
      ? clients.filter((c) => isClientCreatedAtInRange(c, from, to)).length
      : 0,
    periodActivities: periodActivities.length,
    activitiesChangePercent: percentChange(periodActivities.length, prevActivities.length),
    periodHours,
    hoursChangePercent: percentChange(periodHours, prevHours),
    pendingDocuments,
    periodDocuments: totalDocuments,
    pendingDocumentsPercent:
      totalDocuments > 0 ? Math.round((pendingDocuments / totalDocuments) * 100) : null,
    paidDocuments,
    sentDocuments,
    draftDocuments,
    periodDocumentsAmount,
    paidDocumentsAmount,
    sentDocumentsAmount,
    draftDocumentsAmount,
    pendingDocumentsAmount,
  });
});

export default router;
