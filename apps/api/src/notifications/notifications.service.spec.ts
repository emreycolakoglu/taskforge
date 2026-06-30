import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedUser, seedSubscription } from '../../test/setup';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let task: any;
  let actor: any;
  let subscriber: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.lists[0].id, { title: 'Fix login' });
    actor = await seedUser(prisma, { displayName: 'Actor' });
    subscriber = await seedUser(prisma, { displayName: 'Subscriber' });
    await seedSubscription(prisma, task.id, subscriber.id);
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  async function makeActivity(action: string, detail: object, actorId: string, actorName: string) {
    return prisma.activity.create({
      data: { taskId: task.id, action, actorId, actor: actorName, detail: JSON.stringify(detail) },
    });
  }

  describe('dispatchFromActivity — filter', () => {
    it('commented notifies subscribers, excludes actor', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(1);
      expect(notifs[0].action).toBe('commented');
      expect(notifs[0].summary).toContain(actor.displayName);
      expect(notifs[0].summary).toContain(`${board.identifier}-${task.number}`);
      const actorNotifs = await prisma.notification.findMany({ where: { userId: actor.id } });
      expect(actorNotifs).toHaveLength(0);
    });

    it('updated with status: change notifies', async () => {
      const activity = await makeActivity('updated', { changes: ['status: done'] }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(1);
    });

    it('updated with only title change does NOT notify', async () => {
      const activity = await makeActivity('updated', { changes: ['title updated'] }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(0);
    });

    it('archived notifies', async () => {
      const activity = await makeActivity('archived', { reason: 'manual archive' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(1);
    });

    it('created does NOT notify', async () => {
      const activity = await makeActivity('created', { title: 'Fix login' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(0);
    });

    it('moved does NOT notify', async () => {
      const activity = await makeActivity('moved', { to: 'In Progress' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(0);
    });

    it('no subscribers → no notifications, no error', async () => {
      await prisma.taskSubscription.deleteMany({});
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await expect(service.dispatchFromActivity(activity)).resolves.not.toThrow();
    });
  });

  describe('listForUser', () => {
    it('returns newest first; includes task + board identifier', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const list = await service.listForUser(subscriber.id);
      expect(list).toHaveLength(1);
      expect(list[0].task.board.identifier).toBe(board.identifier);
    });

    it('filter=unread excludes read notifications', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notif = await prisma.notification.findFirst({ where: { userId: subscriber.id } });
      await prisma.notification.update({ where: { id: notif!.id }, data: { readAt: new Date() } });
      const unread = await service.listForUser(subscriber.id, 'unread');
      expect(unread).toHaveLength(0);
    });
  });

  describe('markRead', () => {
    it('sets readAt', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notif = await prisma.notification.findFirst({ where: { userId: subscriber.id } });
      await service.markRead(notif!.id, subscriber.id);
      const refreshed = await prisma.notification.findUnique({ where: { id: notif!.id } });
      expect(refreshed!.readAt).not.toBeNull();
    });

    it('is idempotent — marking read again does not throw', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notif = await prisma.notification.findFirst({ where: { userId: subscriber.id } });
      await service.markRead(notif!.id, subscriber.id);
      await expect(service.markRead(notif!.id, subscriber.id)).resolves.not.toThrow();
    });

    it('does not mark another user\'s notification', async () => {
      const activity = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(activity);
      const notif = await prisma.notification.findFirst({ where: { userId: subscriber.id } });
      await service.markRead(notif!.id, actor.id);
      const refreshed = await prisma.notification.findUnique({ where: { id: notif!.id } });
      expect(refreshed!.readAt).toBeNull();
    });
  });

  describe('markAllRead', () => {
    it('marks all of the user\'s notifications read', async () => {
      const a1 = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(a1);
      const a2 = await makeActivity('archived', {}, actor.id, actor.displayName);
      await service.dispatchFromActivity(a2);
      const result = await service.markAllRead(subscriber.id);
      expect(result.updated).toBe(2);
      const unread = await prisma.notification.count({ where: { userId: subscriber.id, readAt: null } });
      expect(unread).toBe(0);
    });

    it('leaves other users\' notifications untouched', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      await seedSubscription(prisma, task.id, other.id);
      const a1 = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(a1);
      await service.markAllRead(subscriber.id);
      const otherUnread = await prisma.notification.count({ where: { userId: other.id, readAt: null } });
      expect(otherUnread).toBe(1);
    });
  });

  describe('unreadCount', () => {
    it('counts only readAt IS NULL for the user', async () => {
      const a1 = await makeActivity('commented', { commentId: 'c1' }, actor.id, actor.displayName);
      await service.dispatchFromActivity(a1);
      const a2 = await makeActivity('archived', {}, actor.id, actor.displayName);
      await service.dispatchFromActivity(a2);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      await prisma.notification.update({ where: { id: notifs[0].id }, data: { readAt: new Date() } });
      const result = await service.unreadCount(subscriber.id);
      expect(result).toEqual({ count: 1 });
    });
  });
});