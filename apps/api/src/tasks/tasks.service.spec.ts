import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedUser } from '../../test/setup';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;
  let events: EventsService;
  let relations: RelationsService;
  let board: any;
  let user: { id: string; displayName: string };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    relations = new RelationsService(prisma, events);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: RelationsService, useValue: relations },
        { provide: SubscriptionsService, useValue: new SubscriptionsService(prisma) },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
      ],
    }).compile();
    service = module.get<TasksService>(TasksService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    const dbUser = await seedUser(prisma);
    user = { id: dbUser.id, displayName: dbUser.displayName };
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
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

  describe('findByBoard', () => {
    it('should return active tasks for a board', async () => {
      await seedTask(prisma, board.statuses[0].id);
      await seedTask(prisma, board.statuses[1].id);
      const tasks = await service.findByBoard(board.id);
      expect(tasks).toHaveLength(2);
    });

    it('should return all tasks regardless of status (no archive filter)', async () => {
      await seedTask(prisma, board.statuses[0].id);
      await seedTask(prisma, board.statuses[4].id); // a "done" status
      const tasks = await service.findByBoard(board.id);
      expect(tasks).toHaveLength(2);
    });
  });

  describe('findByStatus', () => {
    it('should return tasks in a specific status', async () => {
      await seedTask(prisma, board.statuses[0].id);
      await seedTask(prisma, board.statuses[1].id);
      const tasks = await service.findByStatus(board.statuses[0].id);
      expect(tasks).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should find tasks by title', async () => {
      await seedTask(prisma, board.statuses[0].id, { title: 'Fix login bug' });
      await seedTask(prisma, board.statuses[1].id, { title: 'Add dark mode' });
      const results = await service.search('login');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix login bug');
    });

    it('should find tasks by description', async () => {
      await seedTask(prisma, board.statuses[0].id, { description: 'This is about authentication' });
      const results = await service.search('authentication');
      expect(results).toHaveLength(1);
    });

    it('should return empty for no matches', async () => {
      const results = await service.search('zzzznotfound');
      expect(results).toHaveLength(0);
    });

    it('should find tasks by task number format (e.g. ABC-1)', async () => {
      await seedTask(prisma, board.statuses[0].id, { title: 'Fix login bug' });
      const results = await service.search(`${board.identifier}-1`);
      expect(results).toHaveLength(1);
      expect(results[0].taskNumber).toBe(`${board.identifier}-1`);
    });
  });

  describe('findOne', () => {
    it('should return task with relations', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const task = await service.findOne(seeded.id);
      expect(task.id).toBe(seeded.id);
      expect(task.status).toBeDefined();
      expect(task.labels).toBeDefined();
      expect(task.comments).toBeDefined();
      expect(task.activity).toBeDefined();
    });

    it('should throw on non-existent task', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('Task not found');
    });
  });

  describe('create', () => {
    it('should create a task with default position', async () => {
      const task = await service.create({ statusId: board.statuses[0].id, title: 'New task' }, user);
      expect(task.title).toBe('New task');
      expect(task.position).toBe(0);
      expect(task.priority).toBe('medium');
      expect(task.taskNumber).toBe(`${board.identifier}-1`);
    });

    it('should create a task with labels', async () => {
      const label = await seedLabel(prisma, board.id);
      const task = await service.create({
        statusId: board.statuses[0].id,
        title: 'Bug fix',
        labelIds: [label.id],
      }, user);
      expect(task.labels).toHaveLength(1);
      expect(task.labels[0].label.name).toBe('bug');
    });

    it('should create a task with all fields', async () => {
      const task = await service.create({
        statusId: board.statuses[0].id,
        title: 'Urgent fix',
        description: 'Fix the critical bug',
        priority: 'urgent',
        dueDate: '2026-07-01T00:00:00Z',
      }, user);
      expect(task.priority).toBe('urgent');
      expect(task.assigneeId).toBeNull();
    });

    it('should increment task number for each task on the same board', async () => {
      const task1 = await service.create({ statusId: board.statuses[0].id, title: 'Task 1' }, user);
      const task2 = await service.create({ statusId: board.statuses[1].id, title: 'Task 2' }, user);
      expect(task1.number).toBe(1);
      expect(task2.number).toBe(2);
      expect(task1.taskNumber).toBe(`${board.identifier}-1`);
      expect(task2.taskNumber).toBe(`${board.identifier}-2`);
    });

    it('should log activity on creation', async () => {
      await service.create({ statusId: board.statuses[0].id, title: 'New task' }, user);
      const activity = await prisma.activity.findMany();
      expect(activity).toHaveLength(1);
      expect(activity[0].action).toBe('created');
      expect(activity[0].actorId).toBe(user.id);
      expect(activity[0].actor).toBe(user.displayName);
    });

    it('should log activity with system actor when no user provided', async () => {
      await service.create({ statusId: board.statuses[0].id, title: 'System task' });
      const activity = await prisma.activity.findMany();
      expect(activity[0].actorId).toBeNull();
      expect(activity[0].actor).toBe('system');
    });
  });

  describe('update', () => {
    it('should update task title', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const updated = await service.update(seeded.id, { title: 'Updated title' }, user);
      expect(updated.title).toBe('Updated title');
    });

    it('should update task priority', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const updated = await service.update(seeded.id, { priority: 'urgent' }, user);
      expect(updated.priority).toBe('urgent');
    });

    it('should update labels', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const label = await seedLabel(prisma, board.id);
      const updated = await service.update(seeded.id, { labelIds: [label.id] }, user);
      expect(updated.labels).toHaveLength(1);
    });

    it('should log activity on update', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      await service.update(seeded.id, { title: 'Changed' }, user);
      const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
      expect(activity.some((a) => a.action === 'updated')).toBe(true);
      expect(activity.find((a) => a.action === 'updated')!.actorId).toBe(user.id);
    });
  });

  describe('move', () => {
    it('should move task to another status', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const moved = await service.move(seeded.id, { statusId: board.statuses[2].id }, user);
      expect(moved.statusId).toBe(board.statuses[2].id);
    });

    it('should log activity on move', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      await service.move(seeded.id, { statusId: board.statuses[2].id }, user);
      const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
      const movedActivity = activity.find((a) => a.action === 'moved');
      expect(movedActivity).toBeDefined();
      expect(movedActivity!.actorId).toBe(user.id);
      expect(movedActivity!.actor).toBe(user.displayName);
    });
  });

  describe('move — doneAt stamping', () => {
    it('moving into an isDone status stamps doneAt', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const moved = await service.move(seeded.id, { statusId: board.statuses[4].id }, user);
      expect(moved.doneAt).not.toBeNull();
    });

    it('moving out of an isDone status clears doneAt', async () => {
      const doneStatus = board.statuses[4]; // isDone: true
      const seeded = await seedTask(prisma, doneStatus.id, { doneAt: new Date() });
      const moved = await service.move(seeded.id, { statusId: board.statuses[0].id }, user);
      expect(moved.doneAt).toBeNull();
    });

    it('moving between non-done statuses leaves doneAt null', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      const moved = await service.move(seeded.id, { statusId: board.statuses[1].id }, user);
      expect(moved.doneAt).toBeNull();
    });
  });

  describe('reorder', () => {
    it('should reorder tasks within a status', async () => {
      const t1 = await seedTask(prisma, board.statuses[0].id, { position: 0 });
      const t2 = await seedTask(prisma, board.statuses[0].id, { position: 1 });
      await service.reorder({ items: [{ id: t1.id, position: 1 }, { id: t2.id, position: 0 }] });
      const tasks = await service.findByStatus(board.statuses[0].id);
      expect(tasks[0].id).toBe(t2.id);
      expect(tasks[1].id).toBe(t1.id);
    });
  });

  describe('remove', () => {
    it('should hard-delete a task', async () => {
      const seeded = await seedTask(prisma, board.statuses[0].id);
      await service.remove(seeded.id, user);
      await expect(prisma.task.findUnique({ where: { id: seeded.id } })).resolves.toBeNull();
    });
  });

  describe('attachLabel', () => {
    it('should attach a label to a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const label = await seedLabel(prisma, board.id);
      const taskLabel = await service.attachLabel(task.id, label.id);
      expect(taskLabel.taskId).toBe(task.id);
      expect(taskLabel.labelId).toBe(label.id);
      expect(taskLabel.label).toBeDefined();
      expect(taskLabel.label.name).toBe('bug');
    });

    it('should throw on non-existent task', async () => {
      const label = await seedLabel(prisma, board.id);
      await expect(service.attachLabel('nonexistent', label.id)).rejects.toThrow('Task not found');
    });
  });

  describe('detachLabel', () => {
    it('should detach a label from a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const label = await seedLabel(prisma, board.id);
      await service.attachLabel(task.id, label.id);
      await service.detachLabel(task.id, label.id);
      const refreshed = await service.findOne(task.id);
      expect(refreshed.labels).toHaveLength(0);
    });

    it('should throw on non-existent task', async () => {
      const label = await seedLabel(prisma, board.id);
      await expect(service.detachLabel('nonexistent', label.id)).rejects.toThrow('Task not found');
    });
  });

  // ─── Sub-tasks (single-level nesting) ───────────────────────────────────────

  describe('sub-tasks', () => {
    it('1. create with parentId → parentId set; activity logged', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await service.create(
        { statusId: board.statuses[0].id, title: 'Child', parentId: parent.id },
        user,
      );
      expect(child.parentId).toBe(parent.id);
      const activity = await prisma.activity.findFirst({ where: { taskId: child.id, action: 'created' } });
      expect(activity).not.toBeNull();
      expect(activity!.detail).toContain(parent.id);
    });

    it('2. create with non-existent parentId → NotFoundException', async () => {
      await expect(
        service.create({ statusId: board.statuses[0].id, title: 'Orphan', parentId: 'nope' }, user),
      ).rejects.toThrow('Parent task not found');
    });

    it('3. create with parentId from different board → succeeds (cross-board sub-tasks allowed)', async () => {
      const otherBoard = await seedBoard(prisma);
      const foreignParent = await seedTask(prisma, otherBoard.statuses[0].id, { title: 'Foreign' });
      const child = await service.create({ statusId: board.statuses[0].id, title: 'Child', parentId: foreignParent.id }, user);
      expect(child.parentId).toBe(foreignParent.id);
    });

    it('4. create with parentId pointing to a task that already has parentId → BadRequestException (C4)', async () => {
      const grandparent = await seedTask(prisma, board.statuses[0].id, { title: 'Grandparent' });
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent', parentId: grandparent.id });
      await expect(
        service.create({ statusId: board.statuses[0].id, title: 'Child', parentId: parent.id }, user),
      ).rejects.toThrow('Sub-tasks cannot have sub-tasks (single level only)');
    });

    it('5. update to set parentId → succeeds; activity mentions parent', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await seedTask(prisma, board.statuses[0].id, { title: 'Child' });
      const updated = await service.update(child.id, { parentId: parent.id }, user);
      expect(updated.parentId).toBe(parent.id);
      const activity = await prisma.activity.findFirst({
        where: { taskId: child.id, action: 'updated' },
      });
      expect(activity).not.toBeNull();
      expect(activity!.detail).toContain(parent.id);
    });

    it('6. update to set parentId to own id → BadRequestException (C1)', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Self' });
      await expect(
        service.update(task.id, { parentId: task.id }, user),
      ).rejects.toThrow('A task cannot be its own parent');
    });

    it('7. update to set parentId on a task that already has children → BadRequestException (C5)', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const newParent = await seedTask(prisma, board.statuses[0].id, { title: 'NewParent' });
      // parent already has children → cannot be nested under newParent.
      await expect(
        service.update(parent.id, { parentId: newParent.id }, user),
      ).rejects.toThrow('Cannot nest a task that already has sub-tasks');
    });

    it('8. update to set parentId on a task whose prospective parent is itself a sub-task → BadRequestException (C4)', async () => {
      const grandparent = await seedTask(prisma, board.statuses[0].id, { title: 'Grandparent' });
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent', parentId: grandparent.id });
      const target = await seedTask(prisma, board.statuses[0].id, { title: 'Target' });
      await expect(
        service.update(target.id, { parentId: parent.id }, user),
      ).rejects.toThrow('Sub-tasks cannot have sub-tasks (single level only)');
    });

    it('9. update parentId to null → un-nests', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const updated = await service.update(child.id, { parentId: null }, user);
      expect(updated.parentId).toBeNull();
    });

    it('10. findByBoard include=top → only parentId IS NULL', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const tasks = await service.findByBoard(board.id, { include: 'top' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(parent.id);
    });

    it('11. findByBoard include=sub → only sub-tasks', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const tasks = await service.findByBoard(board.id, { include: 'sub' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(child.id);
    });

    it('12. findByBoard parentId=<id> → only that parent\'s children', async () => {
      const parentA = await seedTask(prisma, board.statuses[0].id, { title: 'ParentA' });
      const parentB = await seedTask(prisma, board.statuses[0].id, { title: 'ParentB' });
      await seedTask(prisma, board.statuses[0].id, { title: 'ChildA1', parentId: parentA.id });
      await seedTask(prisma, board.statuses[0].id, { title: 'ChildB1', parentId: parentB.id });
      const tasks = await service.findByBoard(board.id, { parentId: parentA.id });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].parentId).toBe(parentA.id);
    });

    it('13. findByBoard default (all) → both', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const tasks = await service.findByBoard(board.id);
      expect(tasks).toHaveLength(2);
    });

    it('14. remove a parent (hard-delete) → parent gone; children parentId cleared; task:updated emitted per child', async () => {
      const emitSpy = jest.spyOn(events, 'emit');
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child1 = await seedTask(prisma, board.statuses[0].id, { title: 'Child1', parentId: parent.id });
      const child2 = await seedTask(prisma, board.statuses[0].id, { title: 'Child2', parentId: parent.id });

      await service.remove(parent.id, user);

      // Parent is hard-deleted.
      const refreshedParent = await prisma.task.findUnique({ where: { id: parent.id } });
      expect(refreshedParent).toBeNull();

      const refreshedChild1 = await prisma.task.findUnique({ where: { id: child1.id } });
      const refreshedChild2 = await prisma.task.findUnique({ where: { id: child2.id } });
      expect(refreshedChild1!.parentId).toBeNull();
      expect(refreshedChild2!.parentId).toBeNull();

      const updatedEvents = emitSpy.mock.calls.filter((c) => c[0] === 'task:updated');
      // one per child (order not guaranteed)
      const updatedPayloadIds = updatedEvents.map((c) => c[1]?.id).sort();
      expect(updatedPayloadIds).toEqual([child1.id, child2.id].sort());
      emitSpy.mockRestore();
    });

    it('15. move a sub-task to a different status → succeeds; parentId retained', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const moved = await service.move(child.id, { statusId: board.statuses[2].id }, user);
      expect(moved.statusId).toBe(board.statuses[2].id);
      expect(moved.parentId).toBe(parent.id);
    });

    it('16. sub-task moved independently of parent → parent stays in its status', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const child = await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      await service.move(child.id, { statusId: board.statuses[2].id }, user);
      const refreshedParent = await prisma.task.findUnique({ where: { id: parent.id } });
      expect(refreshedParent!.statusId).toBe(board.statuses[0].id);
    });
  });

  describe('subscriptions + notifications integration', () => {
    it('creating a task subscribes the creator', async () => {
      const task = await service.create({ statusId: board.statuses[0].id, title: 'New task' }, user);
      const sub = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
      });
      expect(sub).not.toBeNull();
    });

    it('creating a task without a user does NOT subscribe anyone', async () => {
      const task = await service.create({ statusId: board.statuses[0].id, title: 'System task' });
      const subs = await prisma.taskSubscription.findMany({ where: { taskId: task.id } });
      expect(subs).toHaveLength(0);
    });

    it('comment by actor notifies a non-actor subscriber via CommentsService', async () => {
      // covered in comments.service.spec.ts
    });

    it('updating title only does NOT notify subscribers', async () => {
      const task = await service.create({ statusId: board.statuses[0].id, title: 'New task' }, user);
      const other = await seedUser(prisma, { displayName: 'Other' });
      await prisma.taskSubscription.create({ data: { taskId: task.id, userId: other.id } });
      await service.update(task.id, { title: 'Renamed' }, user);
      const notifs = await prisma.notification.findMany({ where: { userId: other.id } });
      expect(notifs).toHaveLength(0);
    });

    it('moving a task does NOT notify subscribers', async () => {
      const task = await service.create({ statusId: board.statuses[0].id, title: 'New task' }, user);
      const other = await seedUser(prisma, { displayName: 'Other' });
      await prisma.taskSubscription.create({ data: { taskId: task.id, userId: other.id } });
      await service.move(task.id, { statusId: board.statuses[2].id }, user);
      const notifs = await prisma.notification.findMany({ where: { userId: other.id } });
      expect(notifs).toHaveLength(0);
    });
  });

  describe('setPublic', () => {
    it('publishes a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);

      const result = await service.setPublic(task.id, true, user);

      expect(result.isPublic).toBe(true);
      const stored = await prisma.task.findUnique({ where: { id: task.id } });
      expect(stored.isPublic).toBe(true);
    });

    it('unpublishes a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      const result = await service.setPublic(task.id, false, user);

      expect(result.isPublic).toBe(false);
      const stored = await prisma.task.findUnique({ where: { id: task.id } });
      expect(stored.isPublic).toBe(false);
    });

    it('logs a published activity row', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);

      await service.setPublic(task.id, true, user);

      const activity = await prisma.activity.findMany({ where: { taskId: task.id } });
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({ action: 'published', actor: user.displayName, actorId: user.id });
    });

    it('logs an unpublished activity row — the un-share must be auditable', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      await service.setPublic(task.id, false, user);

      const activity = await prisma.activity.findMany({ where: { taskId: task.id } });
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({ action: 'unpublished' });
    });

    it('records "system" as the actor when there is no user', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);

      await service.setPublic(task.id, true);

      const activity = await prisma.activity.findFirst({ where: { taskId: task.id } });
      expect(activity).toMatchObject({ actor: 'system', actorId: null });
    });

    it('is idempotent and writes no activity when state is unchanged', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { isPublic: true });

      const result = await service.setPublic(task.id, true, user);

      expect(result.isPublic).toBe(true);
      const activity = await prisma.activity.findMany({ where: { taskId: task.id } });
      expect(activity).toHaveLength(0);
    });

    it('emits task:updated on a real change', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const spy = jest.spyOn(events, 'emit');

      await service.setPublic(task.id, true, user);

      expect(spy).toHaveBeenCalledWith('task:updated', expect.objectContaining({ isPublic: true }), board.id);
      spy.mockRestore();
    });

    it('throws NotFound for an unknown task', async () => {
      await expect(service.setPublic('does-not-exist', true, user)).rejects.toThrow('Task not found');
    });
  });
});
