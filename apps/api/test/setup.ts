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
export async function seedBoard(prisma: PrismaClient) {
  const id = randomUUID().slice(0, 8);
  // Generate a unique 3-letter uppercase identifier using the random id.
  // Map hex digits to letters: 0→A, 1→B, ... f→P
  const identifier = id.slice(0, 3).split('').map(c => {
    const n = parseInt(c, 16);
    return String.fromCharCode(65 + n);
  }).join('');
  const board = await prisma.board.create({
    data: {
      name: `Test Board ${id}`,
      slug: `test-board-${id}`,
      identifier,
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
 * Seed a task in a list. Derives boardId from the list and auto-increments number.
 * Also updates the board's nextTaskNum counter.
 */
export async function seedTask(prisma: PrismaClient, listId: string, overrides: Record<string, any> = {}) {
  const { assigneeId, boardId: overrideBoardId, number: overrideNumber, parentId, ...rest } = overrides;
  let boardId = overrideBoardId;
  if (!boardId) {
    const list = await prisma.list.findUniqueOrThrow({ where: { id: listId } });
    boardId = list.boardId;
  }
  const number = overrideNumber != null ? overrideNumber : await getNextTaskNumber(prisma, boardId);

  const task = await prisma.task.create({
    data: {
      listId,
      boardId,
      number,
      title: rest.title || 'Test task',
      description: rest.description || 'A task for testing',
      position: rest.position ?? 0,
      priority: rest.priority || 'medium',
      assigneeId: assigneeId ?? null,
      status: rest.status || 'active',
      parentId: parentId ?? null,
    },
  });

  // Keep board.nextTaskNum in sync so service-level creation works correctly
  const board = await prisma.board.findUniqueOrThrow({ where: { id: boardId } });
  await prisma.board.update({
    where: { id: boardId },
    data: { nextTaskNum: Math.max(board.nextTaskNum, number + 1) },
  });

  return task;
}

/**
 * Helper: get the next task number for a board.
 */
async function getNextTaskNumber(prisma: PrismaClient, boardId: string): Promise<number> {
  const maxResult = await prisma.task.aggregate({
    where: { boardId },
    _max: { number: true },
  });
  return (maxResult._max.number ?? 0) + 1;
}

/**
 * Seed a comment on a task.
 */
export async function seedComment(prisma: PrismaClient, taskId: string, overrides: Record<string, any> = {}) {
  return prisma.comment.create({
    data: {
      taskId,
      authorId: overrides.authorId ?? null,
      author: overrides.author || 'tester',
      body: overrides.body || 'Test comment',
    },
  });
}

/**
 * Seed a relation between two tasks. For "related_to", canonicalizes so
 * fromTaskId < toTaskId lexicographically (matches RelationsService).
 */
export async function seedRelation(
  prisma: PrismaClient,
  fromTaskId: string,
  toTaskId: string,
  type: 'blocks' | 'related_to',
) {
  const [a, b] = type === 'related_to' && fromTaskId > toTaskId
    ? [toTaskId, fromTaskId]
    : [fromTaskId, toTaskId];
  return prisma.taskRelation.create({ data: { type, fromTaskId: a, toTaskId: b } });
}

/**
 * Seed a user. Defaults to member role with a hashed password 'password'.
 */
export async function seedUser(prisma: PrismaClient, overrides: Record<string, any> = {}) {
  const bcrypt = require('bcryptjs');
  const id = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      email: overrides.email || `user-${id}@example.com`,
      passwordHash: overrides.passwordHash || bcrypt.hashSync('password', 12),
      displayName: overrides.displayName || `Test User ${id}`,
      role: overrides.role || 'member',
    },
  });
}

/**
 * Seed a task subscription.
 */
export async function seedSubscription(prisma: PrismaClient, taskId: string, userId: string) {
  return prisma.taskSubscription.create({
    data: { taskId, userId },
  });
}

/**
 * Seed a notification. Requires an activity row to exist for the task.
 */
export async function seedNotification(
  prisma: PrismaClient,
  { userId, taskId, activityId, action = 'commented', summary = 'test summary' }:
  { userId: string; taskId: string; activityId: string; action?: string; summary?: string },
) {
  return prisma.notification.create({
    data: { userId, taskId, activityId, action, summary },
  });
}
