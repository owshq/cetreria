import fs from 'fs/promises';
import path from 'path';
import type { Document } from '@shared/types';
import {
  DEFAULT_WORKSPACE_ID,
  UPLOADED_DOCUMENT_FILE_VERSION,
  documentFileKey,
  mimeTypeToExtension,
} from '@shared/types';
import { config, DB_NAMES } from '../config.js';
import { getById, insertDoc, listAll } from './repository.js';

const WORKSPACE_PATH =
  /^workspaces\/([^/]+)\/documents\/([^/]+)\/([^/]+)\.([a-z0-9]+)$/i;
const LEGACY_PATH = /^documents\/([^/]+)\/([^/]+)\.pdf$/i;

/** Metadatos conocidos (p. ej. desde notificaciones) para documentos huérfanos. */
const KNOWN_DOCUMENTS: Record<
  string,
  Pick<Document, 'type' | 'number' | 'status' | 'date' | 'total' | 'items'>
> = {
  '73eda7ab-f86e-45b4-9ec5-86936b5912cd': {
    type: 'invoice',
    number: 'F-2026-004',
    status: 'draft',
    date: '2026-06-02',
    items: [],
    total: 0,
  },
};

type OrphanFile = {
  workspaceId: string;
  clientId: string;
  documentId: string;
  relativeKey: string;
  pdfContentType: string;
  pdfGeneratedAt: string;
};

async function walkStorageFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkStorageFiles(full, rel)));
    } else if (entry.isFile()) {
      files.push(rel.replace(/\\/g, '/'));
    }
  }
  return files;
}

function parseOrphanKey(relativeKey: string): Omit<OrphanFile, 'pdfGeneratedAt'> | null {
  const workspaceMatch = relativeKey.match(WORKSPACE_PATH);
  if (workspaceMatch) {
    const [, workspaceId, clientId, documentId, ext] = workspaceMatch;
    const mime =
      ext === 'pdf'
        ? 'application/pdf'
        : ext === 'jpg' || ext === 'jpeg'
          ? 'image/jpeg'
          : ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : null;
    if (!mime) return null;
    return {
      workspaceId,
      clientId,
      documentId,
      relativeKey,
      pdfContentType: mime,
    };
  }

  const legacyMatch = relativeKey.match(LEGACY_PATH);
  if (legacyMatch) {
    const [, clientId, documentId] = legacyMatch;
    return {
      workspaceId: DEFAULT_WORKSPACE_ID,
      clientId,
      documentId,
      relativeKey,
      pdfContentType: 'application/pdf',
    };
  }

  return null;
}

export async function recoverOrphanDocumentPdfs(): Promise<number> {
  const storageDir = config.documentStorageDir;
  const relativeFiles = await walkStorageFiles(storageDir);
  const orphansById = new Map<string, OrphanFile>();

  for (const relativeKey of relativeFiles) {
    const parsed = parseOrphanKey(relativeKey);
    if (!parsed) continue;

    const fullPath = path.join(storageDir, relativeKey);
    const stat = await fs.stat(fullPath);
    const pdfGeneratedAt = stat.mtime.toISOString();
    const canonicalKey = documentFileKey({
      workspaceId: parsed.workspaceId,
      clientId: parsed.clientId,
      id: parsed.documentId,
      pdfContentType: parsed.pdfContentType,
    });

    const existing = orphansById.get(parsed.documentId);
    const preferCanonical =
      !existing || existing.relativeKey !== canonicalKey && relativeKey === canonicalKey;

    if (!existing || preferCanonical) {
      orphansById.set(parsed.documentId, {
        ...parsed,
        relativeKey: canonicalKey,
        pdfGeneratedAt,
      });
    }
  }

  const existingDocs = await listAll<Document>(DB_NAMES.documents);
  const existingIds = new Set(existingDocs.map((doc) => doc.id));
  let recovered = 0;
  let index = 0;

  for (const orphan of orphansById.values()) {
    if (existingIds.has(orphan.documentId)) continue;

    const client = await getById<{ id: string }>(DB_NAMES.clients, orphan.clientId);
    if (!client) {
      console.warn(
        `Omitido documento ${orphan.documentId}: contacto ${orphan.clientId} no existe.`,
      );
      continue;
    }

    const known = KNOWN_DOCUMENTS[orphan.documentId];
    index += 1;
    const document: Document = {
      id: orphan.documentId,
      workspaceId: orphan.workspaceId,
      type: known?.type ?? 'invoice',
      number: known?.number ?? `REC-${String(index).padStart(3, '0')}`,
      clientId: orphan.clientId,
      date: known?.date ?? orphan.pdfGeneratedAt.slice(0, 10),
      items: known?.items ?? [],
      total: known?.total ?? 0,
      // Sin metadatos previos: borrador. El estado real (pagada, enviada…) hay que reasignarlo en la app.
      status: known?.status ?? 'draft',
      createdAt: orphan.pdfGeneratedAt,
      pdfSource: 'uploaded',
      pdfContentType: orphan.pdfContentType,
      pdfKey: orphan.relativeKey,
      pdfGeneratedAt: orphan.pdfGeneratedAt,
      pdfRenderVersion: UPLOADED_DOCUMENT_FILE_VERSION,
      notes: 'Recuperado desde almacenamiento local (PDF huérfano). Revisa número, líneas e importes.',
    };

    const ext = mimeTypeToExtension(orphan.pdfContentType) ?? 'pdf';
    const expectedKey = documentFileKey(document);
    if (orphan.relativeKey !== expectedKey) {
      const sourcePath = path.join(storageDir, orphan.relativeKey);
      const targetPath = path.join(storageDir, expectedKey);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      try {
        await fs.copyFile(sourcePath, targetPath);
        document.pdfKey = expectedKey;
      } catch (err) {
        console.warn(`No se pudo copiar ${orphan.relativeKey} ? ${expectedKey}`, err);
      }
    }

    await insertDoc(DB_NAMES.documents, document);
    existingIds.add(document.id);
    recovered += 1;
    console.log(`Recuperado: ${document.number} (${document.id}) ? ${document.pdfKey}`);
  }

  return recovered;
}
