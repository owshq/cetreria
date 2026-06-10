import type { DeleteDocumentTypeGroupDocumentsAction, Document, DocumentTypeGroup } from '@shared/types';
import { apiFetch } from './client';
import {
  getCachedResource,
  invalidateDocumentsBootstrapCache,
  invalidateResourceCache,
  resourceCacheKey,
} from './resourceCache';

function invalidateDocumentTypeGroupsCache(): void {
  invalidateResourceCache(resourceCacheKey('/document-type-groups'));
  invalidateDocumentsBootstrapCache();
}

export type CreateDocumentTypeGroupInput = {
  name: string;
  documentType: Document['type'];
  isPublic?: boolean;
};

export const documentTypeGroupsService = {
  getAll: (): Promise<DocumentTypeGroup[]> =>
    getCachedResource(resourceCacheKey('/document-type-groups'), () =>
      apiFetch<DocumentTypeGroup[]>('/document-type-groups'),
    ),

  create: (input: CreateDocumentTypeGroupInput): Promise<DocumentTypeGroup> =>
    apiFetch('/document-type-groups', {
      method: 'POST',
      body: JSON.stringify(input),
    }).then((created) => {
      invalidateDocumentTypeGroupsCache();
      return created as DocumentTypeGroup;
    }),

  update: (
    id: string,
    input: Partial<Pick<DocumentTypeGroup, 'name' | 'isPublic'>>,
  ): Promise<DocumentTypeGroup> =>
    apiFetch(`/document-type-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }).then((updated) => {
      invalidateDocumentTypeGroupsCache();
      invalidateResourceCache(resourceCacheKey('/documents'));
      return updated as DocumentTypeGroup;
    }),

  delete: (
    id: string,
    documentsAction: DeleteDocumentTypeGroupDocumentsAction,
  ): Promise<void> =>
    apiFetch(`/document-type-groups/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ documentsAction }),
    }).then((result) => {
      invalidateDocumentTypeGroupsCache();
      invalidateResourceCache(resourceCacheKey('/documents'));
      return result;
    }),
};
