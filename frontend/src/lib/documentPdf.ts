import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import { buildDocumentPdf } from '@shared/types';
import { apiFetchBlob } from '@/api/client';
import {
  documentsService,
  downloadDocumentPdfById,
  triggerFileDownload,
} from '@/api/documents';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isRemotePdfUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function scheduleBlobUrlRevoke(url: string): void {
  if (url.startsWith('blob:')) {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}

/** Embed en pestaña popup (fallback si data: URL no esta disponible). */
function renderPdfBlobInWindow(win: Window, blob: Blob, title: string): void {
  const safeTitle = escapeHtml(title.replace(/\.pdf$/i, ''));
  const url = URL.createObjectURL(blob);
  win.document.open();
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>` +
      `<style>html,body{margin:0;height:100%;overflow:hidden;background:#525659}` +
      `object,embed{display:block;width:100%;height:100%;border:0}</style></head><body>` +
      `<object data="${url}" type="application/pdf"><embed src="${url}" type="application/pdf" /></object>` +
      `</body></html>`,
  );
  win.document.close();
  scheduleBlobUrlRevoke(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('No se pudo leer el PDF.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el PDF.'));
    reader.readAsDataURL(blob);
  });
}

function openRemotePdfInWindow(win: Window | null, url: string, title: string): void {
  const docTitle = title.replace(/\.pdf$/i, '');
  if (win && !win.closed) {
    win.location.href = url;
    win.document.title = docTitle;
    return;
  }
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (tab) tab.document.title = docTitle;
}

function closePreviewTab(tab: Window | null): void {
  if (tab && !tab.closed) tab.close();
}

function previewTabLooksReady(win: Window): boolean {
  try {
    const href = win.location.href;
    if (href.startsWith('data:application/pdf')) return true;
    if (isRemotePdfUrl(href)) return true;
    return win.document.querySelector('object[data], embed[src]') != null;
  } catch {
    return false;
  }
}

function openDocumentDetailInNewTab(documentId: string): void {
  const path = `/docs/${documentId}`;
  const opened = window.open(path, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(path);
}

async function waitForPreviewTabReady(tab: Window): Promise<boolean> {
  await new Promise((resolve) => window.setTimeout(resolve, 400));
  return previewTabLooksReady(tab);
}

async function openPdfBlobInPreviewTab(
  blob: Blob,
  title: string,
  previewTab: Window | null,
): Promise<boolean> {
  const docTitle = title.replace(/\.pdf$/i, '');

  if (previewTab && !previewTab.closed) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      previewTab.location.replace(dataUrl);
      previewTab.document.title = docTitle;
      return waitForPreviewTabReady(previewTab);
    } catch {
      try {
        renderPdfBlobInWindow(previewTab, blob, title);
        return waitForPreviewTabReady(previewTab);
      } catch {
        // fallback abajo
      }
    }
  }

  const tab = openDocumentPreviewTab();
  if (tab && !tab.closed) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      tab.location.replace(dataUrl);
      tab.document.title = docTitle;
      return waitForPreviewTabReady(tab);
    } catch {
      try {
        renderPdfBlobInWindow(tab, blob, title);
        return waitForPreviewTabReady(tab);
      } catch {
        // fallback abajo
      }
    }
  }

  triggerFileDownload(blob, title);
  return true;
}

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
  const fileName = doc.number.endsWith('.pdf') ? doc.number : `${doc.number}.pdf`;
  try {
    const view = await documentsService.getPdfView(doc.id);
    if (view.url && isRemotePdfUrl(view.url)) {
      openRemotePdfInWindow(previewTab, view.url, fileName);
      return;
    }
    const blob = await documentsService.getPdfBlob(doc.id);
    const opened = await openPdfBlobInPreviewTab(blob, fileName, previewTab);
    if (!opened) {
      closePreviewTab(previewTab);
      openDocumentDetailInNewTab(doc.id);
    }
  } catch {
    if (client) {
      try {
        await openDocumentPdfLocally(doc, client, undefined, previewTab);
        return;
      } catch {
        // fallback abajo
      }
    }
    closePreviewTab(previewTab);
    openDocumentDetailInNewTab(doc.id);
  }
}

export async function openDocumentPdfByStoredId(
  id: string,
  title = 'documento.pdf',
): Promise<void> {
  const previewTab = openDocumentPreviewTab();
  const fileName = title.endsWith('.pdf') ? title : `${title}.pdf`;
  try {
    const view = await documentsService.getPdfView(id);
    if (view.url && isRemotePdfUrl(view.url)) {
      openRemotePdfInWindow(previewTab, view.url, fileName);
      return;
    }
    const blob = await documentsService.getPdfBlob(id);
    const opened = await openPdfBlobInPreviewTab(blob, fileName, previewTab);
    if (!opened) {
      closePreviewTab(previewTab);
      openDocumentDetailInNewTab(id);
    }
  } catch {
    closePreviewTab(previewTab);
    openDocumentDetailInNewTab(id);
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
export async function openDocumentPdfLocally(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  previewTab: Window | null = null,
): Promise<void> {
  const fileName = doc.number.endsWith('.pdf') ? doc.number : `${doc.number}.pdf`;
  let tab = previewTab;

  if (!tab) {
    tab = openDocumentPreviewTab();
  }

  try {
    const blob = buildDocumentPdfBlob(doc, client, company);
    await openPdfBlobInPreviewTab(blob, fileName, tab);
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
