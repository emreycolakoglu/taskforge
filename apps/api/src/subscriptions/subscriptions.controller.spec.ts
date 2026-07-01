import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard, seedTask, seedUser, seedSubscription } from '../../test/setup';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let prisma: PrismaService;
  let board: any;
  let task: any;
  let user: any;
  let req: { user: { id: string; displayName: string } };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [SubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    controller = module.get<SubscriptionsController>(SubscriptionsController);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
    user = await seedUser(prisma);
    req = { user: { id: user.id, displayName: user.displayName } };
  });

  afterEach(async () => {
    await prisma.taskSubscription.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.task.deleteMany();
    await prisma.status.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  it('POST subscribe → creates subscription for authed user', async () => {
    const result = await controller.subscribe(task.id, req as any);
    expect(result.userId).toBe(user.id);
    expect(result.taskId).toBe(task.id);
  });

  it('DELETE unsubscribe → returns { subscribed: false }', async () => {
    await seedSubscription(prisma, task.id, user.id);
    const result = await controller.unsubscribe(task.id, req as any);
    expect(result).toEqual({ subscribed: false });
  });

  it('GET subscription → returns { subscribed: true } when row exists', async () => {
    await seedSubscription(prisma, task.id, user.id);
    const result = await controller.getSubscription(task.id, req as any);
    expect(result).toEqual({ subscribed: true });
  });

  it('GET subscription → returns { subscribed: false } when no row', async () => {
    const result = await controller.getSubscription(task.id, req as any);
    expect(result).toEqual({ subscribed: false });
  });
});