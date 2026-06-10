import { getDocument, type RenderTask } from 'pdfjs-dist';
import '@/lib/pdfjsSetup';
import {
  buildDocumentPdf,
  DEFAULT_DOCUMENT_HTML_TEMPLATE,
  fillDocumentHtmlTemplate,
  normalizeDocumentFooterText,
  type DocumentTemplateId,
} from '@shared/types';
import {
  buildDocumentTemplatePreviewDocument,
  DOCUMENT_TEMPLATE_PREVIEW_CLIENT,
  DOCUMENT_TEMPLATE_PREVIEW_COMPANY,
} from '@/lib/documentTemplatePreviewSample';

function buildPreviewCompany(
  customHtml?: string,
  documentFooterText?: string,
  documentLogoDataUrl?: string,
) {
  return {
    ...DOCUMENT_TEMPLATE_PREVIEW_COMPANY,
    customDocumentHtml: customHtml,
    documentFooterText: documentFooterText
      ? normalizeDocumentFooterText(documentFooterText)
      : undefined,
    documentLogoDataUrl: documentLogoDataUrl || undefined,
  };
}

export function buildDocumentHtmlTemplatePreview(
  templateColor: string,
  customHtml?: string,
  documentFooterText?: string,
  documentLogoDataUrl?: string,
): string {
  const templateHtml = customHtml?.trim() || DEFAULT_DOCUMENT_HTML_TEMPLATE;
  return fillDocumentHtmlTemplate(
    templateHtml,
    buildDocumentTemplatePreviewDocument('custom', templateColor),
    DOCUMENT_TEMPLATE_PREVIEW_CLIENT,
    buildPreviewCompany(templateHtml, documentFooterText, documentLogoDataUrl),
  );
}

export function getDocumentTemplatePreviewObjectUrl(
  templateId: DocumentTemplateId,
  templateColor: string,
  customHtml?: string,
  documentFooterText?: string,
  documentLogoDataUrl?: string,
): string {
  const blob = buildDocumentPdf(
    buildDocumentTemplatePreviewDocument(templateId, templateColor),
    DOCUMENT_TEMPLATE_PREVIEW_CLIENT,
    buildPreviewCompany(customHtml, documentFooterText, documentLogoDataUrl),
  ).output('blob');
  return URL.createObjectURL(blob);
}

export async function renderDocumentTemplatePreview(
  canvas: HTMLCanvasElement,
  templateId: DocumentTemplateId,
  templateColor: string,
  containerWidth: number,
  activeTask: { current: RenderTask | null },
  customHtml?: string,
  documentFooterText?: string,
  documentLogoDataUrl?: string,
): Promise<void> {
  if (containerWidth < 1) return;

  const pdfBytes = buildDocumentPdf(
    buildDocumentTemplatePreviewDocument(templateId, templateColor),
    DOCUMENT_TEMPLATE_PREVIEW_CLIENT,
    buildPreviewCompany(customHtml, documentFooterText, documentLogoDataUrl),
  ).output('arraybuffer');

  const pdf = await getDocument({ data: pdfBytes }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = containerWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  activeTask.current?.cancel();

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return;

  const cssWidth = Math.round(viewport.width);
  const cssHeight = Math.round(viewport.height);

  canvas.width = cssWidth;
  canvas.height = cssHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  const task = page.render({
    canvasContext: context,
    viewport,
  });
  activeTask.current = task;

  try {
    await task.promise;
  } finally {
    if (activeTask.current === task) {
      activeTask.current = null;
    }
  }
}
