import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { StorageDriver } from './storage.types';

export class LocalDiskDriver implements StorageDriver {
  constructor(private root: string) {}

  private path(key: string): string {
    if (key === '.' || key === '..') {
      throw new Error(`Invalid storage key: ${key}`);
    }
    // Flat keyspace; keys are server-generated UUIDs, but defend anyway.
    return join(this.root, key.replace(/[/\\]/g, '_'));
  }

  async put(key: string, sourcePath: string): Promise<void> {
    const dest = this.path(key);
    await fs.mkdir(dirname(dest), { recursive: true });
    try {
      await fs.rename(sourcePath, dest);
    } catch (err: any) {
      if (err?.code !== 'EXDEV') throw err;
      await fs.copyFile(sourcePath, dest);
      await fs.rm(sourcePath, { force: true });
    }
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.path(key), { force: true });
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const s = await fs.stat(this.path(key));
      return { size: s.size };
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return null;
      throw err;
    }
  }
}
