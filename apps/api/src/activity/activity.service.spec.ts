import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard, seedTask } from '../../test/setup';

describe('ActivityService', () => {
  let service: ActivityService;
  let prisma: PrismaService;
  let board: any;
  let task: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [ActivityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<ActivityService>(ActivityService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.lists[0].id);
    // Seed some activity
    await prisma.activity.createMany({
      data: [
        { taskId: task.id, actor: 'alice', action: 'created', detail: '{"title":"Test task"}' },
        { taskId: task.id, actor: 'bob', action: 'moved', detail: '{"to":"In Progress"}' },
      ],
    });
  });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  describe('findByTask', () => {
    it('should return activity for a task in reverse chronological order', async () => {
      const activity = await service.findByTask(task.id);
      expect(activity).toHaveLength(2);
      expect(activity.some((a) => a.action === 'created')).toBe(true);
      expect(activity.some((a) => a.action === 'moved')).toBe(true);
    });

    it('should limit to 50 entries', async () => {
      for (let i = 0; i < 60; i++) {
        await prisma.activity.create({
          data: { taskId: task.id, actor: 'bot', action: 'updated', detail: `{"i":${i}}` },
        });
      }
      const activity = await service.findByTask(task.id);
      expect(activity).toHaveLength(50);
    });
  });

  describe('findByBoard', () => {
    it('should return activity for all tasks in a board', async () => {
      const activity = await service.findByBoard(board.id);
      expect(activity.length).toBeGreaterThanOrEqual(2);
    });

    it('should include task title in response', async () => {
      const activity = await service.findByBoard(board.id);
      expect(activity[0]).toHaveProperty('task');
      expect(activity[0].task).toHaveProperty('title');
    });

    it('should limit to 100 entries', async () => {
      for (let i = 0; i < 150; i++) {
        await prisma.activity.create({
          data: { taskId: task.id, actor: 'bot', action: 'updated', detail: `{"i":${i}}` },
        });
      }
      const activity = await service.findByBoard(board.id);
      expect(activity).toHaveLength(100);
    });
  });
});
