import {
  DEFAULT_DOCUMENT_TEMPLATE_COLOR,
  DEFAULT_DOCUMENT_TEMPLATE_ID,
  parseDocumentTemplatePrefs,
  type DocumentTemplatePrefs,
} from '@shared/types';
import {
  readWorkspaceScopedStorage,
  writeWorkspaceScopedStorage,
} from '@/lib/workspaceStorage';

const PREFS_KEY = 'document_template_prefs';

export function readLastDocumentTemplatePrefs(): DocumentTemplatePrefs {
  const stored = parseDocumentTemplatePrefs(readWorkspaceScopedStorage(PREFS_KEY));
  return (
    stored ?? {
      templateId: DEFAULT_DOCUMENT_TEMPLATE_ID,
      templateColor: DEFAULT_DOCUMENT_TEMPLATE_COLOR,
    }
  );
}

export function writeLastDocumentTemplatePrefs(prefs: DocumentTemplatePrefs): void {
  writeWorkspaceScopedStorage(JSON.stringify(prefs), PREFS_KEY);
}
