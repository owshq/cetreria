import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'shared/assets/document-brand');
const logo = fs.readFileSync(path.join(brandDir, 'icon-logo-docs.png')).toString('base64');
const iso = fs.readFileSync(path.join(brandDir, 'icon-iso.png')).toString('base64');

const content = `/** Logos embebidos para PDF de documentos (factura / albaran). */
export const DOCUMENT_LOGO_DOCS_DATA_URL = 'data:image/png;base64,${logo}';
export const DOCUMENT_ISO_LOGO_DATA_URL = 'data:image/png;base64,${iso}';
`;

fs.writeFileSync(path.join(root, 'shared/documentPdfBrandAssets.ts'), content);
console.log('OK', content.length, 'bytes');
