import { mimeTypeToExtension } from '@shared/types';
import { getDocumentStorage } from '../storage/index.js';

export function buildWorkReportZoneImageStorageKey(
  workspaceId: string,
  activityId: string,
  userId: string,
  zoneId: string,
  imageId: string,
  mimeType: string,
): string {
  const ext = mimeTypeToExtension(mimeType) ?? 'bin';
  return `work-reports/${workspaceId}/${activityId}/${userId}/${zoneId}/${imageId}.${ext}`;
}

export async function uploadWorkReportZoneImageFile(
  storageKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await getDocumentStorage().upload(storageKey, body, contentType);
}

export async function downloadWorkReportZoneImageFile(
  storageKey: string,
): Promise<Uint8Array | null> {
  return getDocumentStorage().download(storageKey);
}

export async function deleteWorkReportZoneImageFile(storageKey: string): Promise<void> {
  await getDocumentStorage().delete(storageKey);
}
