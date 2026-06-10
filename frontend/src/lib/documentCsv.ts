import type { Client, Document } from '@shared/types';
import { DOCUMENT_TYPE_LABELS, getDocumentFormatLabel } from '@shared/types';
import { DOCUMENT_STATUS_LABELS } from '@/lib/documentStatus';

const CSV_HEADERS = [
  'número',
  'tipo',
  'formato',
  'contacto',
  'fecha',
  'total',
  'estado',
] as const;

function escapeCsvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function documentsToCsv(
  documents: Document[],
  clientsMap: Map<string, Client>,
): string {
  const delimiter = ';';
  const lines = [
    CSV_HEADERS.map((header) => escapeCsvField(header)).join(delimiter),
    ...documents.map((doc) =>
      [
        doc.number,
        DOCUMENT_TYPE_LABELS[doc.type],
        getDocumentFormatLabel(doc),
        clientsMap.get(doc.clientId)?.name ?? '',
        doc.date,
        doc.total.toFixed(2),
        DOCUMENT_STATUS_LABELS[doc.status],
      ]
        .map((value) => escapeCsvField(value))
        .join(delimiter),
    ),
  ];

  return `${lines.join('\r\n')}\r\n`;
}

export function downloadDocumentsCsv(
  documents: Document[],
  clientsMap: Map<string, Client>,
  filename = 'documentos.csv',
): void {
  const blob = new Blob([`\uFEFF${documentsToCsv(documents, clientsMap)}`], {
    type: 'text/csv;charset=utf-8;',
  });
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
