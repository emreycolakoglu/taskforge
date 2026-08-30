import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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
      providers: [
        StatusesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<StatusesService>(StatusesService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
  });

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
      expect(statuses).toHaveLength(6);
      expect(statuses[0].name).toBe('Backlog');
      expect(statuses[0].type).toBe('backlog');
      expect(statuses[3].name).toBe('Done');
      expect(statuses[3].type).toBe('done');
      expect(statuses[4].name).toBe('Cancelled');
      expect(statuses[4].type).toBe('cancelled');
      expect(statuses[5].name).toBe('Duplicate');
      expect(statuses[5].type).toBe('duplicate');
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
      const status = await service.create({ boardId: board.id, name: 'New Status', type: 'todo' });
      expect(status.name).toBe('New Status');
      expect(status.position).toBe(6);
      expect(status.type).toBe('todo');
      expect(status.progress).toBe(0);
    });

    it('should create a status at a specific position', async () => {
      const status = await service.create({
        boardId: board.id,
        name: 'Middle',
        type: 'todo',
        position: 2.5,
      });
      expect(status.position).toBe(2.5);
    });

    it('should create a status with color', async () => {
      const status = await service.create({
        boardId: board.id,
        name: 'Blocked',
        type: 'todo',
        color: '#ef4444',
      });
      expect(status.color).toBe('#ef4444');
    });

    it('should set progress from type default on create', async () => {
      const inProgress = await service.create({
        boardId: board.id,
        name: 'WIP',
        type: 'in_progress',
      });
      expect(inProgress.progress).toBe(50);

      const done = await service.create({ boardId: board.id, name: 'Shipped', type: 'done' });
      expect(done.progress).toBe(100);

      const cancelled = await service.create({
        boardId: board.id,
        name: 'Abandoned',
        type: 'cancelled',
      });
      expect(cancelled.progress).toBeNull();
    });

    it('should reject create without type', async () => {
      await expect(service.create({ boardId: board.id, name: 'No Type' } as any)).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('should update status name and color', async () => {
      const status = await service.update(board.statuses[0].id, {
        name: 'Icebox',
        color: '#000000',
      });
      expect(status.name).toBe('Icebox');
      expect(status.color).toBe('#000000');
    });

    it('should update status type and recompute progress to locked value', async () => {
      const status = await service.update(board.statuses[0].id, { type: 'done' });
      expect(status.type).toBe('done');
      expect(status.progress).toBe(100);
    });

    it('should update status type to cancelled and set progress to null', async () => {
      const status = await service.update(board.statuses[0].id, { type: 'cancelled' });
      expect(status.type).toBe('cancelled');
      expect(status.progress).toBeNull();
    });

    it('should allow progress update for in_progress type', async () => {
      const inProgress = await service.create({
        boardId: board.id,
        name: 'WIP',
        type: 'in_progress',
      });
      const updated = await service.update(inProgress.id, { progress: 75 });
      expect(updated.progress).toBe(75);
    });

    it('should reject progress update for done type', async () => {
      await expect(service.update(board.statuses[3].id, { progress: 50 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject progress update for backlog type', async () => {
      await expect(service.update(board.statuses[0].id, { progress: 50 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('reorder', () => {
    it('should reorder statuses', async () => {
      const statuses = await service.findByBoard(board.id);
      const items = statuses.map((s, i) => ({ id: s.id, position: 5 - i }));
      await service.reorder({ items });
      const reordered = await service.findByBoard(board.id);
      expect(reordered[0].id).toBe(statuses[5].id);
      expect(reordered[5].id).toBe(statuses[0].id);
    });
  });

  describe('remove', () => {
    it('should delete a status', async () => {
      await service.remove(board.statuses[0].id);
      await expect(service.findOne(board.statuses[0].id)).rejects.toThrow('Status not found');
    });
  });
});
