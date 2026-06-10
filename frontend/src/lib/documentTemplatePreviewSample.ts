import type { Client, Document, DocumentTemplateId, WorkspaceBillingSettings } from '@shared/types';

export const DOCUMENT_TEMPLATE_PREVIEW_CLIENT: Client = {
  id: 'template-preview-client',
  workspaceId: 'template-preview',
  groupId: 'template-preview',
  name: 'Cliente Ejemplo S.L.',
  email: 'cliente@ejemplo.com',
  phone: '600 000 000',
  address: 'Calle Mayor 12',
  city: 'Madrid',
  postalCode: '28001',
  country: 'Espa\u00f1a',
  state: 'Madrid',
  website: '',
  technicalInfo: '',
  observations: [],
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const DOCUMENT_TEMPLATE_PREVIEW_COMPANY: WorkspaceBillingSettings = {
  id: 'template-preview-company',
  workspaceId: 'template-preview',
  companyName: 'F&H Fauna y Halconeros Servicio Control de Fauna S.L.',
  email: 'info@faunayhalconeros.com',
  address: 'Av. Paisos Catalans, 2 casa 1',
  city: 'El Morell',
  postalCode: '43760',
  country: 'Espana',
  state: 'Tarragona',
  defaultTaxRate: 21,
};

export function buildDocumentTemplatePreviewDocument(
  templateId: DocumentTemplateId,
  templateColor: string,
): Document {
  const items = [
    { name: 'Servicio de consultor\u00eda', description: '', quantity: 2, price: 150 },
    { name: 'Material auxiliar', description: '', quantity: 1, price: 45.5 },
  ];
  const subtotal = 345.5;
  const taxRate = 21;
  const taxAmount = 72.56;
  const total = 418.06;

  return {
    id: 'template-preview',
    workspaceId: 'template-preview',
    type: 'invoice',
    number: 'INV/2026/00069',
    clientId: DOCUMENT_TEMPLATE_PREVIEW_CLIENT.id,
    date: '2025-06-05',
    items,
    subtotal,
    taxRate,
    taxAmount,
    total,
    status: 'sent',
    templateId,
    templateColor,
    createdAt: '2025-06-05T00:00:00.000Z',
  };
}
