import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join, dirname, isAbsolute } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';

// Schema directory: apps/api/prisma/ — the canonical home for the SQLite file.
// In dev, __dirname is apps/api/dist/prisma; in src-mode, apps/api/src/prisma.
// Two levels up always reaches the project root, then into prisma/.
const SCHEMA_DIR = join(__dirname, '..', '..', 'prisma');

/**
 * Resolve a SQLite DATABASE_URL to an absolute file:// URI.
 *
 * Prisma CLI resolves relative SQLite paths from the schema directory,
 * but Prisma Client resolves them from CWD at runtime. This function
 * normalizes both cases to an absolute URI so both agree on the same file.
 */
function resolveDatabaseUrl(raw: string): string {
  // Already absolute (file:///...)
  if (raw.startsWith('file:///')) return raw;

  // file:<relative-path> — resolve relative to the schema directory
  if (raw.startsWith('file:')) {
    const relativePath = raw.slice('file:'.length);
    const absolutePath = isAbsolute(relativePath)
      ? relativePath
      : join(SCHEMA_DIR, relativePath);
    return pathToFileURL(absolutePath).href;
  }

  // Bare path (shouldn't happen, but handle it)
  const absolutePath = isAbsolute(raw) ? raw : join(SCHEMA_DIR, raw);
  return pathToFileURL(absolutePath).href;
}

// Resolve the effective URL and ensure the parent directory exists
const effectiveUrl = process.env.DATABASE_URL || `file:${join(SCHEMA_DIR, 'taskforge.db')}`;
const resolvedUrl = resolveDatabaseUrl(effectiveUrl);

// Extract the filesystem path from the resolved URL so we can mkdir its parent.
// pathToFileURL always produces file:// URLs, so we can parse the pathname.
const dbFileUrl = new URL(resolvedUrl);
const dbDir = dirname(dbFileUrl.pathname);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasourceUrl: resolvedUrl,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
