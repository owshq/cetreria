import type { Document, WorkspaceBillingSettings } from '@shared/types';
import { resolveDocumentDisplayName } from '@shared/types';

export function getDocumentDisplayName(
  document: Pick<Document, 'type' | 'number' | 'date' | 'displayName'>,
  clientName: string,
  billingSettings?: Pick<WorkspaceBillingSettings, 'documentFormats'> | null,
): string {
  return resolveDocumentDisplayName(document, clientName, billingSettings?.documentFormats);
}
