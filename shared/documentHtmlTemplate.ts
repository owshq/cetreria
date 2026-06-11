import { addMonths, format } from 'date-fns';
import type {
  Client,
  Document,
  DocumentBillingAddress,
  DocumentPdfSigner,
  WorkspaceBillingSettings,
} from './types.js';
import {
  DOCUMENT_TYPE_LABELS,
  billingAddressFromClient,
  resolveDocumentTotals,
} from './documents.js';
import { formatDateSafe, parseDateSafe } from './dateUtils.js';
import { resolveDocumentFooterText } from './documentFooter.js';
import { resolveDocumentLogoDataUrl } from './documentLogo.js';
import { normalizeTemplateColor } from './documentTemplates.js';
import { DOCUMENT_ISO_LOGO_DATA_URL } from './documentPdfBrandAssets.js';
import { buildVerifactuQrSectionHtml } from './documentVerifactuQr.js';

export const DOCUMENT_HTML_TEMPLATE_PLACEHOLDERS = [
  '{{accentColor}}',
  '{{logoDocs}}',
  '{{logoIso}}',
  '{{documentType}}',
  '{{documentNumber}}',
  '{{documentTitle}}',
  '{{documentDate}}',
  '{{documentDateLabel}}',
  '{{dueDate}}',
  '{{dueDateSection}}',
  '{{documentStatus}}',
  '{{companyName}}',
  '{{companyEmail}}',
  '{{companyAddress}}',
  '{{companyCityLine}}',
  '{{clientName}}',
  '{{clientEmail}}',
  '{{clientAddress}}',
  '{{clientCityLine}}',
  '{{clientTaxId}}',
  '{{itemsRows}}',
  '{{subtotal}}',
  '{{taxRate}}',
  '{{taxAmount}}',
  '{{total}}',
  '{{paymentNote}}',
  '{{notes}}',
  '{{notesSection}}',
  '{{footerText}}',
  '{{verifactuQrSection}}',
] as const;

export const DEFAULT_DOCUMENT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Helvetica, Arial, sans-serif; color: #404040; margin: 0; padding: 24px; font-size: 12px; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .header-logo img { display: block; max-width: 220px; max-height: 72px; width: auto; height: auto; object-fit: contain; }
    .company { text-align: right; font-size: 11px; }
    .company strong { display: block; font-size: 12px; margin-bottom: 4px; }
    .client { margin: 0 0 18px auto; width: 240px; font-size: 11px; }
    .client strong { display: block; font-size: 12px; margin-bottom: 4px; }
    h1 { margin: 0 0 10px; font-size: 24px; color: #404040; font-weight: 700; }
    .dates { display: flex; gap: 40px; margin-bottom: 18px; }
    .meta-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 16px; }
    .meta-row .dates { margin-bottom: 0; }
    .verifactu-qr { margin-left: auto; text-align: center; font-size: 7px; color: #737373; flex-shrink: 0; line-height: 1.2; }
    .verifactu-qr img { display: block; width: 54px; height: 54px; margin: 0 auto 2px; }
    .verifactu-qr-label { font-size: 7px; letter-spacing: 0.02em; }
    .date-block span { display: block; color: #c48830; font-size: 10px; font-weight: 700; margin-bottom: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; font-size: 8px; text-transform: uppercase; background: #f0f0f0; border: 1px solid #d2d2d2; padding: 7px 5px; white-space: nowrap; }
    th.col-qty { width: 52px; text-align: center; }
    th.col-price { width: 72px; text-align: right; }
    th.col-tax { width: 52px; text-align: center; }
    th.col-total { width: 72px; text-align: right; }
    td { padding: 7px 6px; border: 1px solid #e5e5e5; vertical-align: top; font-size: 11px; }
    td.item-concept { line-height: 1.25; }
    .item-name { display: block; font-weight: 700; line-height: 1.25; }
    .item-desc { display: block; margin-top: 3px; color: #737373; font-size: 10px; font-weight: 400; line-height: 1.3; }
    .num { text-align: right; white-space: nowrap; }
    .center { text-align: center; white-space: nowrap; }
    .bottom { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; }
    .payment { width: 45%; font-size: 11px; }
    .totals { width: 240px; margin-left: auto; font-size: 11px; }
    .totals div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }
    .totals .grand { margin-top: 4px; padding: 8px 10px; background: #5e6a37; color: #fff; font-size: 13px; font-weight: 700; }
    .footer { margin-top: 28px; border-top: 1px solid #e5e5e5; padding-top: 10px; font-size: 8px; color: #737373; }
    .footer-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; }
    .seal { display: flex; align-items: center; gap: 8px; color: #404040; font-size: 10px; }
    .seal img { width: 36px; height: auto; }
    .notes h2 { margin: 0 0 6px; font-size: 10px; color: #c48830; text-transform: uppercase; }
    .notes p { margin: 0; color: #737373; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo"><img src="{{logoDocs}}" alt="Logo" /></div>
    <div class="company">
      <strong>{{companyName}}</strong>
      <div>{{companyAddress}}</div>
      <div>{{companyCityLine}}</div>
      <div>{{companyEmail}}</div>
    </div>
  </div>

  <div class="client">
    <strong>{{clientName}}</strong>
    <div>{{clientAddress}}</div>
    <div>{{clientCityLine}}</div>
    <div>{{clientTaxId}}</div>
  </div>

  <h1>{{documentTitle}}</h1>
  <div class="meta-row">
    <div class="dates">
      <div class="date-block">
        <span>{{documentDateLabel}}</span>
        {{documentDate}}
      </div>
      {{dueDateSection}}
    </div>
    {{verifactuQrSection}}
  </div>

  <table>
    <thead>
      <tr>
        <th>Descripcion</th>
        <th class="col-qty">Cant.</th>
        <th class="col-price">P. unit.</th>
        <th class="col-tax">IVA</th>
        <th class="col-total">Importe</th>
      </tr>
    </thead>
    <tbody>
      {{itemsRows}}
    </tbody>
  </table>

  <div class="bottom">
    <div class="payment">{{paymentNote}}</div>
    <div class="totals">
      <div><span>Importe base</span><span>{{subtotal}}</span></div>
      <div><span>IVA {{taxRate}}%</span><span>{{taxAmount}}</span></div>
      <div class="grand"><span>Total</span><span>{{total}}</span></div>
    </div>
  </div>

  {{notesSection}}

  <div class="footer">
    <div>{{footerText}}</div>
    <div class="footer-bottom">
      <div class="seal"><span>Sello de calidad:</span><img src="{{logoIso}}" alt="ISO 9001" /></div>
      <div>Pagina: 1/1</div>
    </div>
  </div>
</body>
</html>`;

const STATUS_LABELS: Record<Document['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  paid: 'Pagada',
};

function resolveBillingAddress(doc: Document, client: Client): DocumentBillingAddress {
  if (doc.billingAddress) return doc.billingAddress;
  return billingAddressFromClient(client);
}

function buildCityLine(parts: {
  postalCode?: string;
  city?: string;
  state?: string;
  country?: string;
}): string {
  const cityLine = [parts.postalCode, parts.city].filter(Boolean).join(' ').trim();
  const regionLine = [parts.state, parts.country].filter(Boolean).join(', ').trim();
  return [cityLine, regionLine].filter(Boolean).join(' � ');
}

function buildCompanyLines(company?: WorkspaceBillingSettings | null): {
  name: string;
  email: string;
  address: string;
  cityLine: string;
} {
  return {
    name: company?.companyName?.trim() || 'Mi empresa',
    email: company?.email?.trim() || '',
    address: company?.address?.trim() || '',
    cityLine: buildCityLine({
      postalCode: company?.postalCode,
      city: company?.city,
      state: company?.state,
      country: company?.country,
    }),
  };
}

function resolveClientTaxId(client: Client): string {
  const fields = client.customFields ?? {};
  for (const [key, value] of Object.entries(fields)) {
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey === 'nif' || normalizedKey === 'cif' || normalizedKey === 'dni') {
      const trimmed = value.trim();
      if (trimmed) return `NIF: ${trimmed}`;
    }
  }
  return '';
}

function resolveDueDate(doc: Document): string | null {
  if (doc.type !== 'invoice') return null;
  const parsed = parseDateSafe(doc.date);
  if (!parsed) return null;
  return format(addMonths(parsed, 1), 'dd/MM/yyyy');
}

function formatMoneyEs(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} \u20AC`;
}

function buildItemsRowsHtml(doc: Document, taxRate: number): string {
  return doc.items
    .map((item) => {
      const name = item.name?.trim();
      const description = item.description?.trim();
      const label = name || description || '\u2014';
      const descriptionHtml =
        name && description
          ? `<span class="item-desc">${escapeHtml(description)}</span>`
          : '';
      const lineTotal = item.quantity * item.price;
      return `<tr>
        <td class="item-concept"><span class="item-name">${escapeHtml(label)}</span>${descriptionHtml}</td>
        <td class="center">${item.quantity.toFixed(2)}</td>
        <td class="num">${formatMoneyEs(item.price)}</td>
        <td class="center">${taxRate}%</td>
        <td class="num"><strong>${formatMoneyEs(lineTotal)}</strong></td>
      </tr>`;
    })
    .join('\n');
}

function buildNotesSectionHtml(notes?: string): string {
  const trimmed = notes?.trim();
  if (!trimmed) return '';
  return `<section class="notes">
    <h2>Notas</h2>
    <p>${escapeHtml(trimmed)}</p>
  </section>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fillDocumentHtmlTemplate(
  templateHtml: string,
  doc: Document,
  client: Client,
  company?: WorkspaceBillingSettings | null,
  _signer?: DocumentPdfSigner | null,
): string {
  const accentColor = normalizeTemplateColor(doc.templateColor);
  const totals = resolveDocumentTotals(doc);
  const billing = resolveBillingAddress(doc, client);
  const companyLines = buildCompanyLines(company);
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type];
  const dueDate = resolveDueDate(doc);
  const dateLabel =
    doc.type === 'invoice' ? 'Fecha de factura:' : 'Fecha de albaran:';

  const replacements: Record<string, string> = {
    '{{accentColor}}': accentColor,
    '{{logoDocs}}': resolveDocumentLogoDataUrl(company),
    '{{logoIso}}': DOCUMENT_ISO_LOGO_DATA_URL,
    '{{documentType}}': typeLabel.toUpperCase(),
    '{{documentNumber}}': doc.number,
    '{{documentTitle}}': `${typeLabel} ${doc.number}`,
    '{{documentDate}}': formatDateSafe(doc.date, 'dd/MM/yyyy'),
    '{{documentDateLabel}}': dateLabel,
    '{{dueDate}}': dueDate ?? '',
    '{{dueDateSection}}': dueDate
      ? `<div class="date-block"><span>Fecha de vencimiento</span>${dueDate}</div>`
      : '',
    '{{documentStatus}}': STATUS_LABELS[doc.status].toUpperCase(),
    '{{companyName}}': escapeHtml(companyLines.name),
    '{{companyEmail}}': escapeHtml(companyLines.email),
    '{{companyAddress}}': escapeHtml(companyLines.address),
    '{{companyCityLine}}': escapeHtml(companyLines.cityLine),
    '{{clientName}}': escapeHtml(billing.name?.trim() || client.name?.trim() || ''),
    '{{clientEmail}}': escapeHtml(billing.email?.trim() || client.email?.trim() || ''),
    '{{clientAddress}}': escapeHtml(billing.address?.trim() || client.address?.trim() || ''),
    '{{clientCityLine}}': escapeHtml(
      buildCityLine({
        postalCode: billing.postalCode || client.postalCode,
        city: billing.city || client.city,
        state: billing.state || client.state,
        country: billing.country || client.country,
      }),
    ),
    '{{clientTaxId}}': escapeHtml(resolveClientTaxId(client)),
    '{{itemsRows}}': buildItemsRowsHtml(doc, totals.taxRate),
    '{{subtotal}}': formatMoneyEs(totals.subtotal),
    '{{taxRate}}': String(totals.taxRate),
    '{{taxAmount}}': formatMoneyEs(totals.taxAmount),
    '{{total}}': formatMoneyEs(totals.total),
    '{{paymentNote}}': escapeHtml(`Comunicaciones de pago ${doc.number} en esta cuenta:`),
    '{{notes}}': escapeHtml(doc.notes?.trim() || ''),
    '{{notesSection}}': buildNotesSectionHtml(doc.notes),
    '{{footerText}}': escapeHtml(resolveDocumentFooterText(company)),
    '{{verifactuQrSection}}': buildVerifactuQrSectionHtml(doc, company),
  };

  let html = templateHtml;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}

export function htmlToPdfLines(html: string): string[] {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<\/t(d|h)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return withBreaks
    .split('\n')
    .map((line) => line.replace(/\t+/g, '  ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}
