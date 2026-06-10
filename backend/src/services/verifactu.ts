import QRCode from 'qrcode';
import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import {
  VERIFACTU_PROD_NOT_CONFIGURED_CODE,
  VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE,
  buildVerifactuCsv,
  buildVerifactuQrUrl,
  buildVerifactuRecordHash,
  isVerifactuProductionOperational,
  resolveVerifactuInvoiceKind,
  validateVerifactuSubmit,
  type VerifactuStatus,
} from '@shared/types';
import { getWorkspaceBillingSettings, saveWorkspaceBillingSettings } from './workspaceBillingSettings.js';
import { syncDocumentPdf } from './documentFiles.js';
import { DB_NAMES } from '../config.js';
import {
  findByFieldInWorkspace,
  getByIdInWorkspace,
  updateDoc,
  insertDoc,
} from '../db/repository.js';

export async function generateVerifactuQrDataUrl(qrUrl: string): Promise<string> {
  return QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 256,
    type: 'image/png',
  });
}

export async function ensureDocumentVerifactuQrForRender(
  document: Document,
  company: WorkspaceBillingSettings,
): Promise<{ document: Document; shouldPersist: boolean }> {
  if (document.type !== 'invoice') {
    return { document, shouldPersist: false };
  }
  if (document.verifactuQrDataUrl?.trim()) {
    return { document, shouldPersist: false };
  }
  if (!company.verifactuEnabled || !company.issuerNif?.trim()) {
    return { document, shouldPersist: false };
  }

  const qrUrl =
    document.verifactuQrUrl?.trim() ||
    buildVerifactuQrUrl({
      issuerNif: company.issuerNif,
      invoiceNumber: document.number,
      date: document.date,
      total: document.total,
    });
  const qrDataUrl = await generateVerifactuQrDataUrl(qrUrl);

  return {
    document: {
      ...document,
      verifactuQrUrl: qrUrl,
      verifactuQrDataUrl: qrDataUrl,
    },
    shouldPersist: true,
  };
}

type SubmitVerifactuResult = {
  document: Document;
  settings: WorkspaceBillingSettings;
};

async function simulateAeatSubmission(
  environment: WorkspaceBillingSettings['verifactuEnvironment'],
): Promise<{ status: VerifactuStatus; errorCode?: string; errorMessage?: string }> {
  const productionOperational = isVerifactuProductionOperational(
    process.env.VERIFACTU_PRODUCTION_ENABLED,
  );
  if (environment === 'production' && !productionOperational) {
    return {
      status: 'rechazado',
      errorCode: VERIFACTU_PROD_NOT_CONFIGURED_CODE,
      errorMessage: VERIFACTU_PRODUCTION_UNAVAILABLE_MESSAGE,
    };
  }
  if (environment === 'production') {
    return { status: 'aceptado' };
  }
  return { status: 'aceptado' };
}

export async function submitDocumentToVerifactu(
  workspaceId: string,
  documentId: string,
): Promise<SubmitVerifactuResult> {
  const document = await getByIdInWorkspace<Document>(
    DB_NAMES.documents,
    documentId,
    workspaceId,
  );
  if (!document) {
    throw new Error('Documento no encontrado');
  }

  if (document.type !== 'invoice') {
    throw new Error('Solo las facturas pueden enviarse a Veri*Factu');
  }

  const client = await getByIdInWorkspace<Client>(
    DB_NAMES.clients,
    document.clientId,
    workspaceId,
  );
  if (!client) {
    throw new Error('Contacto no encontrado');
  }

  const settings = await getWorkspaceBillingSettings(workspaceId);
  const validation = validateVerifactuSubmit(document, client, settings);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }

  const invoiceKind = resolveVerifactuInvoiceKind(document);
  const issuerNif = settings.issuerNif ?? '';
  const qrUrl = buildVerifactuQrUrl({
    issuerNif,
    invoiceNumber: document.number,
    date: document.date,
    total: document.total,
  });

  const recordHash = buildVerifactuRecordHash({
    issuerNif,
    invoiceNumber: document.number,
    date: document.date,
    total: document.total,
    invoiceKind,
    previousHash: settings.verifactuLastRecordHash,
  });

  const csv = buildVerifactuCsv(recordHash);
  const qrDataUrl = await generateVerifactuQrDataUrl(qrUrl);

  const aeatResult = await simulateAeatSubmission(settings.verifactuEnvironment);

  const submittedAt = new Date().toISOString();
  const patch: Partial<Document> = {
    verifactuStatus: aeatResult.status === 'aceptado' ? 'aceptado' : 'rechazado',
    verifactuSubmittedAt: submittedAt,
    verifactuHash: recordHash,
    verifactuQrUrl: qrUrl,
    verifactuQrDataUrl: qrDataUrl,
    verifactuCsv: csv,
    verifactuErrorCode: aeatResult.errorCode,
    verifactuErrorMessage: aeatResult.errorMessage,
    status: aeatResult.status === 'aceptado' ? 'sent' : document.status,
  };

  const updatedSettings = await saveWorkspaceBillingSettings(workspaceId, {
    verifactuLastRecordHash:
      aeatResult.status === 'aceptado' ? recordHash : settings.verifactuLastRecordHash,
  });

  const settingsRows = await findByFieldInWorkspace<WorkspaceBillingSettings>(
    DB_NAMES.workspaceBillingSettings,
    'workspaceId',
    workspaceId,
    workspaceId,
  );
  if (settingsRows[0]) {
    await updateDoc<WorkspaceBillingSettings>(
      DB_NAMES.workspaceBillingSettings,
      settingsRows[0].id,
      updatedSettings,
    );
  } else {
    await insertDoc(DB_NAMES.workspaceBillingSettings, updatedSettings);
  }

  const updatedRow = await updateDoc<Document>(DB_NAMES.documents, document.id, patch);
  if (!updatedRow) {
    throw new Error('No se pudo actualizar la factura tras el envio Veri*Factu');
  }
  const updatedDocument = await syncDocumentPdf(updatedRow);

  return {
    document: updatedDocument,
    settings: updatedSettings,
  };
}
