import { Test, TestingModule } from '@nestjs/testing';
import { MentionsService } from './mentions.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedUser,
  seedSubscription,
} from '../../test/setup';

describe('MentionsService', () => {
  let service: MentionsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let task: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
      ],
    }).compile();
    service = module.get<MentionsService>(MentionsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.task.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  it('subscribes a mentioned user and creates the mention activity + notification', async () => {
    const actor = await seedUser(prisma, { displayName: 'Alice' });
    const bob = await seedUser(prisma, { displayName: 'Bob' });

    await service.processMentions(task.id, 'ping @bob now', {
      id: actor.id,
      displayName: actor.displayName,
    });

    const sub = await prisma.taskSubscription.findUnique({
      where: { taskId_userId: { taskId: task.id, userId: bob.id } },
    });
    expect(sub).not.toBeNull();

    const activity = await prisma.activity.findFirst({
      where: { taskId: task.id, action: 'mentioned' },
    });
    expect(activity).not.toBeNull();
    expect(activity!.actorId).toBe(actor.id);

    const notification = await prisma.notification.findFirst({ where: { userId: bob.id } });
    expect(notification!.action).toBe('mentioned');
    expect(notification!.summary).toContain('@Alice');
  });

  it('does not notify the actor for self-mentions', async () => {
    const alice = await seedUser(prisma, { displayName: 'Alice' });

    await service.processMentions(task.id, '@Alice looks fine', {
      id: alice.id,
      displayName: alice.displayName,
    });

    expect(await prisma.notification.count({ where: { userId: alice.id } })).toBe(0);
    expect(await prisma.taskSubscription.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('is idempotent: an already-subscribed user gets no new mention notification', async () => {
    const actor = await seedUser(prisma, { displayName: 'Alice' });
    const bob = await seedUser(prisma, { displayName: 'Bob' });
    await seedSubscription(prisma, task.id, bob.id);

    await service.processMentions(task.id, 'ping @Bob', {
      id: actor.id,
      displayName: actor.displayName,
    });

    expect(await prisma.notification.count({ where: { taskId: task.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { taskId: task.id } })).toBe(0);
  });

  it('does nothing for text without @ signs or unknown names', async () => {
    const actor = await seedUser(prisma, { displayName: 'Alice' });

    await service.processMentions(task.id, 'plain text, no one @around', {
      id: actor.id,
      displayName: actor.displayName,
    });

    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.activity.count()).toBe(0);
  });
});
