import { useCallback, useState } from 'react';
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
  });
}

export function getActivityDeliveryNotePreviewDisabledReason(
  context: ActivityDeliveryNotePreviewContext,
  previewDocument: Document | null,
): string | null {
  const resolvedType = resolveActivityType(context.activity.type, context.activityTypes);
  if (!activityTypeCreatesDeliveryNote(resolvedType)) {
    return 'Este tipo de actividad no genera albarán automáticamente.';
  }
  if (!context.client) return 'Selecciona un contacto para ver el albarán.';
  if (!context.client.email?.trim()) {
    return 'El contacto necesita email para generar el albarán.';
  }
  if (!previewDocument) {
    return 'Añade informes de trabajo o conceptos para ver el albarán.';
  }
  return null;
}

export function useActivityDeliveryNotePreview() {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('Albarán');
  const [previewHint, setPreviewHint] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState('albaran.pdf');
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [previewClient, setPreviewClient] = useState<Client | null>(null);
  const [previewPersisted, setPreviewPersisted] = useState(false);

  const closePreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
      return null;
    });
    setPreviewOpen(false);
    setPreviewDocument(null);
    setPreviewClient(null);
    setPreviewPersisted(false);
  }, []);

  const openPreview = useCallback(
    async (context: ActivityDeliveryNotePreviewContext) => {
      const draft = buildPreviewDocument(context);
      const disabledReason = getActivityDeliveryNotePreviewDisabledReason(context, draft);
      if (disabledReason || !draft || !context.client) {
        throw new Error(disabledReason ?? 'No se pudo generar el albarán.');
      }

      closePreview();
      setPreviewLoading(true);

      try {
        const settings = await workspaceBillingSettingsService.get();
        const companySettings = await resolveWorkspaceBillingSettings(settings);
        const doc = buildPreviewDocument(context, companySettings.defaultTaxRate) ?? draft;
        const persisted = Boolean(context.existingDeliveryNote);

        let url: string;
        if (persisted && context.existingDeliveryNote) {
          try {
            url = await documentsService.getPdfPreviewUrl(context.existingDeliveryNote.id);
          } catch {
            url = getDocumentPdfLocalObjectUrl(doc, context.client, companySettings);
          }
        } else {
          url = getDocumentPdfLocalObjectUrl(doc, context.client, companySettings);
        }

        const number = persisted ? context.existingDeliveryNote!.number : doc.number;
        setPreviewTitle(persisted ? `Albarán ${number}` : 'Albarán');
        setPreviewHint(
          persisted
            ? null
            : 'Documento en elaboracion segun informes y conceptos actuales',
        );
        setPreviewFileName(`${number.replace(/[^\w.-]+/g, '-')}.pdf`);
        setPreviewDocument(doc);
        setPreviewClient(context.client);
        setPreviewPersisted(persisted);
        setPreviewUrl(url);
        setPreviewOpen(true);
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
      const disabledReason = getActivityDeliveryNotePreviewDisabledReason(context, doc);
      if (disabledReason || !doc || !context.client) {
        throw new Error(disabledReason ?? 'No se pudo descargar el albarán.');
      }
      downloadDocumentPdfLocally(doc, context.client, companySettings);
    },
    [],
  );

  return {
    previewOpen,
    previewUrl,
    previewLoading,
    previewTitle,
    previewHint,
    previewFileName,
    previewDocument,
    previewClient,
    previewPersisted,
    closePreview,
    openPreview,
    downloadPreview,
  };
}
