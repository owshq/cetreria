import {
  readWorkspaceScopedStorage,
  writeWorkspaceScopedStorage,
} from '@/lib/workspaceStorage';

const STORAGE_KEY = 'document_saved_templates';

export type SavedDocumentTemplate = {
  id: string;
  name: string;
  html: string;
  updatedAt: string;
};

function parseSavedTemplates(raw: string | null): SavedDocumentTemplate[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedDocumentTemplate =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as SavedDocumentTemplate).id === 'string' &&
          typeof (item as SavedDocumentTemplate).name === 'string' &&
          typeof (item as SavedDocumentTemplate).html === 'string' &&
          (item as SavedDocumentTemplate).html.trim().length > 0,
      )
      .map((item) => ({
        id: item.id,
        name: item.name.trim(),
        html: item.html,
        updatedAt:
          typeof item.updatedAt === 'string' && item.updatedAt.trim()
            ? item.updatedAt
            : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function writeSavedTemplates(templates: SavedDocumentTemplate[]): void {
  writeWorkspaceScopedStorage(JSON.stringify(templates), STORAGE_KEY);
}

export function readSavedDocumentTemplates(): SavedDocumentTemplate[] {
  return parseSavedTemplates(readWorkspaceScopedStorage(STORAGE_KEY));
}

export function upsertSavedDocumentTemplate(
  name: string,
  html: string,
  existingId?: string,
): SavedDocumentTemplate {
  const trimmedName = name.trim();
  const trimmedHtml = html.trim();
  const templates = readSavedDocumentTemplates();
  const now = new Date().toISOString();
  const next: SavedDocumentTemplate = {
    id: existingId ?? crypto.randomUUID(),
    name: trimmedName,
    html: trimmedHtml,
    updatedAt: now,
  };

  const index = templates.findIndex((template) => template.id === next.id);
  if (index >= 0) {
    templates[index] = next;
  } else {
    templates.unshift(next);
  }

  writeSavedTemplates(templates);
  return next;
}

export function deleteSavedDocumentTemplate(id: string): void {
  const templates = readSavedDocumentTemplates().filter((template) => template.id !== id);
  writeSavedTemplates(templates);
}

export function ensureSavedDocumentTemplate(name: string, html: string): SavedDocumentTemplate {
  const trimmedName = name.trim();
  const trimmedHtml = html.trim();
  const templates = readSavedDocumentTemplates();
  const existing = templates.find(
    (template) => template.name === trimmedName && template.html === trimmedHtml,
  );
  if (existing) return existing;
  return upsertSavedDocumentTemplate(trimmedName, trimmedHtml);
}
