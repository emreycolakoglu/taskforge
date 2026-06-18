import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join, dirname, isAbsolute } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';

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
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasourceUrl: resolvedUrl,
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Check if the SQLite database has tables. If not, run `prisma db push`
   * to create them. This handles the case where the .db file is deleted
   * and the dev server is restarted — no manual `pnpm db:push` needed.
   */
  private async ensureSchema(): Promise<void> {
    try {
      const result = await this.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite%'
      `;
      const tableCount = Number(result[0].count);
      if (tableCount > 0) return;
    } catch {
      // Query failed — DB may be completely empty or corrupt. Fall through to push.
    }

    this.logger.log('No tables found — applying schema via `prisma db push`...');
    const schemaPath = join(__dirname, '..', '..', 'prisma', 'schema.prisma');
    const cwd = join(__dirname, '..', '..');
    try {
      execSync(
        `npx prisma db push --skip-generate --accept-data-loss --schema="${schemaPath}"`,
        { env: { ...process.env, DATABASE_URL: effectiveUrl }, stdio: 'inherit', cwd },
      );
      await this.$disconnect();
      await this.$connect();
      this.logger.log('Schema applied successfully.');
    } catch (err) {
      this.logger.error('Failed to apply schema. Run `pnpm db:push` manually.');
      throw err;
    }
  }
}
