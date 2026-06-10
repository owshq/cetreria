import type { Activity, CalendarEvent, Document } from '@shared/types';
import {
  activityHasLinkedDeliveryNoteForPair,
  canEditActivity,
  canManageFinishedActivityDocuments,
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
