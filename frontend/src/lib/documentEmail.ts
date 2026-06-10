import type { Client, Document } from '@shared/types';
import { buildDocumentPdf, DOCUMENT_TYPE_LABELS } from '@shared/types';
import { documentsService, revokePdfObjectUrl } from '@/api/documents';
import { parseEmailList, type EmailComposePayload } from '@/lib/emailCompose';
import { htmlToPlainText, looksLikeHtml, wrapEmailHtmlDocument } from '@/lib/emailHtml';
import { downloadDocumentPdf, getDocumentPdfLocalObjectUrl } from '@/lib/documentPdf';

export type DocumentEmailAttachmentPreview = {
  title: string;
  fileName: string;
  loadPreviewUrl: () => Promise<string>;
  onDownload?: () => void | Promise<void>;
};

export async function resolveDocumentAttachmentPreviewUrl(
  doc: Document,
  client: Client,
): Promise<string> {
  try {
    return await documentsService.getPdfPreviewUrl(doc.id);
  } catch {
    return getDocumentPdfLocalObjectUrl(doc, client);
  }
}

export function buildDocumentEmailAttachmentPreview(
  doc: Document,
  client: Client,
): DocumentEmailAttachmentPreview {
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
  return {
    title: `${typeLabel} ${doc.number}`,
    fileName: `${doc.number}.pdf`,
    loadPreviewUrl: () => resolveDocumentAttachmentPreviewUrl(doc, client),
    onDownload: () => downloadDocumentPdf(doc, client),
  };
}

export function releaseDocumentAttachmentPreviewUrl(url: string | null | undefined): void {
  if (url) revokePdfObjectUrl(url);
}

async function getDocumentPdfBlob(doc: Document, client: Client): Promise<Blob> {
  try {
    return await documentsService.getPdfBlob(doc.id);
  } catch {
    return buildDocumentPdf(doc, client).output('blob');
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encodeMimeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const base64 = btoa(unescape(encodeURIComponent(value)));
  return `=?UTF-8?B?${base64}?=`;
}

function wrapBase64(base64: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    chunks.push(base64.slice(i, i + lineLength));
  }
  return chunks.join('\r\n');
}

function buildEml(options: {
  to?: string;
  cc?: string;
  subject: string;
  body: string;
  filename: string;
  pdfBase64: string;
}): string {
  const mixedBoundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const altBoundary = `${mixedBoundary}_alt`;
  const plainBody = looksLikeHtml(options.body) ? htmlToPlainText(options.body) : options.body;
  const plainBase64 = btoa(unescape(encodeURIComponent(plainBody)));
  const htmlBody = looksLikeHtml(options.body)
    ? wrapEmailHtmlDocument(options.body)
    : wrapEmailHtmlDocument(plainBody.replace(/\n/g, '<br>'));
  const htmlBase64 = btoa(unescape(encodeURIComponent(htmlBody)));

  const headers = [
    options.to ? `To: ${options.to}` : null,
    options.cc ? `Cc: ${options.cc}` : null,
    `Subject: ${encodeMimeHeader(options.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ].filter(Boolean);

  return [
    headers.join('\r\n'),
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(plainBase64),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(htmlBase64),
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${options.filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${options.filename}"`,
    '',
    wrapBase64(options.pdfBase64),
    '',
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function buildDocumentEmailDefaults(doc: Document, client: Client) {
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
  return {
    to: client.email?.trim() ?? '',
    subject: `${typeLabel} ${doc.number}`,
    body: `Buenos dias,\n\nAdjunto ${typeLabel.toLowerCase()} ${doc.number}.\n\nSaludos cordiales.`,
    attachmentLabel: `${doc.number}.pdf`,
  };
}

export async function emailDocumentPdf(
  doc: Document,
  client: Client,
  compose?: EmailComposePayload,
): Promise<void> {
  const defaults = buildDocumentEmailDefaults(doc, client);
  const payload = {
    to: compose?.to ?? defaults.to,
    cc: compose?.cc ?? '',
    subject: compose?.subject ?? defaults.subject,
    body: compose?.body ?? defaults.body,
  };

  const pdfBlob = await getDocumentPdfBlob(doc, client);
  const filename = defaults.attachmentLabel;

  if (typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    const shareText = looksLikeHtml(payload.body) ? htmlToPlainText(payload.body) : payload.body;
    const shareData: ShareData = { title: payload.subject, text: shareText, files: [file] };
    if (!navigator.canShare || navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
  }

  const toList = parseEmailList(payload.to);
  if (toList.length === 0) {
    throw new Error('missing-recipient');
  }

  const ccList = parseEmailList(payload.cc);
  const pdfBase64 = await blobToBase64(pdfBlob);
  const eml = buildEml({
    to: toList.join(', '),
    cc: ccList.length > 0 ? ccList.join(', ') : undefined,
    subject: payload.subject,
    body: payload.body,
    filename,
    pdfBase64,
  });
  downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `${doc.number}.eml`);
}
