import type { Document, WorkspaceBillingSettings } from '@shared/types';
import { buildDocumentDisplayNameForDocument } from '@shared/types';

export function getDocumentDisplayName(
  document: Pick<Document, 'type' | 'number' | 'date'>,
  clientName: string,
  billingSettings?: Pick<WorkspaceBillingSettings, 'documentFormats'> | null,
): string {
  return buildDocumentDisplayNameForDocument(
    billingSettings?.documentFormats,
    document,
    clientName,
  );
}
