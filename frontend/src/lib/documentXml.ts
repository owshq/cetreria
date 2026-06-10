import type { Client, Document, WorkspaceBillingSettings } from '@shared/types';
import { buildDocumentXmlBytes, documentXmlFilename } from '@shared/types';
import { downloadDocumentXmlById, triggerBlobDownload } from '@/api/documents';

export async function downloadDocumentXml(doc: Document, _client?: Client): Promise<void> {
  await downloadDocumentXmlById(doc.id, documentXmlFilename(doc.number));
}

export function downloadDocumentXmlLocally(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): void {
  const bytes = buildDocumentXmlBytes(doc, client, company);
  const blob = new Blob([bytes], { type: 'application/xml;charset=utf-8' });
  triggerBlobDownload(blob, documentXmlFilename(doc.number), 'application/xml');
}
