import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createTestPrisma, seedBoard, seedTask, seedComment, seedUser, seedSubscription } from '../../test/setup';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let task: any;
  let user: { id: string; displayName: string; role: string };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
      ],
    }).compile();
    service = module.get<CommentsService>(CommentsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    task = await seedTask(prisma, board.statuses[0].id);
    const dbUser = await seedUser(prisma);
    user = { id: dbUser.id, displayName: dbUser.displayName, role: dbUser.role };
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('findByTask', () => {
    it('should return comments in reverse chronological order', async () => {
      await seedComment(prisma, task.id, { body: 'First' });
      await new Promise(r => setTimeout(r, 5));
      await seedComment(prisma, task.id, { body: 'Second' });
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(2);
      expect(comments[0].body).toBe('Second');
    });
  });

  describe('create', () => {
    it('should create a comment with authenticated user', async () => {
      const comment = await service.create({ taskId: task.id, body: 'Looks good!' }, user);
      expect(comment.author).toBe(user.displayName);
      expect(comment.authorId).toBe(user.id);
      expect(comment.body).toBe('Looks good!');
    });

    it('should create a comment with dto author fallback', async () => {
      const comment = await service.create({ taskId: task.id, author: 'alice', body: 'Fallback' });
      expect(comment.author).toBe('alice');
      expect(comment.authorId).toBeNull();
    });

    it('should log activity on comment with user', async () => {
      await service.create({ taskId: task.id, body: 'Needs review' }, user);
      const activity = await prisma.activity.findMany({ where: { taskId: task.id } });
      const commentActivity = activity.find((a) => a.action === 'commented');
      expect(commentActivity).toBeDefined();
      expect(commentActivity!.actorId).toBe(user.id);
      expect(commentActivity!.actor).toBe(user.displayName);
    });
  });

  describe('remove', () => {
    it('should delete a comment', async () => {
      const comment = await seedComment(prisma, task.id);
      await service.remove(comment.id);
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(0);
    });

    it('should allow the author to delete their own comment', async () => {
      const comment = await service.create({ taskId: task.id, body: 'My comment' }, user);
      await service.remove(comment.id, user);
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(0);
    });

    it('should forbid a non-author non-admin from deleting', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      const comment = await service.create({ taskId: task.id, body: 'Not yours' }, user);
      await expect(
        service.remove(comment.id, { id: other.id, role: other.role }),
      ).rejects.toThrow('You can only delete your own comments');
      // Comment should still exist
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(1);
    });

    it('should allow admin to delete any comment', async () => {
      const admin = await seedUser(prisma, { displayName: 'Admin', role: 'admin' });
      const comment = await service.create({ taskId: task.id, body: 'Admin will delete' }, user);
      await service.remove(comment.id, { id: admin.id, role: 'admin' });
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(0);
    });

    it('should allow admin to delete anonymous (authorId null) comments', async () => {
      const admin = await seedUser(prisma, { displayName: 'Admin', role: 'admin' });
      const comment = await seedComment(prisma, task.id, { authorId: null, author: 'system' });
      await service.remove(comment.id, { id: admin.id, role: 'admin' });
      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(0);
    });

    it('should forbid non-admin from deleting anonymous comments', async () => {
      const comment = await seedComment(prisma, task.id, { authorId: null, author: 'system' });
      await expect(
        service.remove(comment.id, user),
      ).rejects.toThrow('You can only delete your own comments');
    });

    it('should log activity on delete', async () => {
      const comment = await service.create({ taskId: task.id, body: 'Will be deleted' }, user);
      await service.remove(comment.id, user);
      const activity = await prisma.activity.findMany({
        where: { taskId: task.id, action: 'deleted_comment' },
      });
      expect(activity).toHaveLength(1);
      expect(activity[0].actorId).toBe(user.id);
    });
  });

  describe('notifications integration', () => {
    it('comment by actor notifies a non-actor subscriber', async () => {
      const subscriber = await seedUser(prisma, { displayName: 'Subscriber' });
      await seedSubscription(prisma, task.id, subscriber.id);
      await service.create({ taskId: task.id, body: 'Hello' }, user);
      const notifs = await prisma.notification.findMany({ where: { userId: subscriber.id } });
      expect(notifs).toHaveLength(1);
      expect(notifs[0].action).toBe('commented');
      expect(notifs[0].summary).toContain(user.displayName);
    });

    it('actor commenting on a task they subscribe to does NOT notify themselves', async () => {
      await seedSubscription(prisma, task.id, user.id);
      await service.create({ taskId: task.id, body: 'Self comment' }, user);
      const notifs = await prisma.notification.findMany({ where: { userId: user.id } });
      expect(notifs).toHaveLength(0);
    });
  });
});
