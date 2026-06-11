import type { Activity, ActivityType, Document } from '@shared/types';
import { validateDocumentActivityLink } from '@shared/types';

export function getDocumentActivityLinkError(
  doc: Document,
  activity: Activity,
  documents: readonly Document[],
  activityTypes: readonly ActivityType[],
): string | null {
  return validateDocumentActivityLink(doc, activity, documents, { activityTypes });
}

export function logDocumentActivityLinkBlock(
  doc: Document,
  activity: Activity,
  reason: string,
): void {
  console.warn('[vincular-actividad]', {
    documentId: doc.id,
    documentNumber: doc.number,
    documentType: doc.type,
    activityId: activity.id,
    activityDate: activity.date,
    reason,
  });
}
