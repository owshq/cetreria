import type { Document } from './types.js';

export type DocumentTemplateId = 'classic' | 'modern' | 'minimal' | 'custom';

export const DEFAULT_DOCUMENT_TEMPLATE_ID: DocumentTemplateId = 'classic';
export const DEFAULT_DOCUMENT_TEMPLATE_COLOR = '#5e6a37';

export const DOCUMENT_TEMPLATE_OPTIONS: {
  id: DocumentTemplateId;
  label: string;
  description: string;
}[] = [
  {
    id: 'classic',
    label: 'Corporativa',
    description: 'Layout oficial con logo, sello ISO y bloque de totales verde',
  },
  {
    id: 'custom',
    label: 'Editar HTML',
    description: 'Parte del HTML corporativo y guarda variantes con nombre',
  },
];

const LEGACY_CORPORATE_TEMPLATE_IDS = new Set<DocumentTemplateId>(['modern', 'minimal']);

export function normalizeDocumentTemplateId(
  value: string | undefined,
): DocumentTemplateId {
  if (!value || !isDocumentTemplateId(value)) return DEFAULT_DOCUMENT_TEMPLATE_ID;
  if (LEGACY_CORPORATE_TEMPLATE_IDS.has(value)) return 'classic';
  return value;
}

export const DOCUMENT_TEMPLATE_COLOR_PRESETS = [
  '#525252',
  '#2563eb',
  '#059669',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777',
];

export type DocumentTemplatePrefs = {
  templateId: DocumentTemplateId;
  templateColor: string;
  /** Plantilla HTML subida por el usuario (solo si templateId === 'custom'). */
  customHtml?: string;
  customHtmlFileName?: string;
};

const TEMPLATE_IDS = new Set<DocumentTemplateId>(
  DOCUMENT_TEMPLATE_OPTIONS.map((option) => option.id),
);

export function isDocumentTemplateId(value: string): value is DocumentTemplateId {
  return TEMPLATE_IDS.has(value as DocumentTemplateId);
}

export function normalizeTemplateColor(value: string | undefined): string {
  if (!value) return DEFAULT_DOCUMENT_TEMPLATE_COLOR;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed) || /^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return trimmed.length === 4
      ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
      : trimmed;
  }
  return DEFAULT_DOCUMENT_TEMPLATE_COLOR;
}

export function resolveDocumentTemplate(
  doc: Pick<Document, 'templateId' | 'templateColor'> | Partial<Document>,
): DocumentTemplatePrefs {
  const templateId = normalizeDocumentTemplateId(doc.templateId);
  return {
    templateId,
    templateColor: normalizeTemplateColor(doc.templateColor),
  };
}

export function parseDocumentTemplatePrefs(raw: string | null): DocumentTemplatePrefs | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DocumentTemplatePrefs>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.templateId || !isDocumentTemplateId(parsed.templateId)) return null;
    return {
      templateId: normalizeDocumentTemplateId(parsed.templateId),
      templateColor: normalizeTemplateColor(parsed.templateColor),
      customHtml:
        typeof parsed.customHtml === 'string' && parsed.customHtml.trim()
          ? parsed.customHtml
          : undefined,
      customHtmlFileName:
        typeof parsed.customHtmlFileName === 'string' && parsed.customHtmlFileName.trim()
          ? parsed.customHtmlFileName.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export function parseHexColor(hex: string): [number, number, number] {
  const normalized = normalizeTemplateColor(hex).replace('#', '');
  const value = parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
