import type { Document, DocumentsBootstrap, ElectronicInvoicingGateResult } from '@shared/types';
import { apiFetch, apiFetchBlob, ApiError, getToken, getWorkspaceId } from './client';
import {
  getCachedResource,
  invalidateDocumentsBootstrapCache,
  invalidateResourceCache,
  primeResourceCache,
  resourceCacheKey,
} from './resourceCache';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function documentsCacheKey(suffix = '/documents'): string {
  return resourceCacheKey(suffix);
}

function invalidateDocumentsCache(): void {
  invalidateResourceCache(documentsCacheKey());
  invalidateDocumentsBootstrapCache();
}

function primeDocumentsBootstrapCaches(data: DocumentsBootstrap): void {
  primeResourceCache(documentsCacheKey(), data.documents);
  primeResourceCache(resourceCacheKey('/clients'), data.clients);
  primeResourceCache(resourceCacheKey('/document-type-groups'), data.documentTypeGroups);
  primeResourceCache(resourceCacheKey('/activities'), data.activities);
}

export type DocumentUpdate = Partial<Document> & { activityId?: string | null };

export type DocumentPdfView = {
  driver: 's3' | 'local';
  url: string | null;
};

export const documentsService = {
  /** Documentos, clientes, grupos y actividades en una sola petición. */
  getBootstrap: async (): Promise<DocumentsBootstrap> => {
    const data = await getCachedResource(resourceCacheKey('/documents/bootstrap'), () =>
      apiFetch<DocumentsBootstrap>('/documents/bootstrap'),
    );
    primeDocumentsBootstrapCaches(data);
    return data;
  },

  getAll: (): Promise<Document[]> =>
    getCachedResource(documentsCacheKey(), () => apiFetch<Document[]>('/documents')),

  getById: async (id: string): Promise<Document | null> => {
    try {
      return await apiFetch<Document>(`/documents/${id}`);
    } catch {
      return null;
    }
  },

  getByClientId: (clientId: string): Promise<Document[]> =>
    apiFetch(`/documents?clientId=${encodeURIComponent(clientId)}`),

  getByActivityId: (activityId: string): Promise<Document[]> =>
    apiFetch(`/documents?activityId=${encodeURIComponent(activityId)}`),

  create: (
    doc: Omit<Document, 'id' | 'createdAt' | 'number' | 'workspaceId' | 'pdfKey' | 'pdfGeneratedAt'>,
  ): Promise<Document> =>
    apiFetch('/documents', { method: 'POST', body: JSON.stringify(doc) }),

  createWithSourceFile: async (
    doc: Omit<Document, 'id' | 'createdAt' | 'number' | 'workspaceId' | 'pdfKey' | 'pdfGeneratedAt'>,
    file: File,
  ): Promise<Document> => {
    const created = await documentsService.create({ ...doc, pdfSource: 'uploaded' });
    return documentsService.uploadSourceFile(created.id, file);
  },

  uploadSourceFile: async (id: string, file: File): Promise<Document> => {
    const token = getToken();
    const workspaceId = getWorkspaceId();
    const headers = new Headers();
    headers.set('Content-Type', file.type || 'application/octet-stream');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (workspaceId) headers.set('X-Workspace-Id', workspaceId);

    const response = await fetch(`${API_BASE}/documents/${id}/source-file`, {
      method: 'POST',
      headers,
      body: file,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error ?? 'Error de API', response.status);
    }

    invalidateDocumentsCache();
    return data as Document;
  },

  update: (id: string, updates: DocumentUpdate): Promise<Document> =>
    apiFetch(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(updates) }).then((updated) => {
      invalidateDocumentsCache();
      return updated;
    }),

  delete: (id: string): Promise<void> =>
    apiFetch(`/documents/${id}`, { method: 'DELETE' }).then((result) => {
      invalidateDocumentsCache();
      return result;
    }),

  getPdfView: (id: string): Promise<DocumentPdfView> =>
    apiFetch(`/documents/${id}/pdf-view`),

  getPdfBlob: (id: string, options?: { download?: boolean }): Promise<Blob> => {
    const query = options?.download ? '?download=1' : '';
    return apiFetchBlob(`/documents/${id}/pdf${query}`);
  },

  getXmlBlob: (id: string): Promise<Blob> => apiFetchBlob(`/documents/${id}/xml`),

  approveElectronicInvoicing: (id: string): Promise<ElectronicInvoicingGateResult> =>
    apiFetch(`/documents/${id}/electronic-invoicing/approve`, { method: 'POST' }).then(
      (result) => {
        invalidateDocumentsCache();
        return result;
      },
    ),

  /** Alias legacy del provider espanol; preferir approveElectronicInvoicing. */
  submitVerifactu: (id: string): Promise<Document> =>
    apiFetch(`/documents/${id}/verifactu/submit`, { method: 'POST' }).then((updated) => {
      invalidateDocumentsCache();
      return updated;
    }),

  getPdfObjectUrl: async (id: string): Promise<string> => {
    const blob = await documentsService.getPdfBlob(id);
    return URL.createObjectURL(blob);
  },

  /** URL para vista previa: S3 firmada cuando exista; si no, blob: con auth (evita abrir /api sin token). */
  getPdfPreviewUrl: async (id: string): Promise<string> => {
    const view = await documentsService.getPdfView(id);
    if (view.url) return view.url;
    return documentsService.getPdfObjectUrl(id);
  },
};

export function revokePdfObjectUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function openPdfUrl(url: string): void {
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (!tab && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export async function openDocumentPdfById(id: string): Promise<void> {
  const url = await documentsService.getPdfObjectUrl(id);
  openPdfUrl(url);
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  triggerBlobDownload(blob, safeName, 'application/octet-stream');
}

export function triggerBlobDownload(
  blob: Blob,
  filename: string,
  mimeType = blob.type || 'application/octet-stream',
): void {
  const downloadBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const url = URL.createObjectURL(downloadBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function downloadDocumentPdfById(id: string, filename: string): Promise<void> {
  const blob = await documentsService.getPdfBlob(id, { download: true });
  triggerFileDownload(blob, filename);
}

export async function downloadDocumentXmlById(id: string, filename: string): Promise<void> {
  const blob = await documentsService.getXmlBlob(id);
  triggerBlobDownload(blob, filename, 'application/xml');
}
