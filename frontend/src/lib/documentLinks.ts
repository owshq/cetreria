import { documentsService } from '@/api';
import type { Document } from '@shared/types';
import {
  validateActivityInvoiceRequiresDeliveryNote,
  validateSingleActivityInvoice,
} from '@shared/types';

/** Sincroniza facturas/albaranes vinculados a una actividad. */
export async function syncActivityDocumentLinks(
  activityId: string,
  selectedDocumentIds: string[],
  clientDocuments: Document[],
): Promise<void> {
  const linkError = validateActivityInvoiceRequiresDeliveryNote(
    clientDocuments,
    activityId,
    selectedDocumentIds,
  );
  if (linkError) {
    throw new Error(linkError);
  }

  const singleInvoiceError = validateSingleActivityInvoice(
    clientDocuments,
    activityId,
    selectedDocumentIds,
  );
  if (singleInvoiceError) {
    throw new Error(singleInvoiceError);
  }

  const selected = new Set(selectedDocumentIds);
  const deliveryNoteUpdates: Promise<unknown>[] = [];
  const invoiceUpdates: Promise<unknown>[] = [];
  const otherUpdates: Promise<unknown>[] = [];

  for (const doc of clientDocuments) {
    if (doc.type !== 'invoice' && doc.type !== 'delivery-note') continue;

    const shouldLink = selected.has(doc.id);
    const isLinked = doc.activityId === activityId;

    if (shouldLink && !isLinked) {
      const update = documentsService.update(doc.id, { activityId });
      if (doc.type === 'delivery-note') {
        deliveryNoteUpdates.push(update);
      } else {
        invoiceUpdates.push(update);
      }
    } else if (!shouldLink && isLinked) {
      const update = documentsService.update(doc.id, { activityId: null });
      if (doc.type === 'delivery-note') {
        deliveryNoteUpdates.push(update);
      } else if (doc.type === 'invoice') {
        invoiceUpdates.push(update);
      } else {
        otherUpdates.push(update);
      }
    }
  }

  await Promise.all(deliveryNoteUpdates);
  await Promise.all(invoiceUpdates);
  await Promise.all(otherUpdates);
}
