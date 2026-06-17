import { PrismaClient } from '@prisma/client';
/**
 * Creates a fresh file-based SQLite Prisma client for testing.
 * Each call creates a unique temp database so tests don't interfere.
 */
export declare function createTestPrisma(): PrismaClient;
/**
 * Seed a board with default lists and return the created board + lists.
 */
export declare function seedBoard(prisma: PrismaClient): Promise<{
    lists: {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        position: number;
        boardId: string;
        color: string;
        wipLimit: number;
    }[];
} & {
    name: string;
    slug: string;
    description: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
}>;
/**
 * Seed a label on a board.
 */
export declare function seedLabel(prisma: PrismaClient, boardId: string): Promise<{
    name: string;
    id: string;
    boardId: string;
    color: string;
}>;
/**
 * Seed a task in a list.
 */
export declare function seedTask(prisma: PrismaClient, listId: string, overrides?: Record<string, any>): Promise<{
    description: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    position: number;
    listId: string;
    title: string;
    priority: string;
    status: string;
    dueDate: Date;
    assignee: string;
    metadata: string;
}>;
/**
 * Seed a comment on a task.
 */
export declare function seedComment(prisma: PrismaClient, taskId: string, overrides?: Record<string, any>): Promise<{
    id: string;
    createdAt: Date;
    updatedAt: Date;
    taskId: string;
    author: string;
    body: string;
}>;
