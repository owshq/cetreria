import { mimeTypeToExtension } from '@shared/types';
import { getDocumentStorage } from '../storage/index.js';

export function buildActivityAttachmentStorageKey(
  workspaceId: string,
  activityId: string,
  attachmentId: string,
  mimeType: string,
): string {
  const ext = mimeTypeToExtension(mimeType) ?? 'bin';
  return `activity-attachments/${workspaceId}/${activityId}/${attachmentId}.${ext}`;
}

export async function uploadActivityAttachmentFile(
  storageKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await getDocumentStorage().upload(storageKey, body, contentType);
}

export async function downloadActivityAttachmentFile(
  storageKey: string,
): Promise<Uint8Array | null> {
  return getDocumentStorage().download(storageKey);
}

export async function deleteActivityAttachmentFile(storageKey: string): Promise<void> {
  await getDocumentStorage().delete(storageKey);
}
