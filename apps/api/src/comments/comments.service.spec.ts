import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedComment,
  seedUser,
  seedSubscription,
} from '../../test/setup';

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
    await prisma.commentReaction.deleteMany();
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
      await new Promise((r) => setTimeout(r, 5));
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

    it('should include the task id in the deleted event payload', async () => {
      const comment = await seedComment(prisma, task.id);
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'comment:deleted') emitted.push(payload);
      });

      await service.remove(comment.id);

      subscription.unsubscribe();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data).toEqual({ id: comment.id, taskId: task.id });
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
      await expect(service.remove(comment.id, { id: other.id, role: other.role })).rejects.toThrow(
        'You can only delete your own comments',
      );
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
      await expect(service.remove(comment.id, user)).rejects.toThrow(
        'You can only delete your own comments',
      );
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

  describe('update', () => {
    it('allows the author to edit and stamps editedAt on first edit', async () => {
      const comment = await service.create({ taskId: task.id, body: 'Original' }, user);
      const before = comment.editedAt;
      expect(before).toBeNull();

      const updated = await service.update(comment.id, 'Edited body', user);
      expect(updated.body).toBe('Edited body');
      expect(updated.editedAt).not.toBeNull();
      const firstEditedAt = updated.editedAt;
      expect(firstEditedAt).toBeInstanceOf(Date);
    });

    it('uses one first-edit timestamp for concurrent edits', async () => {
      const comment = await service.create({ taskId: task.id, body: 'Original' }, user);
      const originalFindUnique = prisma.comment.findUnique.bind(prisma.comment) as any;
      let readCount = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      const findUniqueSpy = jest.spyOn(prisma.comment, 'findUnique').mockImplementation((async (
        args: any,
      ) => {
        const result = await originalFindUnique(args);
        readCount += 1;
        if (readCount === 2) release();
        await bothRead;
        return result;
      }) as any);

      const results = await Promise.all([
        service.update(comment.id, 'First concurrent edit', user),
        service.update(comment.id, 'Second concurrent edit', user),
      ]);

      findUniqueSpy.mockRestore();
      const editedAtValues = results.map((result) => result.editedAt);
      expect(editedAtValues.every((editedAt) => editedAt instanceof Date)).toBe(true);
      expect(editedAtValues[0]).toEqual(editedAtValues[1]);

      const stored = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(stored?.editedAt).toEqual(editedAtValues[0]);
    });

    it('keeps the first editedAt on subsequent edits', async () => {
      const comment = await service.create({ taskId: task.id, body: 'v1' }, user);
      const first = await service.update(comment.id, 'v2', user);
      await new Promise((r) => setTimeout(r, 5));
      const second = await service.update(comment.id, 'v3', user);
      expect(second.body).toBe('v3');
      expect(second.editedAt).toEqual(first.editedAt);
    });

    it('allows admin to edit any comment', async () => {
      const admin = await seedUser(prisma, { displayName: 'Admin', role: 'admin' });
      const comment = await service.create({ taskId: task.id, body: 'By user' }, user);
      const updated = await service.update(comment.id, 'admin edit', {
        id: admin.id,
        displayName: admin.displayName,
        role: 'admin',
      });
      expect(updated.body).toBe('admin edit');
    });

    it('forbids non-author non-admin from editing', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      const comment = await service.create({ taskId: task.id, body: 'mine' }, user);
      await expect(
        service.update(comment.id, 'hacked', {
          id: other.id,
          displayName: other.displayName,
          role: other.role,
        }),
      ).rejects.toThrow('You can only edit your own comments');
    });

    it('forbids non-admin from editing anonymous comments', async () => {
      const comment = await seedComment(prisma, task.id, { authorId: null, author: 'system' });
      await expect(service.update(comment.id, 'edit', user)).rejects.toThrow(
        'You can only edit your own comments',
      );
    });

    it('allows admin to edit anonymous comments', async () => {
      const admin = await seedUser(prisma, { displayName: 'Admin', role: 'admin' });
      const comment = await seedComment(prisma, task.id, { authorId: null, author: 'system' });
      const updated = await service.update(comment.id, 'admin anon edit', {
        id: admin.id,
        displayName: admin.displayName,
        role: 'admin',
      });
      expect(updated.body).toBe('admin anon edit');
    });

    it('returns and emits grouped reactions when editing a comment', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      const comment = await service.create({ taskId: task.id, body: 'orig' }, user);
      await prisma.commentReaction.createMany({
        data: [
          { commentId: comment.id, userId: user.id, emoji: '👍' },
          { commentId: comment.id, userId: other.id, emoji: '👍' },
        ],
      });
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'comment:updated') emitted.push(payload);
      });

      const updated = await service.update(comment.id, 'edited', user);

      subscription.unsubscribe();
      expect(updated.reactions).toEqual([{ emoji: '👍', userIds: [user.id, other.id] }]);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.reactions).toEqual([{ emoji: '👍', userIds: [user.id, other.id] }]);
    });

    it('logs a comment_edited activity', async () => {
      const comment = await service.create({ taskId: task.id, body: 'orig' }, user);
      await service.update(comment.id, 'edited', user);
      const activity = await prisma.activity.findMany({
        where: { taskId: task.id, action: 'comment_edited' },
      });
      expect(activity).toHaveLength(1);
      expect(activity[0].actorId).toBe(user.id);
    });

    it('throws NotFound for a missing comment', async () => {
      await expect(service.update('nope', 'x', user)).rejects.toThrow('Comment not found');
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

  describe('react', () => {
    it('toggles a reaction on and returns the emoji with userIds', async () => {
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      const res = await service.react(comment.id, '👍', user);
      expect(res.emoji).toBe('👍');
      expect(res.userIds).toEqual([user.id]);
    });

    it('toggles a reaction off when called twice', async () => {
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      await service.react(comment.id, '👍', user);
      const res = await service.react(comment.id, '👍', user);
      expect(res.emoji).toBe('👍');
      expect(res.userIds).toEqual([]);
    });

    it('rejects an unknown emoji with 400', async () => {
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      await expect(service.react(comment.id, '🦄', user)).rejects.toThrow('Invalid reaction emoji');
    });

    it('groups multiple users on the same emoji', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      await service.react(comment.id, '👍', user);
      await service.react(comment.id, '👍', {
        id: other.id,
        displayName: other.displayName,
        role: other.role,
      });
      const res = await service.react(comment.id, '👍', user);
      // user toggled off, other remains
      expect(res.userIds).toEqual([other.id]);
    });

    it('does not create an activity entry', async () => {
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      await service.react(comment.id, '👍', user);
      const activity = await prisma.activity.findMany({
        where: { taskId: task.id, action: 'comment_reacted' },
      });
      expect(activity).toHaveLength(0);
    });

    it('throws NotFound for a missing comment', async () => {
      await expect(service.react('nope', '👍', user)).rejects.toThrow('Comment not found');
    });

    it('serializes concurrent toggles for the same user and emoji', async () => {
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);

      const results = await Promise.all([
        service.react(comment.id, '👍', user),
        service.react(comment.id, '👍', user),
      ]);

      expect(results.map((result) => result.userIds).sort((a, b) => a.length - b.length)).toEqual([
        [],
        [user.id],
      ]);
      const stored = await prisma.commentReaction.findMany({ where: { commentId: comment.id } });
      expect(stored).toHaveLength(0);
    });
  });

  describe('findByTask reactions', () => {
    it('includes grouped reactions per comment', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      const comment = await service.create({ taskId: task.id, body: 'c' }, user);
      await service.react(comment.id, '👍', user);
      await service.react(comment.id, '👍', {
        id: other.id,
        displayName: other.displayName,
        role: other.role,
      });
      await service.react(comment.id, '🎉', user);

      const comments = await service.findByTask(task.id);
      expect(comments).toHaveLength(1);
      const reactions = comments[0].reactions;
      expect(reactions).toBeDefined();
      // ordered by emoji ascending: 👍 before 🎉? UTF-16 code units: 🎉=U+1F389, 👍=U+1F44D
      // 🎉 < 👍 lexicographically by surrogate pair, so 🎉 comes first.
      const emojis = reactions!.map((r) => r.emoji);
      expect(emojis).toEqual(['🎉', '👍']);
      const thumbs = reactions!.find((r) => r.emoji === '👍');
      expect(thumbs!.userIds).toHaveLength(2);
      expect(thumbs!.userIds).toContain(user.id);
      expect(thumbs!.userIds).toContain(other.id);
    });

    it('returns an empty reactions array for a comment with no reactions', async () => {
      await service.create({ taskId: task.id, body: 'no reactions' }, user);
      const comments = await service.findByTask(task.id);
      expect(comments[0].reactions).toEqual([]);
    });
  });
});
