import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PublicService } from './public.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedUser, seedComment } from '../../test/setup';

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
});
