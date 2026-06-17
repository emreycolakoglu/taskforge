import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';
import { randomUUID, createHash } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

/**
 * Creates a fresh file-based SQLite Prisma client for testing.
 * Each call creates a unique temp database so tests don't interfere.
 */
export function createTestPrisma(): PrismaClient {
  const tmpDir = mkdtempSync(join(tmpdir(), 'taskforge-test-'));
  const dbPath = join(tmpDir, 'test.db');
  const url = `file:${dbPath}`;

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  // Push schema to the temp DB
  const schemaPath = join(__dirname, '..', 'prisma', 'schema.prisma');
  try {
    execSync(
      `npx prisma db push --skip-generate --accept-data-loss --schema="${schemaPath}"`,
      { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', cwd: join(__dirname, '..') },
    );
  } catch (e: any) {
    console.error('Failed to push schema:', e.stderr?.toString() || e.message);
    throw e;
  }

  return prisma;
}

/**
 * Seed a board with default lists and return the created board + lists.
 */
// Track slug uniqueness for test seeding
let boardCounter = 0;

export async function seedBoard(prisma: PrismaClient) {
  boardCounter++;
  const board = await prisma.board.create({
    data: {
      name: `Test Board ${boardCounter}`,
      slug: `test-board-${boardCounter}`,
      description: 'A board for testing',
      lists: {
        create: [
          { name: 'Backlog', position: 0, color: '#94a3b8' },
          { name: 'To Do', position: 1, color: '#6366f1' },
          { name: 'In Progress', position: 2, color: '#f59e0b' },
          { name: 'Review', position: 3, color: '#8b5cf6' },
          { name: 'Done', position: 4, color: '#22c55e' },
        ],
      },
    },
    include: { lists: true },
  });
  return board;
}

/**
 * Seed a label on a board.
 */
export async function seedLabel(prisma: PrismaClient, boardId: string) {
  return prisma.label.create({
    data: { boardId, name: 'bug', color: '#ef4444' },
  });
}

/**
 * Seed a task in a list.
 */
export async function seedTask(prisma: PrismaClient, listId: string, overrides: Record<string, any> = {}) {
  return prisma.task.create({
    data: {
      listId,
      title: overrides.title || 'Test task',
      description: overrides.description || 'A task for testing',
      position: overrides.position ?? 0,
      priority: overrides.priority || 'medium',
      assignee: overrides.assignee || null,
      status: overrides.status || 'active',
      ...overrides,
    },
  });
}

/**
 * Seed a comment on a task.
 */
export async function seedComment(prisma: PrismaClient, taskId: string, overrides: Record<string, any> = {}) {
  return prisma.comment.create({
    data: {
      taskId,
      author: overrides.author || 'tester',
      body: overrides.body || 'Test comment',
    },
  });
}
