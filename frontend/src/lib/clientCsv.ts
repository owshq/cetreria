import type { Client } from '@shared/types';
import { CLIENT_STATUS_LABELS } from '@/lib/clientStatus';

export type ClientImportRow = Omit<Client, 'id' | 'createdAt' | 'observations' | 'groupId'>;

export type DuplicateStrategy = 'skip' | 'create' | 'update';

export interface ImportColumnDetection {
  cliente: boolean;
  contacto: boolean;
  direccion: boolean;
  estado: boolean;
}

export interface ClientImportAnalysis {
  rows: ClientImportRow[];
  columns: ImportColumnDetection;
  duplicates: ImportDuplicate[];
}

export interface ImportDuplicate {
  rowIndex: number;
  lineNumber: number;
  row: ClientImportRow;
  existingClient: Client;
  matchField: 'email' | 'name';
}

const CSV_HEADERS = [
  'nombre',
  'email',
  'teléfono',
  'dirección',
  'web',
  'información técnica',
  'estado',
] as const;

type ImportField = keyof ClientImportRow | 'contact';

const HEADER_MAP: Record<string, ImportField> = {
  nombre: 'name',
  name: 'name',
  cliente: 'name',
  email: 'email',
  correo: 'email',
  telefono: 'phone',
  teléfono: 'phone',
  phone: 'phone',
  contacto: 'contact',
  direccion: 'address',
  dirección: 'address',
  address: 'address',
  web: 'website',
  website: 'website',
  informacion_tecnica: 'technicalInfo',
  'informacion tecnica': 'technicalInfo',
  'información técnica': 'technicalInfo',
  technicalinfo: 'technicalInfo',
  technical_info: 'technicalInfo',
  estado: 'status',
  status: 'status',
};

const STATUS_MAP: Record<string, Client['status']> = {
  active: 'active',
  activo: 'active',
  inactive: 'inactive',
  inactivo: 'inactive',
  potential: 'potential',
  potencial: 'potential',
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: ',' | ';' = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function parseCsvRows(text: string): { delimiter: ',' | ';'; rows: string[][] } {
  const normalized = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      current += char;
      if (char === '"' && normalized[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      current += char;
    } else if (char === '\n') {
      const line = current.replace(/\r$/, '');
      if (line.trim()) rows.push(line);
      current = '';
    } else {
      current += char;
    }
  }

  const lastLine = current.replace(/\r$/, '');
  if (lastLine.trim()) rows.push(lastLine);

  if (rows.length === 0) {
    return { delimiter: ',', rows: [] };
  }

  const delimiter = detectDelimiter(rows[0]);
  return {
    delimiter,
    rows: rows.map((line) => parseCsvLine(line, delimiter)),
  };
}

function parseStatus(value: string): Client['status'] {
  const normalized = value.trim().toLowerCase();
  return STATUS_MAP[normalized] ?? 'active';
}

function parseContact(value: string): { email: string; phone: string } {
  const trimmed = value.trim();
  if (!trimmed) return { email: '', phone: '' };

  const separators = ['|', '/', ';', '\t'];
  for (const sep of separators) {
    if (trimmed.includes(sep)) {
      const parts = trimmed.split(sep).map((part) => part.trim()).filter(Boolean);
      const email = parts.find((part) => part.includes('@')) ?? '';
      const phone = parts.find((part) => part !== email) ?? '';
      return { email, phone };
    }
  }

  if (trimmed.includes('@')) return { email: trimmed, phone: '' };
  return { email: '', phone: trimmed };
}

function mapHeader(header: string): ImportField | undefined {
  const normalized = normalizeHeader(header);
  return HEADER_MAP[normalized] ?? HEADER_MAP[header.trim().toLowerCase()];
}

function detectColumns(columnMap: (ImportField | undefined)[]): ImportColumnDetection {
  const hasField = (fields: ImportField[]) => columnMap.some((field) => field && fields.includes(field));

  return {
    cliente: hasField(['name']),
    contacto: hasField(['contact', 'email', 'phone']),
    direccion: hasField(['address']),
    estado: hasField(['status']),
  };
}

function emptyImportRow(): ClientImportRow {
  return {
    name: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    technicalInfo: '',
    status: 'active',
  };
}

function getDuplicateKey(row: ClientImportRow): { key: string; field: 'email' | 'name' } | null {
  const email = row.email.trim().toLowerCase();
  if (email) return { key: `email:${email}`, field: 'email' };

  const name = row.name.trim().toLowerCase();
  if (name) return { key: `name:${name}`, field: 'name' };

  return null;
}

function findExistingClient(
  row: ClientImportRow,
  byEmail: Map<string, Client>,
  byName: Map<string, Client>,
): { client: Client; field: 'email' | 'name' } | null {
  const email = row.email.trim().toLowerCase();
  if (email) {
    const client = byEmail.get(email);
    if (client) return { client, field: 'email' };
  }

  const name = row.name.trim().toLowerCase();
  if (name) {
    const client = byName.get(name);
    if (client) return { client, field: 'name' };
  }

  return null;
}

export function findImportDuplicates(
  rows: ClientImportRow[],
  existingClients: Client[],
): ImportDuplicate[] {
  const byEmail = new Map<string, Client>();
  const byName = new Map<string, Client>();

  for (const client of existingClients) {
    const email = client.email.trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, client);

    const name = client.name.trim().toLowerCase();
    if (name && !byName.has(name)) byName.set(name, client);
  }

  const duplicates: ImportDuplicate[] = [];
  const seenInFile = new Map<string, ClientImportRow>();

  rows.forEach((row, rowIndex) => {
    const duplicateKey = getDuplicateKey(row);
    if (!duplicateKey) return;

    const existing = findExistingClient(row, byEmail, byName);
    if (existing) {
      duplicates.push({
        rowIndex,
        lineNumber: rowIndex + 2,
        row,
        existingClient: existing.client,
        matchField: existing.field,
      });
      return;
    }

    const priorInFile = seenInFile.get(duplicateKey.key);
    if (priorInFile) {
      duplicates.push({
        rowIndex,
        lineNumber: rowIndex + 2,
        row,
        existingClient: {
          id: '',
          name: priorInFile.name,
          email: priorInFile.email,
          phone: priorInFile.phone,
          address: priorInFile.address,
          website: priorInFile.website,
          technicalInfo: priorInFile.technicalInfo,
          observations: [],
          status: priorInFile.status,
          createdAt: '',
        },
        matchField: duplicateKey.field,
      });
      return;
    }

    seenInFile.set(duplicateKey.key, row);
  });

  return duplicates;
}

export function analyzeClientsCsv(text: string): ClientImportAnalysis {
  const { rows } = parseCsvRows(text);
  if (rows.length < 2) {
    throw new Error('El archivo CSV no contiene datos.');
  }

  const [headerRow, ...dataRows] = rows;
  const columnMap = headerRow.map((header) => mapHeader(header));
  const columns = detectColumns(columnMap);

  const parsedRows = dataRows.map((row) => {
    const record = emptyImportRow();

    columnMap.forEach((field, columnIndex) => {
      if (!field) return;
      const value = (row[columnIndex] ?? '').trim();

      if (field === 'contact') {
        const contact = parseContact(value);
        if (contact.email) record.email = contact.email;
        if (contact.phone) record.phone = contact.phone;
      } else if (field === 'status') {
        record.status = parseStatus(value);
      } else {
        record[field] = value;
      }
    });

    return record;
  });

  return {
    rows: parsedRows,
    columns,
    duplicates: [],
  };
}

export function applyImportStatus(
  rows: ClientImportRow[],
  status: Client['status'],
): ClientImportRow[] {
  return rows.map((row) => ({ ...row, status }));
}

export function clientsToCsv(clients: Client[]): string {
  const delimiter = ';';
  const lines = [
    CSV_HEADERS.map((header) => escapeCsvField(header)).join(delimiter),
    ...clients.map((client) =>
      [
        client.name,
        client.email,
        client.phone,
        client.address,
        client.website ?? '',
        client.technicalInfo ?? '',
        CLIENT_STATUS_LABELS[client.status],
      ]
        .map((value) => escapeCsvField(value))
        .join(delimiter),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadClientsCsv(clients: Client[], filename = 'contactos.csv'): void {
  downloadCsvFile(clientsToCsv(clients), filename);
}

const SAMPLE_IMPORT_ROWS = [
  [
    'Acme SA',
    'info@acme.com',
    '+34 600 111 222',
    'Calle Mayor 1, Madrid',
    'https://acme.com',
    'Cliente preferente',
    'Activo',
  ],
  [
    'Beta SL',
    'contacto@beta.es',
    '+34 600 333 444',
    'Av. Test 2, Barcelona',
    '',
    '',
    'Potencial',
  ],
] as const;

export function sampleClientsCsv(): string {
  const delimiter = ';';
  const lines = [
    CSV_HEADERS.map((header) => escapeCsvField(header)).join(delimiter),
    ...SAMPLE_IMPORT_ROWS.map((row) => row.map((value) => escapeCsvField(value)).join(delimiter)),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadSampleClientsCsv(filename = 'contactos_ejemplo.csv'): void {
  downloadCsvFile(sampleClientsCsv(), filename);
}

function downloadCsvFile(csvContent: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 100);
}

/** @deprecated Use analyzeClientsCsv for import with optional columns and duplicate handling. */
export function parseClientsCsv(text: string): ClientImportRow[] {
  const analysis = analyzeClientsCsv(text);
  return analysis.rows.map((row, index) => {
    const lineNumber = index + 2;
    if (!row.name.trim()) {
      throw new Error(`Fila ${lineNumber}: falta el nombre.`);
    }
    if (!row.email.trim()) {
      throw new Error(`Fila ${lineNumber}: falta el email.`);
    }
    if (!row.phone.trim()) {
      throw new Error(`Fila ${lineNumber}: falta el teléfono.`);
    }
    if (!row.address.trim()) {
      throw new Error(`Fila ${lineNumber}: falta la dirección.`);
    }
    return row;
  });
}
