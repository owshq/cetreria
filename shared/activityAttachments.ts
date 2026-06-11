export const MAX_ACTIVITY_ATTACHMENTS = 20;

export interface ActivityAttachment {
  id: string;
  storageKey: string;
  mimeType: string;
  filename: string;
  uploadedAt: string;
  uploadedByUserId: string;
}

export function normalizeActivityAttachments(
  attachments: readonly (ActivityAttachment | string)[] | undefined,
): ActivityAttachment[] {
  if (!attachments?.length) return [];
  return attachments.flatMap((item) => {
    if (typeof item !== 'object' || item === null || typeof item.id !== 'string') return [];
    if (!item.storageKey || !item.mimeType || !item.filename) return [];
    return [
      {
        id: item.id,
        storageKey: item.storageKey,
        mimeType: item.mimeType,
        filename: item.filename,
        uploadedAt: item.uploadedAt ?? '',
        uploadedByUserId: item.uploadedByUserId ?? '',
      },
    ];
  });
}

export function findActivityAttachment(
  attachments: readonly ActivityAttachment[],
  attachmentId: string,
): ActivityAttachment | null {
  return attachments.find((item) => item.id === attachmentId) ?? null;
}
