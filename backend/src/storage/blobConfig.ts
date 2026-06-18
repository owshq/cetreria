/** Vercel Blob: token inyectado al conectar un Blob store al proyecto. */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** Pathname estable del snapshot db.json en Blob (reutiliza DB_S3_KEY si existe). */
export function resolveDbBlobPathname(): string {
  return (
    process.env.DB_BLOB_PATHNAME?.trim() ||
    process.env.DB_S3_KEY?.trim() ||
    'crm-cetreria/db.json'
  );
}

export const BLOB_PRIVATE_ACCESS = 'private' as const satisfies 'private';
