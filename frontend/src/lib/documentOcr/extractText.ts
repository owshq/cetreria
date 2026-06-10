import '@/lib/pdfjsSetup.js';
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import type { Worker } from 'tesseract.js';

const MIN_PDF_TEXT_CHARS = 40;
const MAX_OCR_PAGES = 3;
const OCR_RENDER_SCALE = 2;

let ocrWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('spa', 1, {
        logger: () => undefined,
      });
      return worker;
    })();
  }
  return ocrWorkerPromise;
}

async function extractPdfText(pdf: PDFDocumentProxy): Promise<string> {
  const chunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) chunks.push(pageText);
  }
  return chunks.join('\n');
}

async function renderPageToBlob(pageNumber: number, pdf: PDFDocumentProxy): Promise<Blob> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el lienzo para OCR');

  await page.render({ canvasContext: context, viewport }).promise;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo convertir la p?gina a imagen'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function ocrImageBlob(blob: Blob): Promise<string> {
  const worker = await getOcrWorker();
  const result = await worker.recognize(blob);
  return result.data.text ?? '';
}

async function ocrImageFile(file: File): Promise<string> {
  return ocrImageBlob(file);
}

async function extractFromPdfFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const pdf = await getDocument({ data: bytes }).promise;
  const embeddedText = await extractPdfText(pdf);

  if (embeddedText.replace(/\s/g, '').length >= MIN_PDF_TEXT_CHARS) {
    return embeddedText;
  }

  const pageCount = Math.min(pdf.numPages, MAX_OCR_PAGES);
  const ocrChunks: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const blob = await renderPageToBlob(pageNumber, pdf);
    const pageText = await ocrImageBlob(blob);
    if (pageText.trim()) ocrChunks.push(pageText);
  }

  return ocrChunks.join('\n\n');
}

export async function extractDocumentText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractFromPdfFile(file);
  }
  if (file.type.startsWith('image/')) {
    return ocrImageFile(file);
  }
  throw new Error('Formato no compatible con lectura autom�tica (usa PDF o imagen).');
}
