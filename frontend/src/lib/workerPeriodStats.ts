import type {
  Activity,
  ActivityAssigneeSlot,
  CalendarEvent,
  ClientScope,
  Document,
  DocumentConceptSummary,
  UserAssignee,
} from '@shared/types';
import {
  aggregateInvoiceConcepts,
  documentMetricsForRange,
  findEventForActivity,
  getActivityAssigneeIds,
  getWorkerHoursStatus,
  hoursForAssigneeSlot,
  hoursForWorkerOnActivity,
  isDateInRange,
  isShiftCode,
  isUserAssignedToActivity,
  matchesClientScope,
  normalizeActivityAssigneeSlots,
  SHIFT_CODES,
  SHIFT_META,
  type ShiftCode,
} from '@shared/types';
import type { TeamShiftBreakdownRow } from '@/lib/reportInstitutionalText';

export type WorkerShiftHours = Partial<Record<ShiftCode, number>>;

export type WorkerPeriodRow = {
  user: UserAssignee;
  activityCount: number;
  /** Horas firmadas del operario en el periodo. */
  totalHours: number;
  assignedHours: number;
  signedHours: number;
  pendingHours: number;
  signedActivityCount: number;
  unsignedActivityCount: number;
  shiftHours: WorkerShiftHours;
  documentCount: number;
  billedAmount: number;
  conceptCount: number;
  topConcept: DocumentConceptSummary | null;
};

export type TeamPeriodStats = {
  activityCount: number;
  assignedHours: number;
  signedHours: number;
  pendingHours: number;
  signedActivityCount: number;
  unsignedActivityCount: number;
  shiftHours: WorkerShiftHours;
  signedShiftHours: WorkerShiftHours;
};

function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10;
}

function slotAssignedHours(
  activity: Activity,
  slot: ActivityAssigneeSlot,
  slots: ActivityAssigneeSlot[],
): number {
  const slotHours = hoursForAssigneeSlot(slot);
  if (slotHours <= 0) return 0;

  const totalSlotHours = slots.reduce((sum, entry) => sum + hoursForAssigneeSlot(entry), 0);
  const activityHours = activity.hours ?? 0;
  if (activityHours <= 0 || totalSlotHours <= activityHours + 0.001) {
    return slotHours;
  }

  return roundHours((activityHours * slotHours) / totalSlotHours);
}

function accumulateWorkerShiftHours(
  shiftHours: WorkerShiftHours,
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
): void {
  const slots = normalizeActivityAssigneeSlots(activity, event);
  for (const slot of slots) {
    if (slot.userId !== userId || !isShiftCode(slot.shift)) continue;
    const hours = slotAssignedHours(activity, slot, slots);
    if (hours <= 0) continue;
    shiftHours[slot.shift] = roundHours((shiftHours[slot.shift] ?? 0) + hours);
  }
}

function signedHoursForSlot(
  activity: Activity,
  slot: ActivityAssigneeSlot,
  slots: ActivityAssigneeSlot[],
): number {
  const signature = slot.workerSignature;
  if (signature?.imageDataUrl?.trim()) {
    if (typeof signature.hours === 'number' && signature.hours > 0) {
      return signature.hours;
    }
    const slotHours = hoursForAssigneeSlot(slot);
    return slotHours > 0 ? slotHours : 0;
  }

  const legacy = activity.workerSignature;
  if (!legacy?.imageDataUrl?.trim() || legacy.userId !== slot.userId) return 0;

  const userSlots = slots.filter((entry) => entry.userId === slot.userId);
  const anySlotSigned = userSlots.some((entry) =>
    Boolean(entry.workerSignature?.imageDataUrl?.trim()),
  );
  if (anySlotSigned) return 0;

  if (userSlots.length <= 1) {
    const fallback = slotAssignedHours(activity, slot, slots);
    if (typeof legacy.hours === 'number' && legacy.hours > 0) return legacy.hours;
    return fallback > 0 ? fallback : 0;
  }

  return 0;
}

function accumulateActivityShiftHours(
  assignedHours: WorkerShiftHours,
  signedHours: WorkerShiftHours,
  activity: Activity,
  event: CalendarEvent | null | undefined,
): void {
  const slots = normalizeActivityAssigneeSlots(activity, event);
  for (const slot of slots) {
    if (!isShiftCode(slot.shift)) continue;
    const assigned = slotAssignedHours(activity, slot, slots);
    if (assigned <= 0) continue;
    assignedHours[slot.shift] = roundHours((assignedHours[slot.shift] ?? 0) + assigned);

    const signed = signedHoursForSlot(activity, slot, slots);
    if (signed > 0) {
      signedHours[slot.shift] = roundHours((signedHours[slot.shift] ?? 0) + signed);
    }
  }
}

function accumulateWorkerSignatureStats(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  userId: string,
  totals: Pick<
    WorkerPeriodRow,
    'assignedHours' | 'signedHours' | 'signedActivityCount' | 'unsignedActivityCount'
  >,
): void {
  const status = getWorkerHoursStatus(activity, event, userId);
  if (status.assignedHours <= 0) return;

  totals.assignedHours = roundHours(totals.assignedHours + status.assignedHours);
  totals.signedHours = roundHours(totals.signedHours + status.signedHours);

  if (status.isSigned) {
    totals.signedActivityCount += 1;
  } else {
    totals.unsignedActivityCount += 1;
  }
}

function accumulateActivitySignatureStats(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  totals: Pick<TeamPeriodStats, 'assignedHours' | 'signedHours' | 'signedActivityCount' | 'unsignedActivityCount'>,
): void {
  const assigneeIds = getActivityAssigneeIds(activity, event);
  if (assigneeIds.length === 0) return;

  const statuses = assigneeIds.map((userId) => getWorkerHoursStatus(activity, event, userId));
  const assigned = roundHours(
    statuses.reduce((sum, status) => sum + status.assignedHours, 0),
  );
  const signed = roundHours(statuses.reduce((sum, status) => sum + status.signedHours, 0));

  if (assigned <= 0) return;

  totals.assignedHours = roundHours(totals.assignedHours + assigned);
  totals.signedHours = roundHours(totals.signedHours + signed);

  const hasPending = statuses.some(
    (status) => status.assignedHours > 0 && status.needsSignature,
  );
  if (hasPending) {
    totals.unsignedActivityCount += 1;
  } else {
    totals.signedActivityCount += 1;
  }
}

export function workerHoursOnActivity(
  activity: Activity,
  events: readonly CalendarEvent[],
  userId: string,
): number {
  const event = findEventForActivity(activity, [...events]);
  return hoursForWorkerOnActivity(activity, event, userId);
}

export function sumWorkerHoursForActivities(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  userId: string,
): number {
  return activities.reduce(
    (sum, activity) => sum + workerHoursOnActivity(activity, events, userId),
    0,
  );
}

export function workerActivitiesInRange(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  _assignees: readonly UserAssignee[],
  userId: string,
  from: string,
  to: string,
  clientScope: ClientScope,
): Activity[] {
  const eventsList = [...events];
  return activities.filter((activity) => {
    if (!isDateInRange(activity.date, from, to)) return false;
    if (!matchesClientScope(activity.clientId, clientScope)) return false;
    return isUserAssignedToActivity(activity, eventsList, userId);
  });
}

export function activitiesInRange(
  activities: readonly Activity[],
  from: string,
  to: string,
  clientScope: ClientScope,
): Activity[] {
  return activities.filter(
    (activity) =>
      isDateInRange(activity.date, from, to) &&
      matchesClientScope(activity.clientId, clientScope),
  );
}

export function workerDocumentsInRange(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  assignees: readonly UserAssignee[],
  userId: string,
  from: string,
  to: string,
  clientScope: ClientScope,
): Document[] {
  const activityIds = new Set(
    workerActivitiesInRange(activities, events, assignees, userId, from, to, clientScope).map(
      (activity) => activity.id,
    ),
  );

  return documents.filter(
    (document) =>
      Boolean(document.activityId) &&
      activityIds.has(document.activityId!) &&
      isDateInRange(document.date, from, to) &&
      matchesClientScope(document.clientId, clientScope),
  );
}

export function workerInvoiceConceptsInRange(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  assignees: readonly UserAssignee[],
  userId: string,
  from: string,
  to: string,
  clientScope: ClientScope,
): DocumentConceptSummary[] {
  const workerDocuments = workerDocumentsInRange(
    activities,
    events,
    documents,
    assignees,
    userId,
    from,
    to,
    clientScope,
  );
  return aggregateInvoiceConcepts(workerDocuments, from, to, 'all');
}

export function computeWorkerPeriodRow(
  user: UserAssignee,
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  assignees: readonly UserAssignee[],
  from: string,
  to: string,
  clientScope: ClientScope,
): WorkerPeriodRow {
  const periodActivities = workerActivitiesInRange(
    activities,
    events,
    assignees,
    user.id,
    from,
    to,
    clientScope,
  );
  const workerDocuments = workerDocumentsInRange(
    activities,
    events,
    documents,
    assignees,
    user.id,
    from,
    to,
    clientScope,
  );
  const concepts = workerInvoiceConceptsInRange(
    activities,
    events,
    documents,
    assignees,
    user.id,
    from,
    to,
    clientScope,
  );
  const docMetrics = documentMetricsForRange(workerDocuments, from, to, 'all');

  const signatureTotals = {
    assignedHours: 0,
    signedHours: 0,
    signedActivityCount: 0,
    unsignedActivityCount: 0,
  };
  const shiftHours: WorkerShiftHours = {};

  for (const activity of periodActivities) {
    const event = findEventForActivity(activity, events);
    accumulateWorkerSignatureStats(activity, event, user.id, signatureTotals);
    accumulateWorkerShiftHours(shiftHours, activity, event, user.id);
  }

  const signedHours = signatureTotals.signedHours;
  const assignedHours = signatureTotals.assignedHours;

  return {
    user,
    activityCount: periodActivities.length,
    totalHours: signedHours,
    assignedHours,
    signedHours,
    pendingHours: roundHours(Math.max(0, assignedHours - signedHours)),
    signedActivityCount: signatureTotals.signedActivityCount,
    unsignedActivityCount: signatureTotals.unsignedActivityCount,
    shiftHours,
    documentCount: workerDocuments.length,
    billedAmount: docMetrics.paidAmount,
    conceptCount: concepts.length,
    topConcept: concepts[0] ?? null,
  };
}

export function computeTeamPeriodStats(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  from: string,
  to: string,
  clientScope: ClientScope,
): TeamPeriodStats {
  const periodActivities = activitiesInRange(activities, from, to, clientScope);
  const totals: TeamPeriodStats = {
    activityCount: periodActivities.length,
    assignedHours: 0,
    signedHours: 0,
    pendingHours: 0,
    signedActivityCount: 0,
    unsignedActivityCount: 0,
    shiftHours: {},
    signedShiftHours: {},
  };

  for (const activity of periodActivities) {
    const event = findEventForActivity(activity, events);
    accumulateActivitySignatureStats(activity, event, totals);
    accumulateActivityShiftHours(totals.shiftHours, totals.signedShiftHours, activity, event);
  }

  totals.pendingHours = roundHours(Math.max(0, totals.assignedHours - totals.signedHours));
  return totals;
}

export function buildTeamShiftBreakdown(stats: TeamPeriodStats): TeamShiftBreakdownRow[] {
  return SHIFT_CODES.map((code) => ({
    shiftLabel: SHIFT_META[code].label,
    assignedHours: stats.shiftHours[code] ?? 0,
    signedHours: stats.signedShiftHours[code] ?? 0,
  }))
    .filter((row) => row.assignedHours > 0)
    .sort((a, b) => b.assignedHours - a.assignedHours);
}

export function formatWorkerShiftSummary(shiftHours: WorkerShiftHours): string {
  const parts = SHIFT_CODES.map((code) => {
    const hours = shiftHours[code];
    if (!hours || hours <= 0) return null;
    return `${code} ${hours}h`;
  }).filter((part): part is string => part != null);

  return parts.length > 0 ? parts.join(' · ') : '';
}

export function buildWorkerPeriodRows(
  assignees: readonly UserAssignee[],
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  from: string,
  to: string,
  clientScope: ClientScope,
  searchTerm = '',
): WorkerPeriodRow[] {
  const term = searchTerm.toLowerCase().trim();

  return assignees
    .filter((user) => !term || user.name.toLowerCase().includes(term))
    .map((user) =>
      computeWorkerPeriodRow(user, activities, events, documents, assignees, from, to, clientScope),
    )
    .filter(
      (row) =>
        row.activityCount > 0 ||
        row.documentCount > 0 ||
        row.billedAmount > 0 ||
        row.conceptCount > 0,
    )
    .sort((a, b) => {
      if (b.assignedHours !== a.assignedHours) return b.assignedHours - a.assignedHours;
      if (b.billedAmount !== a.billedAmount) return b.billedAmount - a.billedAmount;
      if (b.signedHours !== a.signedHours) return b.signedHours - a.signedHours;
      return a.user.name.localeCompare(b.user.name, 'es');
    });
}

export function workerHasPeriodData(row: WorkerPeriodRow): boolean {
  return row.activityCount > 0 || row.documentCount > 0;
}
