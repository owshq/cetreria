import type {
  Activity,
  ActivityType,
  CalendarEvent,
  Client,
  Document,
  UserAssignee,
} from '@shared/types';
import {
  getActivityAssigneeIds,
  getActivityTypeLabel,
  hoursForWorkerOnActivity,
  isDateInRange,
} from '@shared/types';
import { findEventForActivity } from '@/lib/activityUtils';
import { applyChartPalette, getEffectiveChartAccent } from '@/lib/chartColorPalette';
import { CLIENT_STATUS_LABELS } from '@/lib/clientStatus';
import {
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
} from '@/lib/documentStatus';
import type {
  DashboardMetricKey,
  MetricChartDocumentScope,
  MetricChartField,
  MetricChartOrientation,
  MetricDimension,
  MetricMeasure,
} from '@/lib/metricChartConfig';
import { resolveMetricChartAxes } from '@/lib/metricChartConfig';
import { truncateLabel } from '@/components/clientCharts/utils';
import { formatDocumentAmount } from '@shared/types';
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { es } from 'date-fns/locale';

export type MetricChartDatum = {
  id: string;
  label: string;
  shortName: string;
  value: number;
  color: string;
  percent: number;
  /** Línea secundaria (p. ej. estado del documento). */
  detail?: string;
};

export type MetricChartValueFormat = MetricMeasure;

export type MetricChartBuildResult = {
  data: MetricChartDatum[];
  chartType: 'line' | 'bar';
  valueFormat: MetricChartValueFormat;
  orientation: MetricChartOrientation;
};

type TimeBucket = {
  key: string;
  endDate: string;
  label: string;
  shortName: string;
  matches: (date: string) => boolean;
};

type ChartContext = {
  metric: DashboardMetricKey;
  measure: MetricMeasure;
  dimension: MetricDimension;
  periodActivities: Activity[];
  periodDocuments: Document[];
  events: CalendarEvent[];
  assigneesById: Map<string, UserAssignee>;
  clients: Client[];
  clientsMap: Map<string, Client>;
  documentsMap: Map<string, Document>;
  activityTypes: ActivityType[];
  from: string;
  to: string;
};

function assigneeIdsForActivity(activity: Activity, ctx: ChartContext): string[] {
  const event = findEventForActivity(activity, ctx.events);
  return getActivityAssigneeIds(activity, event).filter((userId) =>
    ctx.assigneesById.has(userId),
  );
}

function buildTimeBuckets(from: string, to: string): TimeBucket[] {
  const start = parseISO(from);
  const end = parseISO(to);
  if (start > end) return [];

  const dayCount = differenceInCalendarDays(end, start) + 1;

  if (dayCount <= 7) {
    return eachDayOfInterval({ start, end }).map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      return {
        key,
        endDate: key,
        label: format(day, "d MMM yyyy", { locale: es }),
        shortName: format(day, 'd MMM', { locale: es }),
        matches: (date) => date.slice(0, 10) === key,
      };
    });
  }

  if (dayCount > 90) {
    return eachMonthOfInterval({ start, end }).map((month) => {
      const monthStart = start > startOfMonth(month) ? start : startOfMonth(month);
      const monthEnd = end < endOfMonth(month) ? end : endOfMonth(month);
      const key = format(month, 'yyyy-MM');
      return {
        key,
        endDate: format(monthEnd, 'yyyy-MM-dd'),
        label: format(month, 'MMMM yyyy', { locale: es }),
        shortName: format(month, 'MMM', { locale: es }),
        matches: (date) => {
          const parsed = parseISO(date.slice(0, 10));
          return parsed >= monthStart && parsed <= monthEnd;
        },
      };
    });
  }

  const buckets: TimeBucket[] = [];
  let cursor = startOfWeek(start, { weekStartsOn: 1 });
  while (cursor <= end) {
    const weekStart = cursor;
    const weekEnd = addDays(cursor, 6);
    const key = format(weekStart, 'yyyy-MM-dd');
    const weekEndDate = weekEnd > end ? end : weekEnd;
    buckets.push({
      key,
      endDate: format(weekEndDate, 'yyyy-MM-dd'),
      label: `${format(weekStart, 'd MMM', { locale: es })} – ${format(
        weekEndDate,
        'd MMM',
        { locale: es },
      )}`,
      shortName: format(weekStart, 'd MMM', { locale: es }),
      matches: (date) => {
        const parsed = parseISO(date.slice(0, 10));
        return parsed >= weekStart && parsed <= weekEndDate;
      },
    });
    cursor = addDays(cursor, 7);
  }
  return buckets;
}

function toSeries(entries: Array<{ id: string; label: string; value: number }>): MetricChartDatum[] {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return applyChartPalette(
    entries
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        shortName: truncateLabel(entry.label),
        value: entry.value,
        color: '#a3a3a3',
        percent: total > 0 ? Math.round((entry.value / total) * 100) : 0,
      })),
  );
}

function toDocumentSeries(
  entries: Array<{
    id: string;
    label: string;
    value: number;
    status: Document['status'];
  }>,
): MetricChartDatum[] {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return entries
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((entry) => {
      const statusLabel = DOCUMENT_STATUS_LABELS[entry.status];
      return {
        id: entry.id,
        label: entry.label,
        shortName: truncateLabel(entry.label),
        detail: statusLabel,
        value: entry.value,
        color: DOCUMENT_STATUS_DOT[entry.status],
        percent: total > 0 ? Math.round((entry.value / total) * 100) : 0,
      };
    });
}

function buildTimeSeries(
  buckets: TimeBucket[],
  valuesByBucket: Map<string, number>,
): MetricChartDatum[] {
  const total = buckets.reduce((sum, bucket) => sum + (valuesByBucket.get(bucket.key) ?? 0), 0);
  const lineColor = getEffectiveChartAccent();

  return buckets.map((bucket) => ({
    id: bucket.key,
    label: bucket.label,
    shortName: bucket.shortName,
    value: valuesByBucket.get(bucket.key) ?? 0,
    color: lineColor,
    percent: total > 0 ? Math.round(((valuesByBucket.get(bucket.key) ?? 0) / total) * 100) : 0,
  }));
}

function documentAmount(document: Document): number {
  return document.total;
}

function activityDocumentStatus(activity: Activity, documents: Document[]): string {
  const linked = documents.find((document) => document.activityId === activity.id);
  return linked?.status ?? 'none';
}

function activityDocumentStatusLabel(status: string): string {
  if (status === 'none') return 'Sin documento';
  return DOCUMENT_STATUS_LABELS[status as Document['status']] ?? status;
}

function documentLabel(document: Document): string {
  const typeLabel = document.type === 'invoice' ? 'Factura' : 'Albarán';
  return `${typeLabel} ${document.number}`;
}

function accumulateTime(ctx: ChartContext): MetricChartBuildResult {
  const buckets = buildTimeBuckets(ctx.from, ctx.to);
  const totals = new Map(buckets.map((bucket) => [bucket.key, 0]));

  if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      const bucket = buckets.find((entry) => entry.matches(activity.date));
      if (!bucket) continue;
      totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + activity.hours);
    }
  } else if (ctx.measure === 'count') {
    if (ctx.metric === 'clients') {
      for (const bucket of buckets) {
        const total = ctx.clients.filter(
          (client) => client.createdAt.slice(0, 10) <= bucket.endDate,
        ).length;
        totals.set(bucket.key, total);
      }
    } else if (ctx.metric === 'documents') {
      for (const document of ctx.periodDocuments) {
        const bucket = buckets.find((entry) => entry.matches(document.date));
        if (!bucket) continue;
        totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + 1);
      }
    } else {
      for (const activity of ctx.periodActivities) {
        const bucket = buckets.find((entry) => entry.matches(activity.date));
        if (!bucket) continue;
        totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + 1);
      }
    }
  } else {
    for (const document of ctx.periodDocuments) {
      const bucket = buckets.find((entry) => entry.matches(document.date));
      if (!bucket) continue;
      totals.set(bucket.key, (totals.get(bucket.key) ?? 0) + documentAmount(document));
    }
  }

  return {
    chartType: buckets.length <= 1 ? 'bar' : 'line',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: buildTimeSeries(buckets, totals),
  };
}

function accumulateByClient(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();

  if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      totals.set(activity.clientId, (totals.get(activity.clientId) ?? 0) + activity.hours);
    }
  } else if (ctx.measure === 'count') {
    if (ctx.metric === 'clients') {
      for (const client of ctx.clients) {
        totals.set(client.id, 1);
      }
    } else if (ctx.metric === 'documents') {
      for (const document of ctx.periodDocuments) {
        totals.set(document.clientId, (totals.get(document.clientId) ?? 0) + 1);
      }
    } else {
      for (const activity of ctx.periodActivities) {
        totals.set(activity.clientId, (totals.get(activity.clientId) ?? 0) + 1);
      }
    }
  } else {
    for (const document of ctx.periodDocuments) {
      totals.set(document.clientId, (totals.get(document.clientId) ?? 0) + documentAmount(document));
    }
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toSeries(
      [...totals.entries()].map(([clientId, value]) => ({
        id: clientId,
        label: ctx.clientsMap.get(clientId)?.name ?? 'Contacto desconocido',
        value,
      })),
    ),
  };
}

function accumulateByActivity(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();

  if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      totals.set(activity.type, (totals.get(activity.type) ?? 0) + activity.hours);
    }
  } else if (ctx.measure === 'count') {
    if (ctx.metric === 'documents') {
      for (const document of ctx.periodDocuments) {
        const typeId = document.activityId
          ? ctx.periodActivities.find((activity) => activity.id === document.activityId)?.type ?? 'none'
          : 'none';
        totals.set(typeId, (totals.get(typeId) ?? 0) + 1);
      }
    } else {
      for (const activity of ctx.periodActivities) {
        totals.set(activity.type, (totals.get(activity.type) ?? 0) + 1);
      }
    }
  } else {
    for (const document of ctx.periodDocuments) {
      if (!document.activityId) continue;
      const typeId =
        ctx.periodActivities.find((activity) => activity.id === document.activityId)?.type ??
        'none';
      totals.set(typeId, (totals.get(typeId) ?? 0) + documentAmount(document));
    }
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toSeries(
      [...totals.entries()].map(([typeId, value]) => ({
        id: typeId,
        label:
          typeId === 'none' ? 'Sin actividad' : getActivityTypeLabel(typeId, ctx.activityTypes),
        value,
      })),
    ),
  };
}

function accumulateByDocument(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();

  for (const document of ctx.periodDocuments) {
    let value = 0;
    if (ctx.measure === 'income') value = documentAmount(document);
    else if (ctx.measure === 'count') value = 1;
    else {
      const linked = ctx.periodActivities.find((activity) => activity.id === document.activityId);
      value = linked?.hours ?? 0;
    }
    totals.set(document.id, (totals.get(document.id) ?? 0) + value);
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toDocumentSeries(
      [...totals.entries()]
        .map(([documentId, value]) => {
          const document = ctx.documentsMap.get(documentId);
          if (!document) return null;
          return {
            id: documentId,
            label: documentLabel(document),
            value,
            status: document.status,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            id: string;
            label: string;
            value: number;
            status: Document['status'];
          } => entry != null,
        ),
    ),
  };
}

function accumulateByClientStatus(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();

  if (ctx.metric === 'clients' && ctx.measure === 'count') {
    for (const client of ctx.clients) {
      totals.set(client.status, (totals.get(client.status) ?? 0) + 1);
    }
  } else if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      const status = ctx.clientsMap.get(activity.clientId)?.status ?? 'inactive';
      totals.set(status, (totals.get(status) ?? 0) + activity.hours);
    }
  } else if (ctx.measure === 'income') {
    for (const document of ctx.periodDocuments) {
      const status = ctx.clientsMap.get(document.clientId)?.status ?? 'inactive';
      totals.set(status, (totals.get(status) ?? 0) + documentAmount(document));
    }
  } else {
    for (const activity of ctx.periodActivities) {
      const status = ctx.clientsMap.get(activity.clientId)?.status ?? 'inactive';
      totals.set(status, (totals.get(status) ?? 0) + 1);
    }
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toSeries(
      [...totals.entries()].map(([status, value]) => ({
        id: status,
        label: CLIENT_STATUS_LABELS[status as Client['status']] ?? status,
        value,
      })),
    ),
  };
}

function accumulateByTeam(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();
  const activityById = new Map(ctx.periodActivities.map((activity) => [activity.id, activity]));

  if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      const event = ctx.events.find((item) => item.activityId === activity.id);
      const targets = assigneeIdsForActivity(activity, ctx);
      if (targets.length === 0) continue;
      for (const userId of targets) {
        const hours = hoursForWorkerOnActivity(activity, event, userId);
        if (hours <= 0) continue;
        totals.set(userId, (totals.get(userId) ?? 0) + hours);
      }
    }
  } else if (ctx.measure === 'count') {
    for (const activity of ctx.periodActivities) {
      const targets = assigneeIdsForActivity(activity, ctx);
      for (const userId of targets) {
        totals.set(userId, (totals.get(userId) ?? 0) + 1);
      }
    }
  } else {
    for (const document of ctx.periodDocuments) {
      if (!document.activityId) continue;
      const activity = activityById.get(document.activityId);
      if (!activity) continue;
      const targets = assigneeIdsForActivity(activity, ctx);
      if (targets.length === 0) continue;
      const share = documentAmount(document) / targets.length;
      for (const userId of targets) {
        totals.set(userId, (totals.get(userId) ?? 0) + share);
      }
    }
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toSeries(
      [...totals.entries()].map(([userId, value]) => ({
        id: userId,
        label: ctx.assigneesById.get(userId)?.name ?? 'Usuario',
        value,
      })),
    ),
  };
}

function accumulateByDocumentStatus(ctx: ChartContext): MetricChartBuildResult {
  const totals = new Map<string, number>();

  if (ctx.measure === 'hours') {
    for (const activity of ctx.periodActivities) {
      const status = activityDocumentStatus(activity, ctx.periodDocuments);
      totals.set(status, (totals.get(status) ?? 0) + activity.hours);
    }
  } else if (ctx.measure === 'count') {
    if (ctx.metric === 'documents' || ctx.metric === 'clients') {
      for (const document of ctx.periodDocuments) {
        totals.set(document.status, (totals.get(document.status) ?? 0) + 1);
      }
    } else {
      for (const activity of ctx.periodActivities) {
        const status = activityDocumentStatus(activity, ctx.periodDocuments);
        totals.set(status, (totals.get(status) ?? 0) + 1);
      }
    }
  } else {
    for (const document of ctx.periodDocuments) {
      totals.set(document.status, (totals.get(document.status) ?? 0) + documentAmount(document));
    }
  }

  return {
    chartType: 'bar',
    valueFormat: ctx.measure,
    orientation: 'vertical',
    data: toSeries(
      [...totals.entries()].map(([status, value]) => ({
        id: status,
        label: activityDocumentStatusLabel(status),
        value,
      })),
    ),
  };
}

type MetricChartDocumentOptions = {
  documentStatuses?: Document['status'][];
  documentScope?: MetricChartDocumentScope;
};

function resolveChartPeriodDocuments(
  documents: Document[],
  periodActivities: Activity[],
  from: string,
  to: string,
  dimension: MetricDimension,
  options?: MetricChartDocumentOptions,
): Document[] {
  const statusFilter = options?.documentStatuses;
  const applyStatusFilter = (list: Document[]) => {
    if (!statusFilter?.length || dimension !== 'document') return list;
    return list.filter((document) => statusFilter.includes(document.status));
  };

  if (options?.documentScope === 'activityLinked') {
    const activityIds = new Set(periodActivities.map((activity) => activity.id));
    return applyStatusFilter(
      documents.filter(
        (document) => document.activityId && activityIds.has(document.activityId),
      ),
    );
  }

  return applyStatusFilter(
    documents.filter((document) => isDateInRange(document.date, from, to)),
  );
}

export function buildMetricChartData(
  metric: DashboardMetricKey,
  xAxis: MetricChartField,
  yAxis: MetricChartField,
  activities: Activity[],
  events: CalendarEvent[],
  assignees: UserAssignee[],
  activityTypes: ActivityType[],
  clients: Client[],
  documents: Document[],
  from: string,
  to: string,
  options?: MetricChartDocumentOptions,
): MetricChartBuildResult {
  const { dimension, measure, orientation } = resolveMetricChartAxes(xAxis, yAxis);
  const periodActivities = activities.filter((activity) =>
    isDateInRange(activity.date, from, to),
  );
  const periodDocuments = resolveChartPeriodDocuments(
    documents,
    periodActivities,
    from,
    to,
    dimension,
    options,
  );
  const ctx: ChartContext = {
    metric,
    measure,
    dimension,
    periodActivities,
    periodDocuments,
    events,
    assigneesById: new Map(assignees.map((user) => [user.id, user])),
    clients,
    clientsMap: new Map(clients.map((client) => [client.id, client])),
    documentsMap: new Map(documents.map((document) => [document.id, document])),
    activityTypes,
    from,
    to,
  };

  let result: MetricChartBuildResult;
  switch (dimension) {
    case 'time':
      result = accumulateTime(ctx);
      break;
    case 'client':
      result = accumulateByClient(ctx);
      break;
    case 'activity':
      result = accumulateByActivity(ctx);
      break;
    case 'team':
      result = accumulateByTeam(ctx);
      break;
    case 'document':
      result = accumulateByDocument(ctx);
      break;
    case 'clientStatus':
      result = accumulateByClientStatus(ctx);
      break;
    case 'documentStatus':
      result = accumulateByDocumentStatus(ctx);
      break;
  }

  if (orientation === 'horizontal' && result.chartType === 'line') {
    result = { ...result, chartType: 'bar' };
  }

  return { ...result, orientation };
}

export function formatMetricChartValue(value: number, formatType: MetricChartValueFormat): string {
  if (formatType === 'hours') {
    return value % 1 === 0 ? `${value}h` : `${value.toFixed(1)}h`;
  }
  if (formatType === 'income') {
    return formatDocumentAmount(value);
  }
  return `${Math.round(value)}`;
}
