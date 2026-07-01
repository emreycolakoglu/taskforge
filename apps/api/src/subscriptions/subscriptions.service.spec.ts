import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard, seedTask, seedUser, seedSubscription } from '../../test/setup';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: PrismaService;
  let board: any;
  let task: any;
  let user: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
    user = await seedUser(prisma);
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('subscribe', () => {
    it('creates a subscription row', async () => {
      const sub = await service.subscribe(task.id, user.id);
      expect(sub.taskId).toBe(task.id);
      expect(sub.userId).toBe(user.id);
    });

    it('is idempotent — duplicate subscribe does not throw or duplicate', async () => {
      await service.subscribe(task.id, user.id);
      const second = await service.subscribe(task.id, user.id);
      const rows = await prisma.taskSubscription.findMany({ where: { taskId: task.id, userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(second.taskId).toBe(task.id);
    });
  });

  describe('unsubscribe', () => {
    it('removes the subscription row', async () => {
      await seedSubscription(prisma, task.id, user.id);
      await service.unsubscribe(task.id, user.id);
      const rows = await prisma.taskSubscription.findMany({ where: { taskId: task.id, userId: user.id } });
      expect(rows).toHaveLength(0);
    });

    it('is a no-op when no row exists', async () => {
      await expect(service.unsubscribe(task.id, user.id)).resolves.not.toThrow();
    });
  });

  describe('getSubscription', () => {
    it('returns subscribed: true when row exists', async () => {
      await seedSubscription(prisma, task.id, user.id);
      const result = await service.getSubscription(task.id, user.id);
      expect(result).toEqual({ subscribed: true });
    });

    it('returns subscribed: false when no row exists', async () => {
      const result = await service.getSubscription(task.id, user.id);
      expect(result).toEqual({ subscribed: false });
    });
  });

  describe('cascade', () => {
    it('deleting the task removes subscriptions', async () => {
      await seedSubscription(prisma, task.id, user.id);
      await prisma.task.delete({ where: { id: task.id } });
      const rows = await prisma.taskSubscription.findMany({ where: { taskId: task.id } });
      expect(rows).toHaveLength(0);
    });

    it('deleting the user removes subscriptions', async () => {
      await seedSubscription(prisma, task.id, user.id);
      await prisma.user.delete({ where: { id: user.id } });
      const rows = await prisma.taskSubscription.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(0);
    });
  });
});