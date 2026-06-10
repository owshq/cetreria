import type { Client, Document, DocumentBillingAddress, WorkspaceBillingSettings } from './types.js';
import {
  DOCUMENT_TYPE_LABELS,
  billingAddressFromClient,
  resolveDocumentTotals,
} from './documents.js';

const DOCUMENT_XML_NAMESPACE = 'https://crm-cetreria.local/schema/document/v1';

const STATUS_LABELS: Record<Document['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  paid: 'Pagada',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return escapeXml(String(value));
}

function xmlElement(
  name: string,
  value: string | number | null | undefined,
  indent = '',
): string {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (!text) return '';
  return `${indent}<${name}>${xmlText(text)}</${name}>\n`;
}

function appendAddressBlock(
  tag: string,
  address: {
    name?: string;
    companyName?: string;
    email?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    state?: string;
    country?: string;
  },
  indent: string,
): string {
  const lines = [
    xmlElement('Name', address.companyName ?? address.name),
    xmlElement('Email', address.email),
    xmlElement('Address', address.address),
    xmlElement('City', address.city),
    xmlElement('PostalCode', address.postalCode),
    xmlElement('State', address.state),
    xmlElement('Country', address.country),
  ].join('');

  if (!lines.trim()) return '';
  return `${indent}<${tag}>\n${lines}${indent}</${tag}>\n`;
}

export function documentXmlFilename(number: string): string {
  const base = number.trim() || 'documento';
  return base.toLowerCase().endsWith('.xml') ? base : `${base}.xml`;
}

export function buildDocumentXml(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): string {
  const billing = doc.billingAddress ?? billingAddressFromClient(client);
  const totals = resolveDocumentTotals(doc);
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
  const statusLabel = STATUS_LABELS[doc.status];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<Document xmlns="${DOCUMENT_XML_NAMESPACE}">\n`;
  xml += '  <Metadata>\n';
  xml += xmlElement('Id', doc.id, '    ');
  xml += xmlElement('WorkspaceId', doc.workspaceId, '    ');
  xml += xmlElement('Type', doc.type, '    ');
  xml += xmlElement('TypeLabel', typeLabel, '    ');
  xml += xmlElement('Number', doc.number, '    ');
  xml += xmlElement('Date', doc.date, '    ');
  xml += xmlElement('Status', doc.status, '    ');
  xml += xmlElement('StatusLabel', statusLabel, '    ');
  xml += xmlElement('CreatedAt', doc.createdAt, '    ');
  if (doc.activityId) {
    xml += xmlElement('ActivityId', doc.activityId, '    ');
  }
  xml += '  </Metadata>\n';

  if (company?.companyName?.trim()) {
    xml += appendAddressBlock('Issuer', company, '  ');
  }

  xml += appendAddressBlock('Customer', billing, '  ');
  xml += xmlElement('ClientId', doc.clientId, '  ');

  xml += '  <Lines>\n';
  doc.items.forEach((item, index) => {
    const quantity = item.quantity;
    const unitPrice = item.price;
    const lineTotal = Math.round(quantity * unitPrice * 100) / 100;
    xml += '    <Line>\n';
    xml += xmlElement('Index', index + 1, '      ');
    xml += xmlElement('Name', item.name, '      ');
    xml += xmlElement('Description', item.description, '      ');
    xml += xmlElement('Quantity', quantity.toFixed(2), '      ');
    xml += xmlElement('UnitPrice', unitPrice.toFixed(2), '      ');
    xml += xmlElement('LineTotal', lineTotal.toFixed(2), '      ');
    xml += '    </Line>\n';
  });
  xml += '  </Lines>\n';

  xml += '  <Totals>\n';
  xml += xmlElement('Subtotal', totals.subtotal.toFixed(2), '    ');
  xml += xmlElement('TaxRate', totals.taxRate.toFixed(2), '    ');
  xml += xmlElement('TaxAmount', totals.taxAmount.toFixed(2), '    ');
  xml += xmlElement('Total', totals.total.toFixed(2), '    ');
  xml += xmlElement('Currency', 'EUR', '    ');
  xml += '  </Totals>\n';

  if (doc.notes?.trim()) {
    xml += xmlElement('Notes', doc.notes, '  ');
  }

  xml += '</Document>\n';
  return xml;
}

export function buildDocumentXmlBytes(
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
): Uint8Array {
  return new TextEncoder().encode(buildDocumentXml(doc, client, company));
}
