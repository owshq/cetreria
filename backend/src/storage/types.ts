export type DocumentStorageDriver = 's3' | 'local';

export interface DocumentStorage {
  driver: DocumentStorageDriver;
  upload(key: string, body: Uint8Array, contentType?: string): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  getViewUrl?(key: string): Promise<string | null>;
}
