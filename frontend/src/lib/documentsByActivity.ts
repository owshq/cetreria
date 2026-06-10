import type { Document } from '@shared/types';

export function buildDocumentsByActivity(documents: Document[]): Map<string, Document[]> {
  const map = new Map<string, Document[]>();
  for (const doc of documents) {
    if (!doc.activityId) continue;
    const list = map.get(doc.activityId) ?? [];
    list.push(doc);
    map.set(doc.activityId, list);
  }
  return map;
}
