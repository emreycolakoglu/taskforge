import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MentionsService } from '../mentions/mentions.service';
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
        {
          provide: MentionsService,
          useValue: new MentionsService(prisma, new NotificationsService(prisma, events)),
        },
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

    it('should subscribe and notify a mentioned user on comment create', async () => {
      const mentioned = await seedUser(prisma, { displayName: 'Bob' });

      await service.create({ taskId: task.id, body: 'hey @Bob, take a look' }, user);

      const sub = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: mentioned.id } },
      });
      expect(sub).not.toBeNull();
      const notification = await prisma.notification.findFirst({
        where: { userId: mentioned.id, action: 'mentioned' },
      });
      expect(notification).not.toBeNull();
    });

    it('should not double-notify an already-subscribed mentioned user', async () => {
      const mentioned = await seedUser(prisma, { displayName: 'Bob' });
      await seedSubscription(prisma, task.id, mentioned.id);

      await service.create({ taskId: task.id, body: 'again @Bob' }, user);

      const notifications = await prisma.notification.findMany({ where: { taskId: task.id } });
      expect(notifications.every((n) => n.action !== 'mentioned')).toBe(true);
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

    it('rolls back the comment update when comment_edited activity creation fails', async () => {
      const comment = await service.create({ taskId: task.id, body: 'orig' }, user);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER fail_comment_edited_activity
        BEFORE INSERT ON "Activity"
        WHEN NEW.action = 'comment_edited'
        BEGIN
          SELECT RAISE(ABORT, 'comment activity failure');
        END;
      `);

      try {
        await expect(service.update(comment.id, 'should roll back', user)).rejects.toThrow();
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER fail_comment_edited_activity');
      }

      const stored = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(stored?.body).toBe('orig');
      expect(stored?.editedAt).toBeNull();
      const editedActivities = await prisma.activity.findMany({
        where: { taskId: task.id, action: 'comment_edited' },
      });
      expect(editedActivities).toHaveLength(0);
    });

    it('throws NotFound for a missing comment', async () => {
      await expect(service.update('nope', 'x', user)).rejects.toThrow('Comment not found');
    });

    it('should resolve new mentions from comment edits', async () => {
      const comment = await service.create({ taskId: task.id, body: 'cc @Dee' }, user);
      const dee = await seedUser(prisma, { displayName: 'Dee' });

      await service.update(comment.id, 'now pinging @Dee for real', user);

      const sub = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: dee.id } },
      });
      expect(sub).not.toBeNull();
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

  describe('threaded replies', () => {
    describe('create', () => {
      it('creates a reply with a valid parentId', async () => {
        const parent = await service.create({ taskId: task.id, body: 'parent' }, user);
        const reply = await service.create(
          { taskId: task.id, body: 'child', parentId: parent.id },
          user,
        );
        expect(reply.parentId).toBe(parent.id);
      });

      it('rejects a parentId belonging to another task', async () => {
        const otherTask = await seedTask(prisma, board.statuses[0].id);
        const parent = await service.create({ taskId: otherTask.id, body: 'parent' }, user);
        await expect(
          service.create({ taskId: task.id, body: 'child', parentId: parent.id }, user),
        ).rejects.toThrow('Invalid parent comment');
      });

      it('rejects a missing parentId', async () => {
        await expect(
          service.create({ taskId: task.id, body: 'child', parentId: 'nope' }, user),
        ).rejects.toThrow('Invalid parent comment');
      });

      it('allows replying to a tombstoned comment', async () => {
        const parent = await seedComment(prisma, task.id, { body: 'parent' });
        await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
        await service.remove(parent.id);
        const reply = await service.create(
          { taskId: task.id, body: 'late reply', parentId: parent.id },
          user,
        );
        expect(reply.parentId).toBe(parent.id);
      });
    });

    describe('findByTask', () => {
      it('returns a nested tree: roots newest-first, replies oldest-first', async () => {
        const root1 = await service.create({ taskId: task.id, body: 'root1' }, user);
        await new Promise((r) => setTimeout(r, 5));
        const root2 = await service.create({ taskId: task.id, body: 'root2' }, user);
        await new Promise((r) => setTimeout(r, 5));
        const reply1 = await service.create(
          { taskId: task.id, body: 'reply1', parentId: root1.id },
          user,
        );
        await new Promise((r) => setTimeout(r, 5));
        await service.create({ taskId: task.id, body: 'reply2', parentId: root1.id }, user);
        await new Promise((r) => setTimeout(r, 5));
        await service.create({ taskId: task.id, body: 'deep', parentId: reply1.id }, user);

        const tree = await service.findByTask(task.id);
        expect(tree.map((c) => c.body)).toEqual(['root2', 'root1']);
        const replies = tree[1].replies;
        expect(replies.map((c) => c.body)).toEqual(['reply1', 'reply2']);
        expect(replies[0].replies.map((c) => c.body)).toEqual(['deep']);
        expect(tree[1].replies[1].replies).toEqual([]);
      });

      it('promotes orphaned replies to roots (defensive; parents are same-task by validation)', async () => {
        // The FK constraint blocks seeding a truly missing parentId, so use a
        // parent from another task and re-point the stored row without it.
        const otherTask = await seedTask(prisma, board.statuses[0].id);
        const staleParent = await seedComment(prisma, otherTask.id, {
          body: 'stale parent',
        });
        const orphan = await seedComment(prisma, task.id, {
          body: 'orphan',
          parentId: staleParent.id,
        });
        await prisma.comment.delete({ where: { id: staleParent.id } }); // onDelete: SetNull orphans the reply
        const refreshed = await prisma.comment.findUnique({ where: { id: orphan.id } });
        expect(refreshed!.parentId).toBeNull();

        const tree = await service.findByTask(task.id);
        expect(tree).toHaveLength(1);
        expect(tree[0].body).toBe('orphan');
        expect(tree[0].replies).toEqual([]);
      });
    });

    describe('remove with replies', () => {
      it('tombstones a comment with replies: keeps the row, blanks body, sets deletedAt', async () => {
        const parent = await seedComment(prisma, task.id, { body: 'parent' });
        await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });

        await service.remove(parent.id);

        const stored = await prisma.comment.findUnique({ where: { id: parent.id } });
        expect(stored).not.toBeNull();
        expect(stored!.deletedAt).not.toBeNull();
        expect(stored!.body).toBe('');
        expect(stored!.author).toBe('tester');

        const tree = await service.findByTask(task.id);
        expect(tree).toHaveLength(1);
        expect(tree[0].deletedAt).not.toBeNull();
        expect(tree[0].replies.map((c) => c.body)).toEqual(['child']);
      });

      it('hard-deletes a leaf comment (existing behavior preserved)', async () => {
        const leaf = await seedComment(prisma, task.id, { body: 'leaf' });
        await service.remove(leaf.id);
        const stored = await prisma.comment.findUnique({ where: { id: leaf.id } });
        expect(stored).toBeNull();
      });

      it('emits comment:deleted and logs activity for a tombstone too', async () => {
        const parent = await seedComment(prisma, task.id, { body: 'parent' });
        await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
        const emitted: any[] = [];
        const subscription = events.observe().subscribe((payload) => {
          if (payload.event === 'comment:deleted') emitted.push(payload);
        });

        await service.remove(parent.id);
        subscription.unsubscribe();

        expect(emitted).toHaveLength(1);
        expect(emitted[0].data).toEqual({ id: parent.id, taskId: task.id });
        const activity = await prisma.activity.findMany({
          where: { taskId: task.id, action: 'deleted_comment' },
        });
        expect(activity).toHaveLength(1);
      });
    });

    describe('update on tombstone', () => {
      it('rejects editing a tombstoned comment', async () => {
        const parent = await seedComment(prisma, task.id, { body: 'parent' });
        await seedComment(prisma, task.id, { body: 'child', parentId: parent.id });
        await service.remove(parent.id);
        await expect(service.update(parent.id, 'nope', user)).rejects.toThrow(
          'Cannot edit a deleted comment',
        );
      });
    });
  });
});
