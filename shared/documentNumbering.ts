import { format } from 'date-fns';
import type { Document } from './types.js';
import { parseDateSafe } from './dateUtils.js';

export const DOCUMENT_FORMAT_SEPARATOR = '-';

export type DocumentNumberFormatComponentType =
  | 'prefix'
  | 'date'
  | 'year'
  | 'month'
  | 'day'
  | 'counter';

export type DocumentNameFormatComponentType =
  | 'prefix'
  | 'date'
  | 'year'
  | 'month'
  | 'day'
  | 'number'
  | 'client';

export type DocumentFormatComponentType =
  | DocumentNumberFormatComponentType
  | DocumentNameFormatComponentType;

export interface DocumentFormatComponent {
  type: DocumentFormatComponentType;
  /** Texto literal para componentes de tipo `prefix` (Inicial). */
  value?: string;
  /** Dígitos del contador (por defecto 3). */
  padding?: number;
  /** Patrón de fecha para componentes de tipo `date` (por defecto yyyy-MM-dd). */
  datePattern?: string;
}

export interface DocumentTypeFormats {
  number: DocumentFormatComponent[];
  name: DocumentFormatComponent[];
}

export interface WorkspaceDocumentFormats {
  invoice: DocumentTypeFormats;
  'delivery-note': DocumentTypeFormats;
}

export const DOCUMENT_NUMBER_FORMAT_COMPONENT_LABELS: Record<
  DocumentNumberFormatComponentType,
  string
> = {
  prefix: 'Inicial',
  date: 'Fecha',
  year: 'Año',
  month: 'Mes',
  day: 'Día',
  counter: 'Contador',
};

export const DOCUMENT_NAME_FORMAT_COMPONENT_LABELS: Record<
  DocumentNameFormatComponentType,
  string
> = {
  prefix: 'Inicial',
  date: 'Fecha',
  year: 'Año',
  month: 'Mes',
  day: 'Día',
  number: 'Número',
  client: 'Contacto',
};

const DEFAULT_NUMBER_FORMAT: Record<Document['type'], DocumentFormatComponent[]> = {
  invoice: [
    { type: 'prefix', value: 'F' },
    { type: 'year' },
    { type: 'counter', padding: 3 },
  ],
  'delivery-note': [
    { type: 'prefix', value: 'A' },
    { type: 'year' },
    { type: 'counter', padding: 3 },
  ],
};

const DEFAULT_NAME_FORMAT: DocumentFormatComponent[] = [
  { type: 'number' },
  { type: 'client' },
];

export function defaultWorkspaceDocumentFormats(): WorkspaceDocumentFormats {
  return {
    invoice: {
      number: DEFAULT_NUMBER_FORMAT.invoice.map((component) => ({ ...component })),
      name: DEFAULT_NAME_FORMAT.map((component) => ({ ...component })),
    },
    'delivery-note': {
      number: DEFAULT_NUMBER_FORMAT['delivery-note'].map((component) => ({ ...component })),
      name: DEFAULT_NAME_FORMAT.map((component) => ({ ...component })),
    },
  };
}

const NUMBER_COMPONENT_TYPES = new Set<DocumentNumberFormatComponentType>(
  Object.keys(DOCUMENT_NUMBER_FORMAT_COMPONENT_LABELS) as DocumentNumberFormatComponentType[],
);

const NAME_COMPONENT_TYPES = new Set<DocumentNameFormatComponentType>(
  Object.keys(DOCUMENT_NAME_FORMAT_COMPONENT_LABELS) as DocumentNameFormatComponentType[],
);

function normalizeComponentList(
  raw: unknown,
  allowedTypes: Set<DocumentFormatComponentType>,
  fallback: DocumentFormatComponent[],
): DocumentFormatComponent[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback.map((component) => ({ ...component }));
  }

  const normalized = raw
    .map((item): DocumentFormatComponent | null => {
      if (!item || typeof item !== 'object') return null;
      const type = (item as DocumentFormatComponent).type;
      if (!allowedTypes.has(type)) return null;

      const component: DocumentFormatComponent = { type };
      if (type === 'prefix') {
        component.value = String((item as DocumentFormatComponent).value ?? '').trim();
      }
      if (type === 'counter') {
        const padding = Number((item as DocumentFormatComponent).padding);
        component.padding = Number.isFinite(padding) && padding > 0 ? Math.floor(padding) : 3;
      }
      if (type === 'date') {
        const pattern = String((item as DocumentFormatComponent).datePattern ?? '').trim();
        component.datePattern = pattern || 'yyyy-MM-dd';
      }
      return component;
    })
    .filter((item): item is DocumentFormatComponent => item !== null);

  if (normalized.length === 0) {
    return fallback.map((component) => ({ ...component }));
  }

  if (!normalized.some((component) => component.type === 'counter')) {
    const fallbackCounter = fallback.find((component) => component.type === 'counter');
    if (fallbackCounter) {
      normalized.push({ ...fallbackCounter });
    }
  }

  return normalized;
}

export function normalizeWorkspaceDocumentFormats(
  raw: Partial<WorkspaceDocumentFormats> | null | undefined,
): WorkspaceDocumentFormats {
  const defaults = defaultWorkspaceDocumentFormats();

  return {
    invoice: {
      number: normalizeComponentList(raw?.invoice?.number, NUMBER_COMPONENT_TYPES, defaults.invoice.number),
      name: normalizeComponentList(raw?.invoice?.name, NAME_COMPONENT_TYPES, defaults.invoice.name),
    },
    'delivery-note': {
      number: normalizeComponentList(
        raw?.['delivery-note']?.number,
        NUMBER_COMPONENT_TYPES,
        defaults['delivery-note'].number,
      ),
      name: normalizeComponentList(
        raw?.['delivery-note']?.name,
        NAME_COMPONENT_TYPES,
        defaults['delivery-note'].name,
      ),
    },
  };
}

function resolveReferenceDate(dateValue: string | undefined, fallback = new Date()): Date {
  return parseDateSafe(dateValue) ?? fallback;
}

function renderDateComponent(date: Date, pattern: string | undefined): string {
  return format(date, pattern?.trim() || 'yyyy-MM-dd');
}

function renderNumberComponent(
  component: DocumentFormatComponent,
  date: Date,
  counter: number,
): string {
  switch (component.type) {
    case 'prefix':
      return component.value?.trim() ?? '';
    case 'date':
      return renderDateComponent(date, component.datePattern);
    case 'year':
      return format(date, 'yyyy');
    case 'month':
      return format(date, 'MM');
    case 'day':
      return format(date, 'dd');
    case 'counter': {
      const padding = component.padding && component.padding > 0 ? component.padding : 3;
      return String(counter).padStart(padding, '0');
    }
    default:
      return '';
  }
}

export function buildDocumentNumberPreview(
  components: DocumentFormatComponent[],
  options?: {
    date?: string;
    counter?: number;
  },
): string {
  const date = resolveReferenceDate(options?.date);
  const counter = options?.counter ?? 1;
  return components
    .map((component) => renderNumberComponent(component, date, counter))
    .filter((part) => part.length > 0)
    .join(DOCUMENT_FORMAT_SEPARATOR);
}

export function buildDocumentNumber(
  components: DocumentFormatComponent[],
  dateValue: string,
  counter: number,
): string {
  return buildDocumentNumberPreview(components, { date: dateValue, counter });
}

function getCounterScopeKey(
  type: Document['type'],
  components: DocumentFormatComponent[],
  dateValue: string,
): string {
  const date = resolveReferenceDate(dateValue);
  const parts: string[] = [type];

  for (const component of components) {
    if (component.type === 'prefix') {
      parts.push(`prefix:${component.value?.trim() ?? ''}`);
    }
    if (component.type === 'year') {
      parts.push(`year:${format(date, 'yyyy')}`);
    }
    if (component.type === 'month') {
      parts.push(`month:${format(date, 'MM')}`);
    }
    if (component.type === 'day') {
      parts.push(`day:${format(date, 'dd')}`);
    }
  }

  return parts.join('|');
}

export function nextDocumentNumber(
  documents: readonly Document[],
  type: Document['type'],
  components: DocumentFormatComponent[],
  dateValue: string,
): string {
  const scopeKey = getCounterScopeKey(type, components, dateValue);
  const matchingCount = documents.filter((document) => {
    if (document.type !== type) return false;
    return getCounterScopeKey(type, components, document.date) === scopeKey;
  }).length;

  return buildDocumentNumber(components, dateValue, matchingCount + 1);
}

export function getDocumentFormatsForType(
  formats: WorkspaceDocumentFormats | null | undefined,
  type: Document['type'],
): DocumentTypeFormats {
  const normalized = normalizeWorkspaceDocumentFormats(formats ?? undefined);
  return normalized[type];
}

function renderNameComponent(
  component: DocumentFormatComponent,
  date: Date,
  number: string,
  clientName: string,
): string {
  switch (component.type) {
    case 'prefix':
      return component.value?.trim() ?? '';
    case 'date':
      return renderDateComponent(date, component.datePattern);
    case 'year':
      return format(date, 'yyyy');
    case 'month':
      return format(date, 'MM');
    case 'day':
      return format(date, 'dd');
    case 'number':
      return number.trim();
    case 'client':
      return clientName.trim();
    default:
      return '';
  }
}

export function buildDocumentDisplayName(
  components: DocumentFormatComponent[],
  options: {
    number: string;
    clientName: string;
    date?: string;
  },
): string {
  const date = resolveReferenceDate(options.date);
  return components
    .map((component) =>
      renderNameComponent(component, date, options.number, options.clientName),
    )
    .filter((part) => part.length > 0)
    .join(DOCUMENT_FORMAT_SEPARATOR);
}

export function buildDocumentDisplayNameForDocument(
  formats: WorkspaceDocumentFormats | null | undefined,
  document: Pick<Document, 'type' | 'number' | 'date'>,
  clientName: string,
): string {
  const typeFormats = getDocumentFormatsForType(formats, document.type);
  return buildDocumentDisplayName(typeFormats.name, {
    number: document.number,
    clientName,
    date: document.date,
  });
}

export type DocumentDisplayNameMigrationPolicy = 'keep' | 'update';

export function hasDocumentNameFormatChanges(
  before: WorkspaceDocumentFormats,
  after: WorkspaceDocumentFormats,
): boolean {
  return (
    JSON.stringify(before.invoice.name) !== JSON.stringify(after.invoice.name) ||
    JSON.stringify(before['delivery-note'].name) !== JSON.stringify(after['delivery-note'].name)
  );
}

/** Usa el nombre congelado del documento si existe; si no, lo calcula con el formato actual. */
export function resolveDocumentDisplayName(
  document: Pick<Document, 'type' | 'number' | 'date' | 'displayName'>,
  clientName: string,
  formats?: WorkspaceDocumentFormats | null,
): string {
  const frozen = document.displayName?.trim();
  if (frozen) return frozen;
  return buildDocumentDisplayNameForDocument(formats, document, clientName);
}

export function buildDocumentDisplayNamePreview(
  formats: WorkspaceDocumentFormats | null | undefined,
  type: Document['type'],
  options?: {
    clientName?: string;
    date?: string;
    counter?: number;
  },
): string {
  const typeFormats = getDocumentFormatsForType(formats, type);
  const number = buildDocumentNumberPreview(typeFormats.number, {
    date: options?.date,
    counter: options?.counter ?? 1,
  });

  return buildDocumentDisplayName(typeFormats.name, {
    number,
    clientName: options?.clientName?.trim() || 'Nombre del contacto',
    date: options?.date,
  });
}
