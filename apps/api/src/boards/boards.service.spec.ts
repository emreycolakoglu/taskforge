import { Test, TestingModule } from '@nestjs/testing';
import { BoardsService } from './boards.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { LabelsService } from '../labels/labels.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedComment, seedUser } from '../../test/setup';

describe('BoardsService', () => {
  let service: BoardsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const labelsService = new LabelsService(prisma, events);
    const module: TestingModule = await Test.createTestingModule({
      providers: [BoardsService, { provide: PrismaService, useValue: prisma }, { provide: EventsService, useValue: events }, { provide: LabelsService, useValue: labelsService }],
    }).compile();
    service = module.get<BoardsService>(BoardsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean all data between tests
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  describe('findAll', () => {
    it('should return empty array when no boards exist', async () => {
      const boards = await service.findAll();
      expect(boards).toEqual([]);
    });

    it('should return all boards with counts', async () => {
      await seedBoard(prisma);
      await seedBoard(prisma);
      const boards = await service.findAll();
      expect(boards).toHaveLength(2);
      expect(boards[0]).toHaveProperty('_count');
      expect(boards[0]._count).toHaveProperty('statuses');
      expect(boards[0]._count).toHaveProperty('members');
    });

    it('should include members array so the frontend can detect membership', async () => {
      const seeded = await seedBoard(prisma);
      const member = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: member.id, role: 'member' } });
      const boards = await service.findAll();
      const board = boards.find((b: any) => b.id === seeded.id);
      expect(board).toBeDefined();
      expect(Array.isArray(board.members)).toBe(true);
      expect(board.members).toHaveLength(1);
      expect(board.members[0]).toMatchObject({ userId: member.id, role: 'member' });
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException for non-existent board', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('Board not found');
    });

    it('should return board with statuses, labels, and members', async () => {
      const seeded = await seedBoard(prisma);
      const board = await service.findOne(seeded.id);
      expect(board.id).toBe(seeded.id);
      expect(board.statuses).toHaveLength(5);
      expect(board.labels).toEqual([]);
      expect(board.members).toEqual([]);
    });
  });

  describe('findFull', () => {
    it('should return board with nested tasks', async () => {
      const seeded = await seedBoard(prisma);
      const board = await service.findFull(seeded.id);
      expect(board.statuses).toHaveLength(5);
      for (const status of board.statuses) {
        expect(status).toHaveProperty('tasks');
        expect(Array.isArray(status.tasks)).toBe(true);
      }
    });

    it('should include assignee, _count (comments), labels, and taskNumber on tasks', async () => {
      const seeded = await seedBoard(prisma);
      const status = seeded.statuses[0];
      const label = await seedLabel(prisma, seeded.id);
      const user = await seedUser(prisma);
      const task = await seedTask(prisma, status.id, { assigneeId: user.id });
      // Attach label to task
      await prisma.taskLabel.create({ data: { taskId: task.id, labelId: label.id } });
      // Add a comment
      await seedComment(prisma, task.id);

      const board = await service.findFull(seeded.id);
      const tasks = board.statuses.flatMap((s: any) => s.tasks);
      const found = tasks.find((t: any) => t.id === task.id);

      expect(found).toBeDefined();
      expect(found.assignee).toMatchObject({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
      expect(found._count).toEqual({ comments: 1, relationsTo: 0 });
      expect(found.labels).toHaveLength(1);
      expect(found.labels[0].label).toBeDefined();
      expect(found.taskNumber).toBe(`${seeded.identifier}-${task.number}`);
    });

    it('should return null assignee when no assignee is set', async () => {
      const seeded = await seedBoard(prisma);
      const status = seeded.statuses[0];
      const task = await seedTask(prisma, status.id);

      const board = await service.findFull(seeded.id);
      const found = board.statuses.flatMap((s: any) => s.tasks).find((t: any) => t.id === task.id);

      expect(found).toBeDefined();
      expect(found.assignee).toBeNull();
      expect(found._count).toEqual({ comments: 0, relationsTo: 0 });
      expect(found.taskNumber).toBe(`${seeded.identifier}-${task.number}`);
    });
  });

  describe('create', () => {
    it('should create a board with 5 default statuses, Done isDone=true', async () => {
      const board = await service.create({ name: 'New Board', slug: 'new-board', identifier: 'NEW' });
      expect(board.name).toBe('New Board');
      expect(board.slug).toBe('new-board');
      expect(board.identifier).toBe('NEW');
      expect(board.statuses).toHaveLength(5);
      const statuses = board.statuses;
      expect(statuses.map((s: any) => s.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
      expect(statuses.find((s: any) => s.name === 'Done').isDone).toBe(true);
    });

    it('should create a board with 5 default labels', async () => {
      const board = await service.create({ name: 'Label Board', slug: 'label-board', identifier: 'LBL' });
      const labels = await prisma.label.findMany({ where: { boardId: board.id } });
      expect(labels).toHaveLength(5);
      const labelNames = labels.map((l) => l.name);
      expect(labelNames).toContain('Bug');
      expect(labelNames).toContain('Feature');
      expect(labelNames).toContain('Improvement');
      expect(labelNames).toContain('Documentation');
      expect(labelNames).toContain('Urgent');
    });

    it('should create a board with description', async () => {
      const board = await service.create({
        name: 'Sprint',
        slug: 'sprint-1',
        identifier: 'SPR',
        description: 'Q3 sprint',
      });
      expect(board.description).toBe('Q3 sprint');
    });

    it('should normalize identifier to uppercase', async () => {
      const board = await service.create({ name: 'Lower Board', slug: 'lower-board', identifier: 'low' });
      expect(board.identifier).toBe('LOW');
    });

    it('should default icon to ⭐ when not provided', async () => {
      const board = await service.create({ name: 'Icon Board', slug: 'icon-board', identifier: 'ICN' });
      expect(board.icon).toBe('⭐');
    });

    it('should accept custom icon', async () => {
      const board = await service.create({ name: 'Rocket', slug: 'rocket', identifier: 'RCK', icon: '🚀' });
      expect(board.icon).toBe('🚀');
    });
  });

  describe('update', () => {
    it('should update board name', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      const updated = await service.update(seeded.id, { name: 'Updated Board' }, { id: admin.id, displayName: admin.displayName });
      expect(updated.name).toBe('Updated Board');
    });

    it('should throw on non-existent board', async () => {
      const admin = await seedUser(prisma);
      await expect(service.update('nonexistent', { name: 'X' }, { id: admin.id, displayName: admin.displayName })).rejects.toThrow('Board not found');
    });

    it('should update board icon', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      const updated = await service.update(seeded.id, { icon: '🔥' }, { id: admin.id, displayName: admin.displayName });
      expect(updated.icon).toBe('🔥');
    });

    it('should forbid non-admin user from updating', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      const member = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await prisma.member.create({ data: { boardId: seeded.id, userId: member.id, role: 'member' } });
      await expect(
        service.update(seeded.id, { name: 'Hack' }, { id: member.id, displayName: member.displayName }),
      ).rejects.toThrow('Only board admins can perform this action');
    });

    it('should forbid update with no user', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await expect(service.update(seeded.id, { name: 'X' })).rejects.toThrow('Admin access required');
    });

    it('should allow update on legacy board with no admin members', async () => {
      const seeded = await seedBoard(prisma);
      const user = await seedUser(prisma);
      const updated = await service.update(seeded.id, { name: 'Legacy' }, { id: user.id, displayName: user.displayName });
      expect(updated.name).toBe('Legacy');
    });
  });

  describe('remove', () => {
    it('should delete a board', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await service.remove(seeded.id, { id: admin.id, displayName: admin.displayName });
      await expect(service.findOne(seeded.id)).rejects.toThrow('Board not found');
    });

    it('should cascade delete statuses', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await service.remove(seeded.id, { id: admin.id, displayName: admin.displayName });
      const statuses = await prisma.status.findMany({ where: { boardId: seeded.id } });
      expect(statuses).toHaveLength(0);
    });

    it('should forbid non-admin user from deleting', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      const member = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await prisma.member.create({ data: { boardId: seeded.id, userId: member.id, role: 'member' } });
      await expect(
        service.remove(seeded.id, { id: member.id, displayName: member.displayName }),
      ).rejects.toThrow('Only board admins can perform this action');
    });

    it('should forbid delete with no user', async () => {
      const seeded = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: seeded.id, userId: admin.id, role: 'admin' } });
      await expect(service.remove(seeded.id)).rejects.toThrow('Admin access required');
    });

    it('should allow delete on legacy board with no admin members', async () => {
      const seeded = await seedBoard(prisma);
      const user = await seedUser(prisma);
      await service.remove(seeded.id, { id: user.id, displayName: user.displayName });
      await expect(service.findOne(seeded.id)).rejects.toThrow('Board not found');
    });
  });
});