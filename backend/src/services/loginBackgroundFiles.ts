import { mimeTypeToExtension } from '@shared/types';
import { getDocumentStorage } from '../storage/index.js';

export function buildLoginBackgroundStorageKey(
  workspaceId: string,
  imageId: string,
  mimeType: string,
): string {
  const ext = mimeTypeToExtension(mimeType) ?? 'bin';
  return `login-bg/${workspaceId}/${imageId}.${ext}`;
}

export async function uploadLoginBackgroundFile(
  storageKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await getDocumentStorage().upload(storageKey, body, contentType);
}

export async function downloadLoginBackgroundFile(
  storageKey: string,
): Promise<Uint8Array | null> {
  return getDocumentStorage().download(storageKey);
}

export async function deleteLoginBackgroundFile(storageKey: string): Promise<void> {
  await getDocumentStorage().delete(storageKey);
}
