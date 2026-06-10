import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import { buildDocumentPdf } from '@shared/types';
import { apiFetchBlob } from '@/api/client';
import {
  documentsService,
  downloadDocumentPdfById,
  openPdfUrl,
  triggerFileDownload,
} from '@/api/documents';

function extractDocumentPdfApiPath(src: string): string | null {
  const match = src.match(/\/documents\/([^/?#]+)\/pdf(?:\?|$|#)/);
  return match ? `/documents/${match[1]}/pdf` : null;
}

async function readPdfBytesFromPreviewUrl(src: string): Promise<ArrayBuffer> {
  const apiPath = extractDocumentPdfApiPath(src);
  if (apiPath) {
    return (await apiFetchBlob(apiPath)).arrayBuffer();
  }

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error('No se pudo cargar el PDF.');
  }
  return response.arrayBuffer();
}

/** Imprime el PDF mostrado en la vista previa (URL API, blob: o remota). */
export async function printPdfFromPreviewUrl(src: string): Promise<void> {
  const blob = new Blob([await readPdfBytesFromPreviewUrl(src)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.inset = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = url;
  document.body.appendChild(frame);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => {
      document.body.removeChild(frame);
      URL.revokeObjectURL(url);
    }, 1000);
  };
}

export async function openDocumentPdf(doc: Document, client?: Client): Promise<void> {
  const previewTab = openDocumentPreviewTab();
  try {
    const url = await documentsService.getPdfPreviewUrl(doc.id);
    if (previewTab && !previewTab.closed) {
      previewTab.location.href = url;
      if (url.startsWith('blob:')) {
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }
      return;
    }
    openPdfUrl(url);
  } catch {
    if (client) {
      openDocumentPdfLocally(doc, client, undefined, previewTab);
      return;
    }
    if (previewTab && !previewTab.closed) {
      previewTab.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#b91c1c">No se pudo abrir el documento.</p>';
    }
    throw new Error('No se pudo abrir el documento.');
  }
}

export async function downloadDocumentPdf(doc: Document, _client?: Client): Promise<void> {
  await downloadDocumentPdfById(doc.id, doc.number);
}

export function buildDocumentPdfBlob(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): Blob {
  return buildDocumentPdf(doc, client, company).output('blob');
}

export function getDocumentPdfLocalObjectUrl(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): string {
  return URL.createObjectURL(buildDocumentPdfBlob(doc, client, company));
}

/** Abre una pestaña en el mismo clic del usuario (evita bloqueo de popups). */
export function openDocumentPreviewTab(): Window | null {
  const tab = window.open('about:blank', '_blank');
  if (!tab) return null;
  tab.document.title = 'Generando vista previa…';
  tab.document.body.innerHTML =
    '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#404040">Generando vista previa…</p>';
  return tab;
}

/**
 * Genera el PDF en el cliente y lo abre en una pestaña.
 * `previewTab` debe abrirse con {@link openDocumentPreviewTab} en el mismo clic del usuario.
 */
export function openDocumentPdfLocally(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  previewTab: Window | null = null,
): void {
  const fileName = doc.number.endsWith('.pdf') ? doc.number : `${doc.number}.pdf`;
  let tab = previewTab;

  if (!tab) {
    tab = openDocumentPreviewTab();
  }

  try {
    const blob = buildDocumentPdfBlob(doc, client, company);
    const url = URL.createObjectURL(blob);

    if (tab && !tab.closed) {
      tab.location.href = url;
      tab.document.title = fileName.replace(/\.pdf$/i, '');
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }

    triggerFileDownload(blob, fileName);
  } catch (err) {
    if (tab && !tab.closed) {
      tab.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;padding:2rem;color:#b91c1c">No se pudo generar la vista previa.</p>';
    }
    throw err;
  }
}

export function downloadDocumentPdfLocally(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): void {
  const blob = buildDocumentPdfBlob(doc, client, company);
  triggerFileDownload(blob, `${doc.number}.pdf`);
}
