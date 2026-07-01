import { Test, TestingModule } from '@nestjs/testing';
import { StatusesService } from './statuses.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask } from '../../test/setup';

describe('StatusesService', () => {
  let service: StatusesService;
  let prisma: PrismaService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StatusesService, { provide: PrismaService, useValue: prisma }, { provide: EventsService, useValue: events }],
    }).compile();
    service = module.get<StatusesService>(StatusesService);
  });

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => { board = await seedBoard(prisma); });

  afterEach(async () => {
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  describe('findByBoard', () => {
    it('should return statuses ordered by position', async () => {
      const statuses = await service.findByBoard(board.id);
      expect(statuses).toHaveLength(5);
      expect(statuses[0].name).toBe('Backlog');
      expect(statuses[4].name).toBe('Done');
      expect(statuses[4].isDone).toBe(true);
    });

    it('should include task counts', async () => {
      const statuses = await service.findByBoard(board.id);
      expect(statuses[0]).toHaveProperty('_count');
      expect(statuses[0]._count.tasks).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a status by id', async () => {
      const status = await service.findOne(board.statuses[0].id);
      expect(status.name).toBe('Backlog');
    });

    it('should throw on non-existent status', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('Status not found');
    });
  });

  describe('create', () => {
    it('should create a status at the end', async () => {
      const status = await service.create({ boardId: board.id, name: 'New Status' });
      expect(status.name).toBe('New Status');
      expect(status.position).toBe(5);
      expect(status.isDone).toBe(false);
    });

    it('should create a status at a specific position', async () => {
      const status = await service.create({ boardId: board.id, name: 'Middle', position: 2.5 });
      expect(status.position).toBe(2.5);
    });

    it('should create a status with color and wipLimit', async () => {
      const status = await service.create({
        boardId: board.id, name: 'Blocked', color: '#ef4444', wipLimit: 3,
      });
      expect(status.color).toBe('#ef4444');
      expect(status.wipLimit).toBe(3);
    });
  });

  describe('update', () => {
    it('should update status name and color', async () => {
      const status = await service.update(board.statuses[0].id, {
        name: 'Icebox', color: '#000000',
      });
      expect(status.name).toBe('Icebox');
      expect(status.color).toBe('#000000');
    });
  });

  describe('reorder', () => {
    it('should reorder statuses', async () => {
      const statuses = await service.findByBoard(board.id);
      const items = statuses.map((s, i) => ({ id: s.id, position: 4 - i }));
      await service.reorder({ items });
      const reordered = await service.findByBoard(board.id);
      expect(reordered[0].id).toBe(statuses[4].id);
      expect(reordered[4].id).toBe(statuses[0].id);
    });
  });

  describe('remove', () => {
    it('should delete a status', async () => {
      await service.remove(board.statuses[0].id);
      await expect(service.findOne(board.statuses[0].id)).rejects.toThrow('Status not found');
    });
  });

  describe('toggleDone', () => {
    it('sets isDone on the target and clears it on the previous done status', async () => {
      const doneStatus = board.statuses[4]; // seeded with isDone=true
      const backlog = board.statuses[0];
      await service.toggleDone(backlog.id);
      const refreshed = await service.findByBoard(board.id);
      expect(refreshed.find((s) => s.id === backlog.id)!.isDone).toBe(true);
      expect(refreshed.find((s) => s.id === doneStatus.id)!.isDone).toBe(false);
    });

    it('stamps doneAt on tasks in the new done status and clears it on the old', async () => {
      const doneStatus = board.statuses[4];
      const backlog = board.statuses[0];
      const taskInDone = await seedTask(prisma, doneStatus.id);
      const taskInBacklog = await seedTask(prisma, backlog.id);
      // Move done onto backlog:
      await service.toggleDone(backlog.id);
      const refreshedBacklogTask = await prisma.task.findUnique({ where: { id: taskInBacklog.id } });
      const refreshedDoneTask = await prisma.task.findUnique({ where: { id: taskInDone.id } });
      expect(refreshedBacklogTask!.doneAt).not.toBeNull();
      expect(refreshedDoneTask!.doneAt).toBeNull();
    });
  });

  describe('unsetDone', () => {
    it('clears isDone and doneAt on the current done status', async () => {
      const doneStatus = board.statuses[4];
      await seedTask(prisma, doneStatus.id, { doneAt: new Date() });
      await service.unsetDone(board.id);
      const refreshed = await service.findByBoard(board.id);
      expect(refreshed.find((s) => s.isDone)).toBeUndefined();
      const tasks = await prisma.task.findMany({ where: { statusId: doneStatus.id } });
      expect(tasks.every((t) => t.doneAt === null)).toBe(true);
    });
  });
});
