import { useCallback, useRef, useState } from 'react';
import type { Activity, ActivityType, Client, Document } from '@shared/types';
import {
  activityTypeCreatesDeliveryNote,
  buildActivityDeliveryNotePreviewDocument,
  resolveActivityType,
} from '@shared/types';
import { documentsService } from '@/api/documents';
import { workspaceBillingSettingsService } from '@/api/workspaceBillingSettings';
import {
  downloadDocumentPdf,
  downloadDocumentPdfLocally,
  getDocumentPdfLocalObjectUrl,
} from '@/lib/documentPdf';
import { resolveWorkspaceBillingSettings } from '@/lib/resolveWorkspaceBillingSettings';

export type ActivityDeliveryNotePreviewContext = {
  activity: Activity;
  activityTypes: readonly ActivityType[];
  client: Client | null;
  workspaceId: string;
  existingDeliveryNote?: Document | null;
  extraItemsOverride?: readonly Document['items'];
  pendingReport?: Parameters<typeof buildActivityDeliveryNotePreviewDocument>[0]['pendingReport'];
  workerUserId?: string;
  workerName?: string;
};

function buildPreviewDocument(
  context: ActivityDeliveryNotePreviewContext,
  defaultTaxRate?: number,
): Document | null {
  if (!context.client) return null;
  return buildActivityDeliveryNotePreviewDocument({
    activity: context.activity,
    activityTypes: context.activityTypes,
    client: context.client,
    workspaceId: context.workspaceId,
    defaultTaxRate,
    existingDeliveryNote: context.existingDeliveryNote,
    extraItemsOverride: context.extraItemsOverride,
    pendingReport: context.pendingReport,
    workerUserId: context.workerUserId,
  });
}

function workerHasPreviewableDeliveryNote(
  context: ActivityDeliveryNotePreviewContext,
  previewDocument: Document | null,
): boolean {
  if (context.existingDeliveryNote) return true;
  return Boolean(previewDocument && previewDocument.items.length > 0);
}

function getActivityDeliveryNotePreviewBaseDisabledReason(
  context: ActivityDeliveryNotePreviewContext,
): string | null {
  const resolvedType = resolveActivityType(context.activity.type, context.activityTypes);
  if (!activityTypeCreatesDeliveryNote(resolvedType)) {
    return 'Este tipo de actividad no genera albarán automáticamente.';
  }
  if (!context.client) return 'Selecciona un contacto para ver el albarán.';
  if (!context.client.email?.trim()) {
    return 'El contacto necesita email para generar el albarán.';
  }
  return null;
}

export function getActivityDeliveryNotePreviewViewDisabledReason(
  context: ActivityDeliveryNotePreviewContext,
  previewDocument: Document | null,
): string | null {
  const baseReason = getActivityDeliveryNotePreviewBaseDisabledReason(context);
  if (baseReason) return baseReason;
  if (context.existingDeliveryNote) return null;
  if (context.workerUserId) {
    if (!workerHasPreviewableDeliveryNote(context, previewDocument)) {
      return 'El albaran estara disponible al enviar el informe de trabajo.';
    }
    return null;
  }
  if (previewDocument) return null;
  return 'Anade informes de trabajo o conceptos para ver el albaran.';
}

export function getActivityDeliveryNotePreviewDownloadDisabledReason(
  context: ActivityDeliveryNotePreviewContext,
  previewDocument: Document | null,
): string | null {
  const baseReason = getActivityDeliveryNotePreviewBaseDisabledReason(context);
  if (baseReason) return baseReason;
  if (context.existingDeliveryNote) return null;
  if (!previewDocument || previewDocument.items.length === 0) {
    if (context.workerUserId) {
      return 'Completa el informe de trabajo para descargar el albaran.';
    }
    return 'Añade informes de trabajo o conceptos para descargar el albarán.';
  }
  return null;
}

/** @deprecated Usar getActivityDeliveryNotePreviewViewDisabledReason */
export function getActivityDeliveryNotePreviewDisabledReason(
  context: ActivityDeliveryNotePreviewContext,
  previewDocument: Document | null,
): string | null {
  return getActivityDeliveryNotePreviewViewDisabledReason(context, previewDocument);
}

export function useActivityDeliveryNotePreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Albarán');
  const [previewHint, setPreviewHint] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('albaran.pdf');
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewClient, setPreviewClient] = useState<Client | null>(null);
  const [previewPersisted, setPreviewPersisted] = useState(false);
  const activeContextRef = useRef<ActivityDeliveryNotePreviewContext | null>(null);

  const closePreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewDocument(null);
    setPreviewClient(null);
    setPreviewPersisted(false);
    activeContextRef.current = null;
  }, []);

  const openPreview = useCallback(
    async (context: ActivityDeliveryNotePreviewContext) => {
      const draft = buildPreviewDocument(context);
      const disabledReason = getActivityDeliveryNotePreviewViewDisabledReason(context, draft);
      if (disabledReason || !context.client) {
        throw new Error(disabledReason ?? 'No se pudo generar el albarán.');
      }

      closePreview();
      activeContextRef.current = context;
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewOpen(true);

      const workerLabel = context.workerName?.trim();
      const persistedDraft = Boolean(context.existingDeliveryNote);
      const draftNumber = persistedDraft
        ? context.existingDeliveryNote!.number
        : (draft?.number ?? 'BORRADOR');
      setPreviewTitle(
        workerLabel
          ? persistedDraft
            ? `Albaran ${draftNumber} · ${workerLabel}`
            : `Albaran · ${workerLabel}`
          : persistedDraft
            ? `Albarán ${draftNumber}`
            : 'Albarán',
      );

      try {
        const settings = await workspaceBillingSettingsService.get();
        const companySettings = await resolveWorkspaceBillingSettings(settings);
        const doc =
          buildPreviewDocument(context, companySettings.defaultTaxRate) ??
          draft ??
          (context.existingDeliveryNote ?? null);
        if (!doc) {
          throw new Error('No se pudo generar el albarán.');
        }
        const persisted = Boolean(context.existingDeliveryNote);

        let url: string;
        if (persisted && context.existingDeliveryNote) {
          try {
            // Blob autenticado: el visor no puede cargar URLs S3 firmadas por CORS.
            url = await documentsService.getPdfObjectUrl(context.existingDeliveryNote.id);
          } catch {
            url = getDocumentPdfLocalObjectUrl(doc, context.client, companySettings);
          }
        } else {
          url = getDocumentPdfLocalObjectUrl(doc, context.client, companySettings);
        }

        const number = persisted ? context.existingDeliveryNote!.number : doc.number;
        setPreviewTitle(
          workerLabel
            ? persisted
              ? `Albaran ${number} · ${workerLabel}`
              : `Albaran · ${workerLabel}`
            : persisted
              ? `Albarán ${number}`
              : 'Albarán',
        );
        setPreviewHint(
          persisted
            ? null
            : doc.items.length === 0
              ? 'Pendiente del informe de trabajo del operario'
              : 'Documento en elaboracion segun informes y conceptos actuales',
        );
        setPreviewFileName(`${number.replace(/[^\w.-]+/g, '-')}.pdf`);
        setPreviewDocument(doc);
        setPreviewClient(context.client);
        setPreviewPersisted(persisted);
        setPreviewUrl(url);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo abrir el albaran.';
        setPreviewError(message);
        setPreviewUrl(null);
      } finally {
        setPreviewLoading(false);
      }
    },
    [closePreview],
  );

  const downloadPreview = useCallback(
    async (context: ActivityDeliveryNotePreviewContext) => {
      if (context.existingDeliveryNote && context.client) {
        await downloadDocumentPdf(context.existingDeliveryNote, context.client);
        return;
      }

      const settings = await workspaceBillingSettingsService.get();
      const companySettings = await resolveWorkspaceBillingSettings(settings);
      const doc = buildPreviewDocument(context, companySettings.defaultTaxRate);
      const disabledReason = getActivityDeliveryNotePreviewDownloadDisabledReason(context, doc);
      if (disabledReason || !doc || !context.client) {
        throw new Error(disabledReason ?? 'No se pudo descargar el albarán.');
      }
      downloadDocumentPdfLocally(doc, context.client, companySettings);
    },
    [],
  );

  const downloadActivePreview = useCallback(async () => {
    const context = activeContextRef.current;
    if (!context) {
      throw new Error('No hay albaran abierto para descargar.');
    }
    await downloadPreview(context);
  }, [downloadPreview]);

  return {
    previewOpen,
    previewUrl,
    previewLoading,
    previewError,
    previewTitle,
    previewHint,
    previewFileName,
    previewDocument,
    previewClient,
    previewPersisted,
    closePreview,
    openPreview,
    downloadPreview,
    downloadActivePreview,
  };
}
