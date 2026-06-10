import { Router } from 'express';
import type { Activity, CalendarEvent, Client, Document, MonthlyReport } from '@shared/types';
import { REPORT_KIND_LABELS, normalizeReportKind } from '@shared/types';
import { clientHasPeriodDocuments, getAssignedClientIdsForUser } from '@shared/types';
import { DB_NAMES } from '../config.js';
import {
  deleteDoc,
  getByIdInWorkspace,
  insertDoc,
  listAllInWorkspace,
} from '../db/repository.js';
import { authRequired } from '../middleware/auth.js';
import { workspaceRequired } from '../middleware/workspace.js';
import { notifyReportGenerated } from '../services/notifications.js';
import { filterActivitiesForUser } from '../utils/activityVisibility.js';
import type { AuthUser } from '../middleware/auth.js';

const router = Router();

router.use(authRequired);
router.use(workspaceRequired);

function canAccessSavedReport(report: MonthlyReport, user: AuthUser): boolean {
  if (user.role === 'admin') return true;
  return report.generatedBy === user.id;
}

function assertReportGenerationAllowed(
  user: AuthUser,
  body: {
    reportKind?: string;
    workerUserId?: string;
    clientId?: string;
    clientIds?: string[];
  },
  assignedClientIds: Set<string>,
): string | null {
  if (user.role === 'admin') return null;

  const reportKind = body.reportKind ? normalizeReportKind(body.reportKind) : undefined;
  const workerUserId =
    typeof body.workerUserId === 'string' && body.workerUserId.trim()
      ? body.workerUserId.trim()
      : undefined;
  const clientIds = parseClientIds(body);

  if (
    reportKind === 'general' ||
    reportKind === 'contacts_global' ||
    reportKind === 'workers_global'
  ) {
    return 'Permiso denegado';
  }

  if (workerUserId && workerUserId !== user.id) {
    return 'Permiso denegado';
  }

  if (clientIds?.length) {
    for (const clientId of clientIds) {
      if (!assignedClientIds.has(clientId)) {
        return 'Permiso denegado';
      }
    }
  }

  return null;
}

function parseMonth(month: string) {
  const [year, monthNum] = month.split('-').map(Number);
  return { year, monthNum };
}

function parseClientIds(query: {
  clientId?: unknown;
  clientIds?: unknown;
}): string[] | undefined {
  if (typeof query.clientIds === 'string' && query.clientIds.trim()) {
    return query.clientIds.split(',').map((id) => id.trim()).filter(Boolean);
  }
  if (Array.isArray(query.clientIds)) {
    return query.clientIds
      .flatMap((id) => (typeof id === 'string' ? id.split(',') : []))
      .map((id) => id.trim())
      .filter(Boolean);
  }
  if (typeof query.clientId === 'string' && query.clientId && query.clientId !== 'all') {
    return [query.clientId];
  }
  return undefined;
}

function filterActivitiesByDateRange(
  activities: Activity[],
  from: string,
  to: string,
  clientIds?: string[],
) {
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);

  return activities.filter((activity) => {
    const date = activity.date.slice(0, 10);
    const inRange = date >= fromDate && date <= toDate;
    const matchesClient = !clientIds?.length || clientIds.includes(activity.clientId);
    return inRange && matchesClient;
  });
}

function filterActivitiesForWorker(
  activities: Activity[],
  events: CalendarEvent[],
  workerUserId: string,
  from: string,
  to: string,
  clientIds?: string[],
) {
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);
  const eventsByActivityId = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (event.activityId) eventsByActivityId.set(event.activityId, event);
  }

  return activities.filter((activity) => {
    const date = activity.date.slice(0, 10);
    if (date < fromDate || date > toDate) return false;
    if (clientIds?.length && !clientIds.includes(activity.clientId)) return false;

    const event = eventsByActivityId.get(activity.id);
    const fromEvent = (event?.assignedTo ?? []).includes(workerUserId);
    const fromSlots = (activity.assigneeSlots ?? []).some((slot) => slot.userId === workerUserId);
    return fromEvent || fromSlots || activity.userId === workerUserId;
  });
}

function pickReportClientId(activities: Activity[], clients: Client[]): string | null {
  if (activities.length > 0) return activities[0]!.clientId;
  if (clients.length > 0) return clients[0]!.id;
  return null;
}

function resolveDateRange(query: { month?: unknown; from?: unknown; to?: unknown }) {
  if (typeof query.from === 'string' && typeof query.to === 'string') {
    return { from: query.from, to: query.to };
  }
  if (typeof query.month === 'string') {
    const { year, monthNum } = parseMonth(query.month);
    const from = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const end = new Date(year, monthNum, 0);
    const to = `${year}-${String(monthNum).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    return { from, to };
  }
  return null;
}

router.get('/', async (req, res) => {
  const { month, from, to, clientId, clientIds } = req.query;
  const range = resolveDateRange({ month, from, to });
  const workspaceId = req.workspaceId!;

  if (range) {
    const [activities, events] = await Promise.all([
      listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
      listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
    ]);
    const visibleActivities = filterActivitiesForUser(activities, events, req.user!);
    const filtered = filterActivitiesByDateRange(
      visibleActivities,
      range.from,
      range.to,
      parseClientIds({ clientId, clientIds }),
    );

    const clients = await listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId);
    const clientsMap = new Map(clients.map((c) => [c.id, c]));

    const grouped = new Map<
      string,
      { client: Client | undefined; activities: Activity[]; totalHours: number }
    >();

    filtered.forEach((activity) => {
      if (!grouped.has(activity.clientId)) {
        grouped.set(activity.clientId, {
          client: clientsMap.get(activity.clientId),
          activities: [],
          totalHours: 0,
        });
      }
      const entry = grouped.get(activity.clientId)!;
      entry.activities.push(activity);
      entry.totalHours += activity.hours;
    });

    res.json(Array.from(grouped.values()));
    return;
  }

  const reports = await listAllInWorkspace<MonthlyReport>(DB_NAMES.reports, workspaceId);

  if (req.user!.role === 'admin') {
    res.json(reports);
    return;
  }

  res.json(reports.filter((report) => canAccessSavedReport(report, req.user!)));
});

router.get('/:id', async (req, res) => {
  const report = await getByIdInWorkspace<MonthlyReport>(
    DB_NAMES.reports,
    req.params.id,
    req.workspaceId!,
  );
  if (!report) {
    res.status(404).json({ error: 'Informe no encontrado' });
    return;
  }

  if (!canAccessSavedReport(report, req.user!)) {
    res.status(403).json({ error: 'Permiso denegado' });
    return;
  }

  res.json(report);
});

router.post('/', async (req, res) => {
  const body = req.body as {
    month?: string;
    from?: string;
    to?: string;
    clientId?: string;
    clientIds?: string[];
    reportKind?: string;
    workerUserId?: string;
    reportLabel?: string;
    pdfSnapshot?: Record<string, unknown>;
  };
  const range = resolveDateRange(body);
  if (!range) {
    res.status(400).json({ error: 'Rango de fechas requerido' });
    return;
  }

  const workspaceId = req.workspaceId!;
  const { from, to } = range;
  const clientIds = parseClientIds(body);
  const monthKey = from.slice(0, 7);
  const reportKind = body.reportKind ? normalizeReportKind(body.reportKind) : undefined;
  const workerUserId =
    typeof body.workerUserId === 'string' && body.workerUserId.trim()
      ? body.workerUserId.trim()
      : undefined;

  const [activities, events, documents, clients] = await Promise.all([
    listAllInWorkspace<Activity>(DB_NAMES.activities, workspaceId),
    listAllInWorkspace<CalendarEvent>(DB_NAMES.events, workspaceId),
    listAllInWorkspace<Document>(DB_NAMES.documents, workspaceId),
    listAllInWorkspace<Client>(DB_NAMES.clients, workspaceId),
  ]);
  const visibleActivities = filterActivitiesForUser(activities, events, req.user!);
  const assignedClientIds = new Set(
    getAssignedClientIdsForUser(visibleActivities, events, req.user!.id),
  );
  const accessError = assertReportGenerationAllowed(req.user!, body, assignedClientIds);
  if (accessError) {
    res.status(403).json({ error: accessError });
    return;
  }

  const filtered = workerUserId
    ? filterActivitiesForWorker(visibleActivities, events, workerUserId, from, to, clientIds)
    : filterActivitiesByDateRange(visibleActivities, from, to, clientIds);

  if (body.pdfSnapshot && typeof body.pdfSnapshot === 'object') {
    const clientId = pickReportClientId(filtered, clients);
    if (!clientId) {
      res.status(400).json({ error: 'No hay datos en el periodo para generar el informe.' });
      return;
    }

    const resolvedKind = reportKind ?? (workerUserId ? 'worker' : 'general');
    const label =
      typeof body.reportLabel === 'string' && body.reportLabel.trim()
        ? body.reportLabel.trim()
        : REPORT_KIND_LABELS[resolvedKind];
    const { year, monthNum } = parseMonth(monthKey);
    const totalHours = filtered.reduce((sum, activity) => sum + activity.hours, 0);
    const report: MonthlyReport = {
      id: crypto.randomUUID(),
      workspaceId,
      clientId,
      month: String(monthNum).padStart(2, '0'),
      year,
      periodFrom: from,
      periodTo: to,
      activities: filtered,
      totalHours,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.id,
      generatedByName: req.user!.name,
      reportKind: resolvedKind,
      workerUserId,
      reportLabel: label,
      pdfSnapshot: body.pdfSnapshot,
    };
    await insertDoc(DB_NAMES.reports, report);
    await notifyReportGenerated(
      workspaceId,
      req.user!,
      report.id,
      label,
      `${report.periodFrom ?? from} – ${report.periodTo ?? to}`,
    );
    res.status(201).json(report);
    return;
  }

  if (clientIds?.length === 1) {
    const clientId = clientIds[0];
    const clientActivities = filtered.filter((a) => a.clientId === clientId);
    const totalHours = clientActivities.reduce((sum, a) => sum + a.hours, 0);
    const { year, monthNum } = parseMonth(monthKey);
    const report: MonthlyReport = {
      id: crypto.randomUUID(),
      workspaceId,
      clientId,
      month: String(monthNum).padStart(2, '0'),
      year,
      periodFrom: from,
      periodTo: to,
      activities: clientActivities,
      totalHours,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.id,
      generatedByName: req.user!.name,
    };
    await insertDoc(DB_NAMES.reports, report);
    const client = await getByIdInWorkspace<Client>(DB_NAMES.clients, clientId, workspaceId);
    await notifyReportGenerated(
      workspaceId,
      req.user!,
      report.id,
      client?.name ?? 'Contacto',
      `${report.periodFrom ?? from} – ${report.periodTo ?? to}`,
    );
    res.status(201).json(report);
    return;
  }

  const created: MonthlyReport[] = [];
  const targetClients = clientIds?.length
    ? clients.filter((client) => clientIds.includes(client.id))
    : clients;

  for (const client of targetClients) {
    const clientActivities = filtered.filter((a) => a.clientId === client.id);
    const hasPeriodData =
      clientActivities.length > 0 ||
      clientHasPeriodDocuments(documents, client.id, from, to);
    if (!hasPeriodData && !clientIds?.length) continue;

    const { year, monthNum } = parseMonth(monthKey);
    const report: MonthlyReport = {
      id: crypto.randomUUID(),
      workspaceId,
      clientId: client.id,
      month: String(monthNum).padStart(2, '0'),
      year,
      periodFrom: from,
      periodTo: to,
      activities: clientActivities,
      totalHours: clientActivities.reduce((sum, a) => sum + a.hours, 0),
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.id,
      generatedByName: req.user!.name,
    };
    await insertDoc(DB_NAMES.reports, report);
    await notifyReportGenerated(
      workspaceId,
      req.user!,
      report.id,
      client.name,
      `${report.periodFrom ?? from} – ${report.periodTo ?? to}`,
    );
    created.push(report);
  }

  res.status(201).json(created);
});

router.delete('/:id', async (req, res) => {
  const existing = await getByIdInWorkspace<MonthlyReport>(
    DB_NAMES.reports,
    req.params.id,
    req.workspaceId!,
  );
  if (!existing) {
    res.status(404).json({ error: 'Informe no encontrado' });
    return;
  }

  const ok = await deleteDoc(DB_NAMES.reports, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Informe no encontrado' });
    return;
  }
  res.status(204).send();
});

export default router;
