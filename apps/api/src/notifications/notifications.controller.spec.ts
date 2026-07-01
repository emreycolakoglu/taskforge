import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedUser } from '../../test/setup';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let task: any;
  let user: any;
  let other: any;
  let req: { user: { id: string; displayName: string } };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }, { provide: EventsService, useValue: events }],
    }).compile();
    controller = module.get<NotificationsController>(NotificationsController);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.lists[0].id, { title: 'Task' });
    user = await seedUser(prisma, { displayName: 'User' });
    other = await seedUser(prisma, { displayName: 'Other' });
    req = { user: { id: user.id, displayName: user.displayName } };
    await prisma.taskSubscription.create({ data: { taskId: task.id, userId: user.id } });
    const activity = await prisma.activity.create({
      data: { taskId: task.id, actorId: other.id, actor: other.displayName, action: 'commented', detail: '{}' },
    });
    await prisma.notification.create({
      data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'Other commented' },
    });
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.task.deleteMany();
    await prisma.list.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  it('GET list → returns authed user notifications', async () => {
    const result = await controller.list(undefined, req as any);
    expect(result).toHaveLength(1);
    expect(result[0].summary).toBe('Other commented');
  });

  it('GET list filter=unread → returns only unread', async () => {
    const notif = await prisma.notification.findFirst({ where: { userId: user.id } });
    await prisma.notification.update({ where: { id: notif!.id }, data: { readAt: new Date() } });
    const result = await controller.list('unread', req as any);
    expect(result).toHaveLength(0);
  });

  it('GET unread-count → counts unread for authed user', async () => {
    const result = await controller.unreadCount(req as any);
    expect(result).toEqual({ count: 1 });
  });

  it('POST :id/read → marks notification read', async () => {
    const notif = await prisma.notification.findFirst({ where: { userId: user.id } });
    await controller.markRead(notif!.id, req as any);
    const refreshed = await prisma.notification.findUnique({ where: { id: notif!.id } });
    expect(refreshed!.readAt).not.toBeNull();
  });

  it('POST read-all → marks all read', async () => {
    const result = await controller.markAllRead(req as any);
    expect(result.updated).toBe(1);
    const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    expect(unread).toBe(0);
  });
});