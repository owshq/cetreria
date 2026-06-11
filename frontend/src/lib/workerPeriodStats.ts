import type {
  Activity,
  ActivityAssigneeSlot,
  ActivityType,
  CalendarEvent,
  ClientScope,
  Document,
  DocumentConceptSummary,
  UserAssignee,
} from '@shared/types';
import {
  aggregateDeliveryNoteConcepts,
  aggregateInvoiceConcepts,
  documentMetricsForRange,
  findActivityDeliveryNoteForWorker,
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
  resolveWorkerReportHours,
  sumWorkerReportHours,
  SHIFT_CODES,
  SHIFT_META,
  sumDocumentTotalByStatus,
  sumDocumentTotals,
  type ShiftCode,
} from '@shared/types';
import type { TeamShiftBreakdownRow } from '@/lib/reportInstitutionalText';

export type WorkerShiftHours = Partial<Record<ShiftCode, number>>;

export type WorkerPeriodStatsOptions = {
  activityTypes?: readonly ActivityType[];
  workerSignaturesEnabled?: boolean;
  shiftSchedulingEnabled?: boolean;
};

export type WorkerPeriodRow = {
  user: UserAssignee;
  activityCount: number;
  /** Horas principales del periodo (segun modulos activos). */
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
  deliveryNoteCount: number;
  deliveryNoteConceptCount: number;
  deliveryNotesPaidAmount: number;
  deliveryNotesTotalAmount: number;
  topDeliveryNoteConcept: DocumentConceptSummary | null;
  invoiceCount: number;
  invoiceConceptCount: number;
  invoicesPaidAmount: number;
  invoicesTotalAmount: number;
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

/** Horas principales del operario en una actividad (delega en resolveWorkerReportHours). */
export function workerReportHoursOnActivity(
  activity: Activity,
  events: readonly CalendarEvent[],
  userId: string,
  options: WorkerPeriodStatsOptions = {},
): number {
  const event = findEventForActivity(activity, events);
  return resolveWorkerReportHours(activity, event, userId, options).hours;
}

/** @deprecated Usar workerReportHoursOnActivity. */
export const workerEffectiveHoursOnActivity = workerReportHoursOnActivity;

export function sumWorkerHoursForActivities(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  userId: string,
  options: WorkerPeriodStatsOptions = {},
): number {
  return roundHours(sumWorkerReportHours(activities, events, userId, options));
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
      matchesClientScope(document.clientId, clientScope),
  );
}

/** Albaranes del operario en actividades asignadas (incluye legacy sin workerUserId). */
export function workerDeliveryNotesInRange(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  assignees: readonly UserAssignee[],
  userId: string,
  from: string,
  to: string,
  clientScope: ClientScope,
): Document[] {
  const periodActivities = workerActivitiesInRange(
    activities,
    events,
    assignees,
    userId,
    from,
    to,
    clientScope,
  );
  const notes: Document[] = [];
  const seen = new Set<string>();

  for (const activity of periodActivities) {
    const note = findActivityDeliveryNoteForWorker(
      activity.id,
      userId,
      documents,
      activity,
    );
    if (!note || seen.has(note.id)) continue;
    if (!matchesClientScope(note.clientId, clientScope)) continue;
    seen.add(note.id);
    notes.push(note);
  }

  return notes.sort((left, right) => left.date.localeCompare(right.date));
}

/** Facturas vinculadas a actividades del operario en el periodo. */
export function workerInvoicesInRange(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  documents: readonly Document[],
  assignees: readonly UserAssignee[],
  userId: string,
  from: string,
  to: string,
  clientScope: ClientScope,
): Document[] {
  return workerDocumentsInRange(
    activities,
    events,
    documents,
    assignees,
    userId,
    from,
    to,
    clientScope,
  ).filter((document) => document.type === 'invoice');
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
  options: WorkerPeriodStatsOptions = {},
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
  const deliveryNotes = workerDeliveryNotesInRange(
    activities,
    events,
    documents,
    assignees,
    user.id,
    from,
    to,
    clientScope,
  );
  const deliveryNoteConcepts = aggregateDeliveryNoteConcepts(
    deliveryNotes,
    from,
    to,
    'all',
  );
  const invoices = workerInvoicesInRange(
    activities,
    events,
    documents,
    assignees,
    user.id,
    from,
    to,
    clientScope,
  );
  const invoiceConcepts = aggregateInvoiceConcepts(invoices, from, to, 'all');
  const docMetrics = documentMetricsForRange(workerDocuments, from, to, 'all');

  const signatureTotals = {
    assignedHours: 0,
    signedHours: 0,
    signedActivityCount: 0,
    unsignedActivityCount: 0,
  };
  const shiftHours: WorkerShiftHours = {};

  let totalHours = 0;

  for (const activity of periodActivities) {
    const event = findEventForActivity(activity, events);
    totalHours = roundHours(
      totalHours +
        resolveWorkerReportHours(activity, event, user.id, options).hours,
    );

    if (options.workerSignaturesEnabled) {
      accumulateWorkerSignatureStats(activity, event, user.id, signatureTotals);
    }

    if (options.shiftSchedulingEnabled) {
      accumulateWorkerShiftHours(shiftHours, activity, event, user.id);
    }
  }

  const signedHours = options.workerSignaturesEnabled ? signatureTotals.signedHours : 0;
  const assignedHours = options.workerSignaturesEnabled
    ? signatureTotals.assignedHours
    : totalHours;

  return {
    user,
    activityCount: periodActivities.length,
    totalHours,
    assignedHours,
    signedHours,
    pendingHours: options.workerSignaturesEnabled
      ? roundHours(Math.max(0, signatureTotals.assignedHours - signatureTotals.signedHours))
      : 0,
    signedActivityCount: options.workerSignaturesEnabled
      ? signatureTotals.signedActivityCount
      : 0,
    unsignedActivityCount: options.workerSignaturesEnabled
      ? signatureTotals.unsignedActivityCount
      : 0,
    shiftHours,
    documentCount: workerDocuments.length,
    billedAmount: docMetrics.paidAmount,
    conceptCount: invoiceConcepts.length,
    topConcept: invoiceConcepts[0] ?? null,
    deliveryNoteCount: deliveryNotes.length,
    deliveryNoteConceptCount: deliveryNoteConcepts.length,
    deliveryNotesPaidAmount: sumDocumentTotalByStatus(deliveryNotes, 'paid'),
    deliveryNotesTotalAmount: sumDocumentTotals(deliveryNotes),
    topDeliveryNoteConcept: deliveryNoteConcepts[0] ?? null,
    invoiceCount: invoices.length,
    invoiceConceptCount: invoiceConcepts.length,
    invoicesPaidAmount: sumDocumentTotalByStatus(invoices, 'paid'),
    invoicesTotalAmount: sumDocumentTotals(invoices),
  };
}

function accumulateTeamRegisteredHours(
  activity: Activity,
  event: CalendarEvent | null | undefined,
  totals: Pick<TeamPeriodStats, 'assignedHours'>,
  options: WorkerPeriodStatsOptions,
): void {
  const assigneeIds = getActivityAssigneeIds(activity, event);
  for (const userId of assigneeIds) {
    totals.assignedHours = roundHours(
      totals.assignedHours +
        resolveWorkerReportHours(activity, event, userId, options).hours,
    );
  }
}

export function computeTeamPeriodStats(
  activities: readonly Activity[],
  events: readonly CalendarEvent[],
  from: string,
  to: string,
  clientScope: ClientScope,
  options: WorkerPeriodStatsOptions = {},
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

    if (options.workerSignaturesEnabled) {
      accumulateActivitySignatureStats(activity, event, totals);
    } else {
      accumulateTeamRegisteredHours(activity, event, totals, options);
    }

    if (options.shiftSchedulingEnabled) {
      accumulateActivityShiftHours(
        totals.shiftHours,
        totals.signedShiftHours,
        activity,
        event,
      );
    }
  }

  totals.pendingHours = options.workerSignaturesEnabled
    ? roundHours(Math.max(0, totals.assignedHours - totals.signedHours))
    : 0;

  if (!options.workerSignaturesEnabled) {
    totals.signedHours = 0;
    totals.signedActivityCount = 0;
    totals.unsignedActivityCount = 0;
    totals.signedShiftHours = {};
  }

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
  options: WorkerPeriodStatsOptions = {},
): WorkerPeriodRow[] {
  const term = searchTerm.toLowerCase().trim();

  return assignees
    .filter((user) => !term || user.name.toLowerCase().includes(term))
    .map((user) =>
      computeWorkerPeriodRow(
        user,
        activities,
        events,
        documents,
        assignees,
        from,
        to,
        clientScope,
        options,
      ),
    )
    .filter(
      (row) =>
        row.activityCount > 0 ||
        row.documentCount > 0 ||
        row.billedAmount > 0 ||
        row.conceptCount > 0,
    )
    .sort((a, b) => {
      const hoursA = options.workerSignaturesEnabled ? a.assignedHours : a.totalHours;
      const hoursB = options.workerSignaturesEnabled ? b.assignedHours : b.totalHours;
      if (hoursB !== hoursA) return hoursB - hoursA;
      if (b.billedAmount !== a.billedAmount) return b.billedAmount - a.billedAmount;
      if (b.signedHours !== a.signedHours) return b.signedHours - a.signedHours;
      return a.user.name.localeCompare(b.user.name, 'es');
    });
}

export function workerHasPeriodData(row: WorkerPeriodRow): boolean {
  return row.activityCount > 0 || row.documentCount > 0;
}

export function workerPeriodDisplayHours(
  row: Pick<WorkerPeriodRow, 'totalHours' | 'assignedHours'>,
  workerSignaturesEnabled: boolean,
): number {
  return workerSignaturesEnabled ? row.assignedHours : row.totalHours;
}
