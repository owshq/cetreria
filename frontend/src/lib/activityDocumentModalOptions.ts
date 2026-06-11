import type { Activity, ActivityType, CalendarEvent, Document } from '@shared/types';
import {
  activityHasLinkedDeliveryNoteForPair,
  activityTypeCreatesDeliveryNote,
  allAssigneesSubmittedWorkReports,
  allSubmittedAssigneesHaveDeliveryNotes,
  canEditActivity,
  canManageFinishedActivityDocuments,
  invoiceMatchesActivityDeliveryNotes,
  resolveActivityType,
} from '@shared/types';
import type { OpenActivityModalOptions } from '@/context/activityModalContext';

export function activityHasLinkedDeliveryNote(documents: readonly Document[]): boolean {
  return documents.some((doc) => doc.type === 'delivery-note');
}

export { activityHasLinkedDeliveryNoteForPair };

export function canAssociateActivityDeliveryNote(
  user: { id: string; role: 'admin' | 'user' } | null | undefined,
  activity: Activity,
  linkedDocuments: readonly Document[],
  event?: CalendarEvent | null,
): boolean {
  if (!user) return false;
  if (activityHasLinkedDeliveryNote(linkedDocuments)) return false;
  if (canEditActivity(user, { activity, event: event ?? null })) return true;
  return canManageFinishedActivityDocuments(user, { activity, event: event ?? null });
}

export function canCreateActivityDeliveryNote(
  user: { id: string; role: 'admin' | 'user' } | null | undefined,
  activity: Activity,
  linkedDocuments: readonly Document[],
  activityTypes: readonly ActivityType[],
  event?: CalendarEvent | null,
): boolean {
  const resolvedType = resolveActivityType(activity.type, activityTypes);
  if (!activityTypeCreatesDeliveryNote(resolvedType)) return false;
  return canAssociateActivityDeliveryNote(user, activity, linkedDocuments, event);
}

export function canAdminGenerateActivityInvoice(
  user: { role: 'admin' | 'user' } | null | undefined,
  activity: Activity,
  deliveryNotes: readonly Document[],
  existingInvoice: Document | null | undefined,
  event?: CalendarEvent | null,
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (existingInvoice) return false;
  if (deliveryNotes.length === 0) return false;
  if (!allAssigneesSubmittedWorkReports(activity, event ?? null)) return false;
  return allSubmittedAssigneesHaveDeliveryNotes(activity, event ?? null, deliveryNotes);
}

export function canAdminUpdateActivityInvoiceFromDeliveryNotes(
  user: { role: 'admin' | 'user' } | null | undefined,
  invoice: Document | null | undefined,
  deliveryNotes: readonly Document[],
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (!invoice || invoice.type !== 'invoice') return false;
  if (deliveryNotes.length === 0) return false;
  return !invoiceMatchesActivityDeliveryNotes(invoice, deliveryNotes);
}

export function buildActivityDocumentsModalOptions(
  user: { id: string; role: 'admin' | 'user' } | null | undefined,
  activity: Activity,
  event?: CalendarEvent | null,
): OpenActivityModalOptions {
  const useEditMode = Boolean(
    user && canEditActivity(user, { activity, event: event ?? null }),
  );
  return {
    editMode: useEditMode,
    focusSection: 'documents',
  };
}
