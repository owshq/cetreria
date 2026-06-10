import type { Activity, Client, Document, DocumentPdfSigner, User } from '@shared/types';
import {
  DOCUMENT_PDF_RENDER_VERSION,
  UPLOADED_DOCUMENT_FILE_VERSION,
  documentFileKey,
  documentPdfKey,
  isUploadedDocumentSource,
  legacyDocumentPdfKey,
  needsDocumentPdfRegeneration,
  renderDocumentPdfBytes,
  resolveDocumentTemplate,
} from '@shared/types';
import { DB_NAMES } from '../config.js';
import { getById, updateDoc } from '../db/repository.js';
import { getDocumentStorage } from '../storage/index.js';
import { getWorkspaceBillingSettings } from './workspaceBillingSettings.js';
import { ensureDocumentVerifactuQrForRender } from './verifactu.js';

const PDF_CONTENT_FIELDS = [
  'type',
  'number',
  'clientId',
  'date',
  'items',
  'subtotal',
  'taxRate',
  'taxAmount',
  'total',
  'notes',
  'billingAddress',
  'status',
  'templateId',
  'templateColor',
] as const;

export function shouldRegenerateDocumentPdf(
  existing: Document,
  updates: Partial<Document>,
): boolean {
  if (isUploadedDocumentSource(existing) || updates.pdfSource === 'uploaded') {
    return false;
  }
  return PDF_CONTENT_FIELDS.some((field) => {
    if (!(field in updates)) return false;
    const nextValue = updates[field];
    const currentValue = existing[field];
    return JSON.stringify(nextValue) !== JSON.stringify(currentValue);
  });
}

async function resolveDocumentPdfSigner(
  document: Document,
  actingUser?: Pick<User, 'name' | 'signatureDataUrl'>,
): Promise<DocumentPdfSigner | null> {
  if (document.activityId) {
    const activity = await getById<Activity>(DB_NAMES.activities, document.activityId);
    const signature = activity?.workerSignature;
    if (signature?.imageDataUrl?.trim()) {
      return {
        userName: signature.userName,
        imageDataUrl: signature.imageDataUrl,
        signedAt: signature.signedAt,
      };
    }
  }

  const imageDataUrl = actingUser?.signatureDataUrl?.trim();
  if (imageDataUrl) {
    return {
      userName: actingUser?.name?.trim() || 'Usuario',
      imageDataUrl,
      signedAt: new Date().toISOString(),
    };
  }

  return null;
}

export async function syncDocumentPdf(
  document: Document,
  actingUser?: Pick<User, 'name' | 'signatureDataUrl'>,
): Promise<Document> {
  const client = await getById<Client>(DB_NAMES.clients, document.clientId);
  if (!client) {
    throw new Error('Contacto no encontrado');
  }

  const template = resolveDocumentTemplate(document);
  const docForRender: Document = {
    ...document,
    templateId: template.templateId,
    templateColor: template.templateColor,
  };

  const storage = getDocumentStorage();
  const pdfKey = documentPdfKey(document);
  const company = await getWorkspaceBillingSettings(document.workspaceId);
  const signer = await resolveDocumentPdfSigner(document, actingUser);

  const { document: docWithQr, shouldPersist } = await ensureDocumentVerifactuQrForRender(
    docForRender,
    company,
  );
  if (shouldPersist) {
    await updateDoc<Document>(DB_NAMES.documents, document.id, {
      verifactuQrUrl: docWithQr.verifactuQrUrl,
      verifactuQrDataUrl: docWithQr.verifactuQrDataUrl,
    });
  }

  const pdfBytes = renderDocumentPdfBytes(docWithQr, client, company, signer);

  await storage.upload(pdfKey, pdfBytes);

  const updated = await updateDoc<Document>(DB_NAMES.documents, document.id, {
    pdfKey,
    pdfGeneratedAt: new Date().toISOString(),
    templateId: template.templateId,
    templateColor: template.templateColor,
    pdfRenderVersion: DOCUMENT_PDF_RENDER_VERSION,
  });

  if (!updated) {
    throw new Error('No se pudo actualizar el documento con la clave del PDF');
  }

  return updated;
}

export async function syncUploadedDocumentFile(
  document: Document,
  fileBytes: Uint8Array,
  contentType: string,
): Promise<Document> {
  const storage = getDocumentStorage();
  const docWithType: Document = { ...document, pdfContentType: contentType };
  const fileKey = documentFileKey(docWithType);

  await storage.upload(fileKey, fileBytes, contentType);

  const updated = await updateDoc<Document>(DB_NAMES.documents, document.id, {
    pdfKey: fileKey,
    pdfContentType: contentType,
    pdfSource: 'uploaded',
    pdfGeneratedAt: new Date().toISOString(),
    pdfRenderVersion: UPLOADED_DOCUMENT_FILE_VERSION,
  });

  if (!updated) {
    throw new Error('No se pudo actualizar el documento con el archivo subido');
  }

  return updated;
}

export async function ensureDocumentPdfSynced(document: Document): Promise<Document> {
  if (isUploadedDocumentSource(document)) {
    return document;
  }
  if (!needsDocumentPdfRegeneration(document)) {
    return document;
  }
  return syncDocumentPdf(document, undefined);
}

export async function getDocumentPdfBuffer(document: Document): Promise<Uint8Array> {
  if (isUploadedDocumentSource(document)) {
    const storage = getDocumentStorage();
    if (!document.pdfKey) {
      throw new Error('El documento no tiene archivo subido');
    }
    const stored = await storage.download(document.pdfKey);
    if (!stored) {
      throw new Error('No se pudo recuperar el archivo del documento');
    }
    return stored;
  }

  const synced = await ensureDocumentPdfSynced(document);
  const storage = getDocumentStorage();
  const canonicalKey = documentPdfKey(synced);
  const keysToTry = [
    synced.pdfKey,
    canonicalKey,
    legacyDocumentPdfKey(synced),
  ].filter((key, index, list): key is string => Boolean(key) && list.indexOf(key) === index);

  for (const key of keysToTry) {
    const stored = await storage.download(key);
    if (!stored) continue;

    if (key !== canonicalKey) {
      await storage.upload(canonicalKey, stored);
      await updateDoc<Document>(DB_NAMES.documents, synced.id, {
        pdfKey: canonicalKey,
        pdfGeneratedAt: synced.pdfGeneratedAt ?? new Date().toISOString(),
      });
    }

    return stored;
  }

  const regenerated = await syncDocumentPdf(synced, undefined);
  const stored = await storage.download(regenerated.pdfKey!);
  if (!stored) {
    throw new Error('No se pudo recuperar el PDF del documento');
  }
  return stored;
}

export async function deleteDocumentPdf(document: Document): Promise<void> {
  if (!document.pdfKey) return;
  await getDocumentStorage().delete(document.pdfKey);
}

export async function getDocumentPdfViewUrl(document: Document): Promise<string | null> {
  if (!document.pdfKey) return null;
  const storage = getDocumentStorage();
  if (!storage.getViewUrl) return null;
  return storage.getViewUrl(document.pdfKey);
}
