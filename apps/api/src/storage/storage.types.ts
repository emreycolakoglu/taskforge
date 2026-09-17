export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

export interface StorageDriver {
  /** Move a staged temp file into storage under key. */
  put(key: string, sourcePath: string): Promise<void>;
  /** Read object bytes. Throws if missing. */
  get(key: string): Promise<Buffer>;
  /** Remove object; idempotent (missing key must not throw). */
  delete(key: string): Promise<void>;
  /** Size probe; null when missing. */
  stat(key: string): Promise<{ size: number } | null>;
}

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/pdf',
  'application/zip',
];
