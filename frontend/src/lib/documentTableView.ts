import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Activity, Client, Document, WorkspaceBillingSettings } from '@shared/types';
import {
  VERIFACTU_INVOICE_KIND_LABELS,
  VERIFACTU_INVOICE_KINDS,
  VERIFACTU_STATUS_LABELS,
  VERIFACTU_STATUSES,
  resolveVerifactuInvoiceKind,
  resolveVerifactuStatus,
} from '@shared/types';
import { isActivitySigned } from '@shared/types';
import {
  DOCUMENT_FORMAT_EMOJI,
  DOCUMENT_FORMAT_LABELS,
  DOCUMENT_TYPE_LABELS,
  getDocumentFormatKey,
} from '@shared/types';
import { ACTIVITY_EMOJI } from '@/lib/activityIcons';
import {
  DOCUMENT_STATUS_CLASS,
  DOCUMENT_STATUS_DOT,
  DOCUMENT_STATUS_LABELS,
} from '@/lib/documentStatus';
import { VERIFACTU_STATUS_CLASS } from '@/lib/verifactuStatus';
import { VERIFACTU_STATUS_DOT } from '@shared/types';
import type { TableViewColumnDef } from '@/lib/tableViews';
import type { DisplayColumnDef } from '@/lib/viewConfig';

export const DOCUMENTS_VIEW_PAGE_KEY = 'documents';

export const VERIFACTU_DOCUMENT_TABLE_COLUMN_IDS = ['verifactuStatus', 'invoiceKind'] as const;

export function filterVerifactuDocumentDisplayColumns(
  columns: DisplayColumnDef[],
  verifactuEnabled: boolean,
): DisplayColumnDef[] {
  if (verifactuEnabled) return columns;
  const hidden = new Set<string>(VERIFACTU_DOCUMENT_TABLE_COLUMN_IDS);
  return columns.filter((column) => !hidden.has(column.id));
}

export function filterVerifactuTableViewColumns<T>(
  columns: TableViewColumnDef<Document, T>[],
  verifactuEnabled: boolean,
): TableViewColumnDef<Document, T>[] {
  if (verifactuEnabled) return columns;
  const hidden = new Set<string>(VERIFACTU_DOCUMENT_TABLE_COLUMN_IDS);
  return columns.filter((column) => !hidden.has(column.id));
}

export const DOCUMENT_DISPLAY_COLUMNS: DisplayColumnDef[] = [
  { id: 'select', label: 'Selección', defaultWidth: 64, minWidth: 64, locked: true },
  { id: 'number', label: 'Número', emoji: '🔢', defaultWidth: 130, minWidth: 100 },
  { id: 'type', label: 'Tipo', emoji: '📄', defaultWidth: 120, minWidth: 90 },
  { id: 'format', label: 'Formato', emoji: '🗂️', defaultWidth: 120, minWidth: 90 },
  { id: 'client', label: 'Contacto', emoji: '👤', defaultWidth: 180, minWidth: 130 },
  { id: 'date', label: 'Fecha', emoji: '📅', defaultWidth: 120, minWidth: 100 },
  { id: 'total', label: 'Total', emoji: '💶', defaultWidth: 110, minWidth: 90, align: 'right' },
  { id: 'activity', label: 'Actividad', emoji: ACTIVITY_EMOJI, defaultWidth: 120, minWidth: 100 },
  { id: 'status', label: 'Estado', emoji: '🏷️', defaultWidth: 130, minWidth: 100 },
  { id: 'verifactuStatus', label: 'Veri*Factu', emoji: '🛡️', defaultWidth: 150, minWidth: 110 },
  { id: 'invoiceKind', label: 'Tipo factura', emoji: '🧾', defaultWidth: 170, minWidth: 120 },
];

export type DocumentTableViewContext = {
  clientsMap: Map<string, Client>;
  activitiesMap: Map<string, Activity>;
  billingSettings?: WorkspaceBillingSettings | null;
};

function getLinkedActivity(
  doc: Document,
  ctx: DocumentTableViewContext,
): Activity | undefined {
  if (!doc.activityId) return undefined;
  return ctx.activitiesMap.get(doc.activityId);
}

function documentHasLinkedActivity(doc: Document): boolean {
  return Boolean(doc.activityId?.trim());
}

function documentLinkedActivityIsSigned(
  doc: Document,
  ctx: DocumentTableViewContext,
): boolean {
  const activity = getLinkedActivity(doc, ctx);
  if (!activity) return false;
  return isActivitySigned(activity, null);
}

export function buildDocumentTableViewColumns(
  clients: Client[],
): TableViewColumnDef<Document, DocumentTableViewContext>[] {
  const clientOptions = [...clients]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((client) => ({
      value: client.id,
      label: client.name,
    }));

  return [
    {
      id: 'number',
      label: 'Número',
      emoji: '🔢',
      valueType: 'text',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => doc.number.trim(),
      getGroupLabel: (key) => key,
      getFilterValue: (doc) => doc.number.trim(),
    },
    {
      id: 'type',
      label: 'Tipo',
      emoji: '📄',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => doc.type,
      getGroupLabel: (key) => DOCUMENT_TYPE_LABELS[key as Document['type']] ?? key,
      getFilterValue: (doc) => doc.type,
      filterOptions: [
        { value: 'invoice', label: 'Factura', emoji: '🧾' },
        { value: 'delivery-note', label: 'Albarán', emoji: '📦' },
      ],
    },
    {
      id: 'format',
      label: 'Formato',
      emoji: '🗂️',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => getDocumentFormatKey(doc),
      getGroupLabel: (key) => DOCUMENT_FORMAT_LABELS[key as keyof typeof DOCUMENT_FORMAT_LABELS] ?? key,
      getFilterValue: (doc) => getDocumentFormatKey(doc),
      filterOptions: [
        { value: 'generated', label: DOCUMENT_FORMAT_LABELS.generated, emoji: DOCUMENT_FORMAT_EMOJI.generated },
        { value: 'uploaded-pdf', label: DOCUMENT_FORMAT_LABELS['uploaded-pdf'], emoji: DOCUMENT_FORMAT_EMOJI['uploaded-pdf'] },
        { value: 'uploaded-image', label: DOCUMENT_FORMAT_LABELS['uploaded-image'], emoji: DOCUMENT_FORMAT_EMOJI['uploaded-image'] },
      ],
    },
    {
      id: 'status',
      label: 'Estado',
      emoji: '🏷️',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => doc.status,
      getGroupLabel: (key) => DOCUMENT_STATUS_LABELS[key as Document['status']] ?? key,
      getFilterValue: (doc) => doc.status,
      filterOptions: [
        {
          value: 'draft',
          label: 'Borrador',
          dotColor: DOCUMENT_STATUS_DOT.draft,
          badgeClassName: DOCUMENT_STATUS_CLASS.draft,
          emoji: '📝',
        },
        {
          value: 'sent',
          label: 'Enviado',
          dotColor: DOCUMENT_STATUS_DOT.sent,
          badgeClassName: DOCUMENT_STATUS_CLASS.sent,
          emoji: '📨',
        },
        {
          value: 'paid',
          label: 'Pagado',
          dotColor: DOCUMENT_STATUS_DOT.paid,
          badgeClassName: DOCUMENT_STATUS_CLASS.paid,
          emoji: '✅',
        },
      ],
    },
    {
      id: 'client',
      label: 'Contacto',
      emoji: '👤',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      boardable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc, ctx) => doc.clientId,
      getGroupLabel: (key, ctx) => ctx.clientsMap.get(key)?.name ?? 'Contacto desconocido',
      getFilterValue: (doc) => doc.clientId,
      filterOptions: clientOptions,
    },
    {
      id: 'date',
      label: 'Fecha',
      emoji: '📅',
      valueType: 'date',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => doc.date,
      getGroupLabel: (key) => format(parseISO(key), 'd MMM yyyy', { locale: es }),
      getFilterValue: (doc) => doc.date,
    },
    {
      id: 'total',
      label: 'Total',
      emoji: '💶',
      valueType: 'number',
      groupable: false,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => String(doc.total),
      getGroupLabel: (key) => `${Number(key).toFixed(2)}€`,
      getFilterValue: (doc) => String(doc.total),
    },
    {
      id: 'month',
      label: 'Mes',
      emoji: '📆',
      valueType: 'text',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: true,
      getGroupKey: (doc) => format(parseISO(doc.date), 'yyyy-MM'),
      getGroupLabel: (key) => {
        const [year, month] = key.split('-').map(Number);
        return format(new Date(year, month - 1, 1), 'MMMM yyyy', { locale: es });
      },
      getFilterValue: (doc) => format(parseISO(doc.date), 'yyyy-MM'),
    },
    {
      id: 'activity',
      label: 'Actividad',
      emoji: ACTIVITY_EMOJI,
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (doc) => (documentHasLinkedActivity(doc) ? 'yes' : 'no'),
      getGroupLabel: (key) => (key === 'yes' ? 'Con actividad' : 'Sin actividad'),
      getFilterValue: (doc) => (documentHasLinkedActivity(doc) ? 'yes' : 'no'),
      filterOptions: [
        { value: 'yes', label: 'Con actividad', emoji: ACTIVITY_EMOJI },
        { value: 'no', label: 'Sin actividad', emoji: '➖' },
      ],
    },
    {
      id: 'signed',
      label: 'Firma',
      emoji: '✍️',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (doc, ctx) =>
        documentLinkedActivityIsSigned(doc, ctx) ? 'yes' : 'no',
      getGroupLabel: (key) => (key === 'yes' ? 'Con firma' : 'Sin firma'),
      getFilterValue: (doc, ctx) =>
        documentLinkedActivityIsSigned(doc, ctx) ? 'yes' : 'no',
      filterOptions: [
        { value: 'yes', label: 'Con firma', emoji: '✅' },
        { value: 'no', label: 'Sin firma', emoji: '❌' },
      ],
    },
    {
      id: 'verifactuStatus',
      label: 'Veri*Factu',
      emoji: '🛡️',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (doc, ctx) => resolveVerifactuStatus(doc, ctx.billingSettings) ?? 'na',
      getGroupLabel: (key) =>
        key === 'na' ? 'No aplica' : VERIFACTU_STATUS_LABELS[key as keyof typeof VERIFACTU_STATUS_LABELS] ?? key,
      getFilterValue: (doc, ctx) => resolveVerifactuStatus(doc, ctx.billingSettings) ?? 'na',
      filterOptions: [
        { value: 'na', label: 'No aplica', emoji: '➖' },
        ...VERIFACTU_STATUSES.map((status) => ({
          value: status,
          label: VERIFACTU_STATUS_LABELS[status],
          dotColor: VERIFACTU_STATUS_DOT[status],
          badgeClassName: VERIFACTU_STATUS_CLASS[status],
          emoji: status === 'aceptado' ? '✅' : status === 'rechazado' ? '❌' : '🛡️',
        })),
      ],
    },
    {
      id: 'invoiceKind',
      label: 'Tipo factura',
      emoji: '🧾',
      valueType: 'enum',
      groupable: true,
      filterable: true,
      sortable: true,
      searchable: false,
      getGroupKey: (doc) =>
        doc.type === 'invoice' ? resolveVerifactuInvoiceKind(doc) : 'na',
      getGroupLabel: (key) =>
        key === 'na'
          ? 'No aplica'
          : VERIFACTU_INVOICE_KIND_LABELS[key as keyof typeof VERIFACTU_INVOICE_KIND_LABELS] ?? key,
      getFilterValue: (doc) =>
        doc.type === 'invoice' ? resolveVerifactuInvoiceKind(doc) : 'na',
      filterOptions: [
        { value: 'na', label: 'No aplica', emoji: '➖' },
        ...VERIFACTU_INVOICE_KINDS.map((kind) => ({
          value: kind,
          label: VERIFACTU_INVOICE_KIND_LABELS[kind],
          emoji: '🧾',
        })),
      ],
    },
  ];
}
