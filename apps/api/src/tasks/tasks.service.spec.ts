import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedUser } from '../../test/setup';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let user: { id: string; displayName: string };

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
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
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('findByBoard', () => {
    it('should return active tasks for a board', async () => {
      await seedTask(prisma, board.lists[0].id);
      await seedTask(prisma, board.lists[1].id);
      const tasks = await service.findByBoard(board.id);
      expect(tasks).toHaveLength(2);
    });

    it('should not return archived tasks', async () => {
      await seedTask(prisma, board.lists[0].id, { status: 'archived' });
      const tasks = await service.findByBoard(board.id);
      expect(tasks).toHaveLength(0);
    });
  });

  describe('findByList', () => {
    it('should return tasks in a specific list', async () => {
      await seedTask(prisma, board.lists[0].id);
      await seedTask(prisma, board.lists[1].id);
      const tasks = await service.findByList(board.lists[0].id);
      expect(tasks).toHaveLength(1);
    });
  });

  describe('search', () => {
    it('should find tasks by title', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Fix login bug' });
      await seedTask(prisma, board.lists[1].id, { title: 'Add dark mode' });
      const results = await service.search('login');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fix login bug');
    });

    it('should find tasks by description', async () => {
      await seedTask(prisma, board.lists[0].id, { description: 'This is about authentication' });
      const results = await service.search('authentication');
      expect(results).toHaveLength(1);
    });

    it('should return empty for no matches', async () => {
      const results = await service.search('zzzznotfound');
      expect(results).toHaveLength(0);
    });

    it('should find tasks by task number format (e.g. ABC-1)', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Fix login bug' });
      const results = await service.search(`${board.identifier}-1`);
      expect(results).toHaveLength(1);
      expect(results[0].taskNumber).toBe(`${board.identifier}-1`);
    });
  });

  describe('findOne', () => {
    it('should return task with relations', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const task = await service.findOne(seeded.id);
      expect(task.id).toBe(seeded.id);
      expect(task.list).toBeDefined();
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
      const task = await service.create({ listId: board.lists[0].id, title: 'New task' }, user);
      expect(task.title).toBe('New task');
      expect(task.position).toBe(0);
      expect(task.priority).toBe('medium');
      expect(task.taskNumber).toBe(`${board.identifier}-1`);
    });

    it('should create a task with labels', async () => {
      const label = await seedLabel(prisma, board.id);
      const task = await service.create({
        listId: board.lists[0].id,
        title: 'Bug fix',
        labelIds: [label.id],
      }, user);
      expect(task.labels).toHaveLength(1);
      expect(task.labels[0].label.name).toBe('bug');
    });

    it('should create a task with all fields', async () => {
      const task = await service.create({
        listId: board.lists[0].id,
        title: 'Urgent fix',
        description: 'Fix the critical bug',
        priority: 'urgent',
        dueDate: '2026-07-01T00:00:00Z',
      }, user);
      expect(task.priority).toBe('urgent');
      expect(task.assigneeId).toBeNull();
    });

    it('should increment task number for each task on the same board', async () => {
      const task1 = await service.create({ listId: board.lists[0].id, title: 'Task 1' }, user);
      const task2 = await service.create({ listId: board.lists[1].id, title: 'Task 2' }, user);
      expect(task1.number).toBe(1);
      expect(task2.number).toBe(2);
      expect(task1.taskNumber).toBe(`${board.identifier}-1`);
      expect(task2.taskNumber).toBe(`${board.identifier}-2`);
    });

    it('should log activity on creation', async () => {
      await service.create({ listId: board.lists[0].id, title: 'New task' }, user);
      const activity = await prisma.activity.findMany();
      expect(activity).toHaveLength(1);
      expect(activity[0].action).toBe('created');
      expect(activity[0].actorId).toBe(user.id);
      expect(activity[0].actor).toBe(user.displayName);
    });

    it('should log activity with system actor when no user provided', async () => {
      await service.create({ listId: board.lists[0].id, title: 'System task' });
      const activity = await prisma.activity.findMany();
      expect(activity[0].actorId).toBeNull();
      expect(activity[0].actor).toBe('system');
    });
  });

  describe('update', () => {
    it('should update task title', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const updated = await service.update(seeded.id, { title: 'Updated title' }, user);
      expect(updated.title).toBe('Updated title');
    });

    it('should update task priority', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const updated = await service.update(seeded.id, { priority: 'urgent' }, user);
      expect(updated.priority).toBe('urgent');
    });

    it('should update labels', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const label = await seedLabel(prisma, board.id);
      const updated = await service.update(seeded.id, { labelIds: [label.id] }, user);
      expect(updated.labels).toHaveLength(1);
    });

    it('should log activity on update', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      await service.update(seeded.id, { title: 'Changed' }, user);
      const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
      expect(activity.some((a) => a.action === 'updated')).toBe(true);
      expect(activity.find((a) => a.action === 'updated')!.actorId).toBe(user.id);
    });
  });

  describe('move', () => {
    it('should move task to another list', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const moved = await service.move(seeded.id, { listId: board.lists[2].id }, user);
      expect(moved.listId).toBe(board.lists[2].id);
    });

    it('should log activity on move', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      await service.move(seeded.id, { listId: board.lists[2].id }, user);
      const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
      const movedActivity = activity.find((a) => a.action === 'moved');
      expect(movedActivity).toBeDefined();
      expect(movedActivity!.actorId).toBe(user.id);
      expect(movedActivity!.actor).toBe(user.displayName);
    });
  });

  describe('reorder', () => {
    it('should reorder tasks within a list', async () => {
      const t1 = await seedTask(prisma, board.lists[0].id, { position: 0 });
      const t2 = await seedTask(prisma, board.lists[0].id, { position: 1 });
      await service.reorder({ items: [{ id: t1.id, position: 1 }, { id: t2.id, position: 0 }] });
      const tasks = await service.findByList(board.lists[0].id);
      expect(tasks[0].id).toBe(t2.id);
      expect(tasks[1].id).toBe(t1.id);
    });
  });

  describe('remove', () => {
    it('should archive a task (soft delete)', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      const archived = await service.remove(seeded.id, user);
      expect(archived.status).toBe('archived');
    });

    it('should log activity on archive with user', async () => {
      const seeded = await seedTask(prisma, board.lists[0].id);
      await service.remove(seeded.id, user);
      const activity = await prisma.activity.findMany({ where: { taskId: seeded.id } });
      const archivedActivity = activity.find((a) => a.action === 'archived');
      expect(archivedActivity).toBeDefined();
      expect(archivedActivity!.actorId).toBe(user.id);
      expect(archivedActivity!.actor).toBe(user.displayName);
    });
  });

  describe('attachLabel', () => {
    it('should attach a label to a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
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
      const task = await seedTask(prisma, board.lists[0].id);
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
});
