"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedComment = exports.seedTask = exports.seedLabel = exports.seedBoard = exports.createTestPrisma = void 0;
const client_1 = require("@prisma/client");
const child_process_1 = require("child_process");
const path_1 = require("path");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const os_1 = require("os");
/**
 * Creates a fresh file-based SQLite Prisma client for testing.
 * Each call creates a unique temp database so tests don't interfere.
 */
function createTestPrisma() {
    const tmpDir = (0, fs_1.mkdtempSync)((0, path_1.join)((0, os_1.tmpdir)(), 'taskforge-test-'));
    const dbPath = (0, path_1.join)(tmpDir, 'test.db');
    const url = `file:${dbPath}`;
    const prisma = new client_1.PrismaClient({
        datasources: { db: { url } },
    });
    // Push schema to the temp DB
    const schemaPath = (0, path_1.join)(__dirname, '..', 'prisma', 'schema.prisma');
    try {
        (0, child_process_1.execSync)(`npx prisma db push --skip-generate --accept-data-loss --schema="${schemaPath}"`, { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', cwd: (0, path_1.join)(__dirname, '..') });
    }
    catch (e) {
        console.error('Failed to push schema:', e.stderr?.toString() || e.message);
        throw e;
    }
    return prisma;
}
exports.createTestPrisma = createTestPrisma;
/**
 * Seed a board with default lists and return the created board + lists.
 */
async function seedBoard(prisma) {
    const id = (0, crypto_1.randomUUID)().slice(0, 8);
    const board = await prisma.board.create({
        data: {
            name: `Test Board ${id}`,
            slug: `test-board-${id}`,
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
exports.seedBoard = seedBoard;
/**
 * Seed a label on a board.
 */
async function seedLabel(prisma, boardId) {
    return prisma.label.create({
        data: { boardId, name: 'bug', color: '#ef4444' },
    });
}
exports.seedLabel = seedLabel;
/**
 * Seed a task in a list.
 */
async function seedTask(prisma, listId, overrides = {}) {
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
exports.seedTask = seedTask;
/**
 * Seed a comment on a task.
 */
async function seedComment(prisma, taskId, overrides = {}) {
    return prisma.comment.create({
        data: {
            taskId,
            author: overrides.author || 'tester',
            body: overrides.body || 'Test comment',
        },
    });
}
exports.seedComment = seedComment;
//# sourceMappingURL=setup.js.map