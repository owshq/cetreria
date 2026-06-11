import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DB_NAMES } from '../config.js';

type JsonRecord = Record<string, unknown> & { id?: string };

export type CollectionAuditEntry = {
  count: number;
  duplicateIds: string[];
  missingIdCount: number;
};

export type BrokenReference = {
  collection: string;
  documentId: string;
  field: string;
  value: string;
};

export type ExportLowdbResult = {
  exportDir: string;
  sourcePath: string;
  checksumSha256: string;
  manifestPath: string;
  collectionsSummaryPath: string;
  copiedDbPath: string;
  collections: Record<string, CollectionAuditEntry>;
  brokenReferences: BrokenReference[];
};

function readDbJson(sourcePath: string): Record<string, unknown> {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function auditCollection(items: unknown[]): CollectionAuditEntry {
  if (!Array.isArray(items)) {
    return { count: 0, duplicateIds: [], missingIdCount: 0 };
  }

  const seen = new Map<string, number>();
  let missingIdCount = 0;

  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      missingIdCount += 1;
      continue;
    }
    const id = (item as JsonRecord).id;
    if (typeof id !== 'string' || !id.trim()) {
      missingIdCount += 1;
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }

  const duplicateIds = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  return {
    count: items.length,
    duplicateIds,
    missingIdCount,
  };
}

function asRecords(items: unknown): JsonRecord[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is JsonRecord => typeof item === 'object' && item !== null,
  );
}

function idSet(items: JsonRecord[]): Set<string> {
  return new Set(
    items
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );
}

function pushBrokenRef(
  broken: BrokenReference[],
  collection: string,
  documentId: string,
  field: string,
  value: unknown,
  validIds: Set<string>,
): void {
  if (typeof value !== 'string' || !value.trim()) return;
  if (validIds.has(value)) return;
  broken.push({ collection, documentId: documentId || '(missing-id)', field, value });
}

export function auditLowdbData(data: Record<string, unknown>): {
  collections: Record<string, CollectionAuditEntry>;
  brokenReferences: BrokenReference[];
} {
  const collections: Record<string, CollectionAuditEntry> = {};
  for (const name of Object.values(DB_NAMES)) {
    collections[name] = auditCollection(data[name] as unknown[]);
  }

  const clients = asRecords(data[DB_NAMES.clients]);
  const activities = asRecords(data[DB_NAMES.activities]);
  const events = asRecords(data[DB_NAMES.events]);
  const documents = asRecords(data[DB_NAMES.documents]);
  const reports = asRecords(data[DB_NAMES.reports]);
  const users = asRecords(data[DB_NAMES.users]);

  const clientIds = idSet(clients);
  const activityIds = idSet(activities);
  const userIds = idSet(users);

  const brokenReferences: BrokenReference[] = [];

  for (const document of documents) {
    const docId = typeof document.id === 'string' ? document.id : '';
    pushBrokenRef(brokenReferences, DB_NAMES.documents, docId, 'clientId', document.clientId, clientIds);
    pushBrokenRef(
      brokenReferences,
      DB_NAMES.documents,
      docId,
      'activityId',
      document.activityId,
      activityIds,
    );
  }

  for (const activity of activities) {
    const activityId = typeof activity.id === 'string' ? activity.id : '';
    pushBrokenRef(
      brokenReferences,
      DB_NAMES.activities,
      activityId,
      'clientId',
      activity.clientId,
      clientIds,
    );
  }

  for (const event of events) {
    const eventId = typeof event.id === 'string' ? event.id : '';
    pushBrokenRef(
      brokenReferences,
      DB_NAMES.events,
      eventId,
      'activityId',
      event.activityId,
      activityIds,
    );
  }

  for (const report of reports) {
    const reportId = typeof report.id === 'string' ? report.id : '';
    pushBrokenRef(
      brokenReferences,
      DB_NAMES.reports,
      reportId,
      'clientId',
      report.clientId,
      clientIds,
    );
    pushBrokenRef(
      brokenReferences,
      DB_NAMES.reports,
      reportId,
      'workerUserId',
      report.workerUserId,
      userIds,
    );
  }

  return { collections, brokenReferences };
}

export type ExportLowdbOptions = {
  sourcePath: string;
  exportRootDir?: string;
  appVersion?: string;
  exportedAt?: string;
};

export function exportLowdbReadOnly(options: ExportLowdbOptions): ExportLowdbResult {
  const { sourcePath } = options;
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`db.json no encontrado: ${sourcePath}`);
  }

  const sourceStatBefore = fs.statSync(sourcePath);
  const data = readDbJson(sourcePath);
  const { collections, brokenReferences } = auditLowdbData(data);

  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const stamp = exportedAt.replace(/[:.]/g, '-');
  const exportRootDir = options.exportRootDir ?? path.join(os.tmpdir(), 'crm-cetreria-export');
  const exportDir = path.join(exportRootDir, stamp);

  fs.mkdirSync(exportDir, { recursive: true });

  const copiedDbPath = path.join(exportDir, 'db.json');
  fs.copyFileSync(sourcePath, copiedDbPath);

  const checksumSha256 = sha256File(copiedDbPath);

  const manifest = {
    exportedAt,
    sourcePath: path.resolve(sourcePath),
    appVersion: options.appVersion ?? null,
    exportDir: path.resolve(exportDir),
    checksumSha256,
    checksumAlgorithm: 'sha256',
  };

  const collectionsSummary = {
    exportedAt,
    sourcePath: path.resolve(sourcePath),
    collections,
    brokenReferences,
    brokenReferenceCount: brokenReferences.length,
  };

  const manifestPath = path.join(exportDir, 'manifest.json');
  const collectionsSummaryPath = path.join(exportDir, 'collections-summary.json');

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    collectionsSummaryPath,
    `${JSON.stringify(collectionsSummary, null, 2)}\n`,
    'utf8',
  );

  const sourceStatAfter = fs.statSync(sourcePath);
  if (
    sourceStatBefore.mtimeMs !== sourceStatAfter.mtimeMs ||
    sourceStatBefore.size !== sourceStatAfter.size
  ) {
    throw new Error('El archivo fuente db.json fue modificado durante la exportacion');
  }

  return {
    exportDir,
    sourcePath: path.resolve(sourcePath),
    checksumSha256,
    manifestPath,
    collectionsSummaryPath,
    copiedDbPath,
    collections,
    brokenReferences,
  };
}
