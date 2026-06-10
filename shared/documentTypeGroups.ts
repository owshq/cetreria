import type { Document, DocumentTypeGroup } from './types.js';

export const DEFAULT_DOCUMENT_TYPE_GROUP_LABELS: Record<Document['type'], string> = {
  invoice: 'Facturas',
  'delivery-note': 'Albaranes',
};

export const DEFAULT_DOCUMENT_TYPE_GROUP_SHORT_LABELS: Record<Document['type'], string> = {
  invoice: 'Factura',
  'delivery-note': 'Albarán',
};

export const DOCUMENT_TYPE_GROUP_ORDER: Document['type'][] = ['invoice', 'delivery-note'];

/** Tipos de documento que aun no tienen grupo en el workspace. */
export function getCreatableDocumentTypeGroupTypes(
  groups: readonly Pick<DocumentTypeGroup, 'documentType'>[],
): Document['type'][] {
  const existing = new Set(groups.map((group) => group.documentType));
  return DOCUMENT_TYPE_GROUP_ORDER.filter((type) => !existing.has(type));
}

export function canCreateDocumentTypeGroup(
  groups: readonly Pick<DocumentTypeGroup, 'documentType'>[],
): boolean {
  return getCreatableDocumentTypeGroupTypes(groups).length > 0;
}

export function workspaceHasDocumentTypeGroup(
  groups: readonly Pick<DocumentTypeGroup, 'documentType'>[],
  documentType: Document['type'],
): boolean {
  return groups.some((group) => group.documentType === documentType);
}

/** Valor canonico de isPublic al migrar grupos sin el campo persistido. */
export function canonicalDocumentTypeGroupIsPublic(documentType: Document['type']): boolean {
  return documentType === 'delivery-note';
}

/** Qué hacer con los documentos al eliminar un grupo-tipo. */
export type DeleteDocumentTypeGroupDocumentsAction = 'keep' | 'delete_documents';
