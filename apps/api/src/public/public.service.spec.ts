import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedLabel,
  seedUser,
  seedComment,
  seedDocument,
} from '../../test/setup';

describe('PublicService', () => {
  let service: PublicService;
  let prisma: PrismaService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<PublicService>(PublicService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
  });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.document.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('visibility', () => {
    it('returns a published task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, {
        title: 'Published task',
        isPublic: true,
      });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.title).toBe('Published task');
      expect(result.taskNumber).toBe(`${board.identifier}-${task.number}`);
    });

    it('404s for a task that exists but is not published', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: false });

      await expect(service.findPublicTask(board.identifier, task.number)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s for a task number that does not exist', async () => {
      await expect(service.findPublicTask(board.identifier, 9999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s when the identifier belongs to a different board', async () => {
      const other = await seedBoard(prisma);
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      await expect(service.findPublicTask(other.identifier, task.number)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s for a non-integer task number', async () => {
      await expect(service.findPublicTask(board.identifier, NaN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('stops serving a task once it is unpublished', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });
      await service.findPublicTask(board.identifier, task.number);

      await prisma.task.update({ where: { id: task.id }, data: { isPublic: false } });

      await expect(service.findPublicTask(board.identifier, task.number)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('payload', () => {
    it('exposes the assignee as a display name only, never email or role', async () => {
      const user = await seedUser(prisma, {
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
      });
      const task = await seedTask(prisma, board.statuses[0].id, {
        isPublic: true,
        assigneeId: user.id,
      });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.assignee).toBe('Ada Lovelace');
      expect(JSON.stringify(result)).not.toContain('ada@example.com');
      expect(JSON.stringify(result)).not.toContain('passwordHash');
    });

    it('returns a null assignee when the task is unassigned', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.assignee).toBeNull();
    });

    it('includes labels and comments', async () => {
      const label = await seedLabel(prisma, board.id);
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });
      await prisma.taskLabel.create({ data: { taskId: task.id, labelId: label.id } });
      await seedComment(prisma, task.id, { author: 'tester', body: 'a public comment' });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.labels).toEqual([{ name: 'bug', color: '#ef4444' }]);
      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toMatchObject({ author: 'tester', body: 'a public comment' });
    });

    it('returns comments as a threaded tree and omits tombstones', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });
      const parent = await seedComment(prisma, task.id, { author: 'tester', body: 'parent' });
      await seedComment(prisma, task.id, {
        author: 'tester',
        body: 'the reply',
        parentId: parent.id,
      });
      await seedComment(prisma, task.id, {
        author: 'gone',
        body: 'buried',
        parentId: parent.id,
        deletedAt: new Date(),
      });

      const result = await service.findPublicTask(board.identifier, task.number);

      const roots = result.comments;
      expect(roots).toHaveLength(1);
      expect(roots[0]).toMatchObject({ author: 'tester', body: 'parent' });
      expect(roots[0].replies).toHaveLength(1);
      expect(roots[0].replies[0]).toMatchObject({ author: 'tester', body: 'the reply' });
    });

    it('orders roots and replies consistently across a multi-root, tombstoned tree', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      // Root A (created first) with a depth-3 chain ascending by createdAt.
      const rootA = await seedComment(prisma, task.id, {
        author: 'rootA',
        body: 'root A',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const a1 = await seedComment(prisma, task.id, {
        author: 'a1',
        body: 'a reply 1',
        parentId: rootA.id,
        createdAt: new Date('2026-01-01T00:01:00Z'),
      });
      const a2 = await seedComment(prisma, task.id, {
        author: 'a2',
        body: 'a reply 2',
        parentId: a1.id,
        createdAt: new Date('2026-01-01T00:02:00Z'),
      });
      await seedComment(prisma, task.id, {
        author: 'a3',
        body: 'a reply 3',
        parentId: a2.id,
        createdAt: new Date('2026-01-01T00:03:00Z'),
      });

      // Root B with two replies, one deleted; its surviving child is promoted.
      const rootB = await seedComment(prisma, task.id, {
        author: 'rootB',
        body: 'root B',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      });
      const bTombstone = await seedComment(prisma, task.id, {
        author: 'gone',
        body: 'buried',
        parentId: rootB.id,
        deletedAt: new Date(),
        createdAt: new Date('2026-01-02T00:01:00Z'),
      });
      await seedComment(prisma, task.id, {
        author: 'orphan',
        body: 'orphan promoted',
        parentId: bTombstone.id,
        createdAt: new Date('2026-01-02T00:02:00Z'),
      });

      const result = await service.findPublicTask(board.identifier, task.number);

      const roots = result.comments;
      // Promoted orphan is newest, so it lands first in the createdAt-desc
      // root ordering.
      expect(roots.map((r: any) => r.body)).toEqual(['orphan promoted', 'root B', 'root A']);
      expect(roots[2].replies.map((r: any) => r.body)).toEqual(['a reply 1']);
      expect(roots[2].replies[0].replies.map((r: any) => r.body)).toEqual(['a reply 2']);
      expect(roots[2].replies[0].replies[0].replies.map((r: any) => r.body)).toEqual(['a reply 3']);
      expect(roots[1].replies).toEqual([]);
      // Curated shape only: exactly these five keys, nothing rides along.
      expect(Object.keys(roots[0]).sort()).toEqual(
        ['author', 'body', 'createdAt', 'id', 'replies'].sort(),
      );
    });

    it('promotes replies of deleted comments to top level', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });
      const parent = await seedComment(prisma, task.id, {
        author: 'gone',
        body: 'deleted root',
        deletedAt: new Date(),
      });
      await seedComment(prisma, task.id, { author: 'k', body: 'orphan', parentId: parent.id });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]).toMatchObject({ author: 'k', body: 'orphan' });
      expect(result.comments[0].replies).toEqual([]);
    });

    it('omits activity, sub-tasks and parent', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, {
        title: 'Secret parent',
        isPublic: true,
      });
      const child = await seedTask(prisma, board.statuses[0].id, {
        title: 'Secret child',
        parentId: parent.id,
      });
      await prisma.activity.create({
        data: { taskId: parent.id, actor: 'someone', action: 'created' },
      });

      const result = await service.findPublicTask(board.identifier, parent.number);

      expect(result).not.toHaveProperty('activity');
      expect(result).not.toHaveProperty('subTasks');
      expect(result).not.toHaveProperty('parent');
      // Publishing a parent must not disclose the title of an unpublished child.
      expect(JSON.stringify(result)).not.toContain('Secret child');
      expect(child.parentId).toBe(parent.id);
    });

    it('does not leak the board object', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result).not.toHaveProperty('board');
      expect(result).not.toHaveProperty('boardId');
      expect(JSON.stringify(result)).not.toContain(board.slug);
    });

    it('returns the status name and color', async () => {
      const task = await seedTask(prisma, board.statuses[2].id, { isPublic: true });

      const result = await service.findPublicTask(board.identifier, task.number);

      expect(result.status).toEqual({ name: 'In Progress', color: '#f59e0b' });
    });
  });
  describe('findPublicDocument', () => {
    it('returns a published document', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Host task' });
      const doc = await seedDocument(prisma, task.id, {
        title: 'Published doc',
        body: '# Hello',
        isPublic: true,
      });
      const result = await service.findPublicDocument(board.identifier, doc.number);
      expect(result.title).toBe('Published doc');
      expect(result.body).toBe('# Hello');
      expect(result.docNumber).toBe(`D-${doc.number}`);
      expect(result.taskNumber).toBe(`${board.identifier}-${task.number}`);
      expect(result.taskTitle).toBe('Host task');
    });

    it('404s for a document that exists but is not published', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const doc = await seedDocument(prisma, task.id, { isPublic: false });
      await expect(service.findPublicDocument(board.identifier, doc.number)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s for a document number that does not exist', async () => {
      await expect(service.findPublicDocument(board.identifier, 9999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s for a non-integer document number', async () => {
      await expect(service.findPublicDocument(board.identifier, NaN)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('omits the board object and task metadata', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const doc = await seedDocument(prisma, task.id, { title: 'Doc', isPublic: true });
      const result = await service.findPublicDocument(board.identifier, doc.number);
      expect(result).not.toHaveProperty('boardId');
      expect(result).not.toHaveProperty('board');
      expect(JSON.stringify(result)).not.toContain(board.slug);
    });
  });
});
