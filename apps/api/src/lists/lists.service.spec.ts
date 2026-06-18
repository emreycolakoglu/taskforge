import { Test, TestingModule } from '@nestjs/testing';
import { ListsService } from './lists.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard } from '../../test/setup';

describe('ListsService', () => {
  let service: ListsService;
  let prisma: PrismaService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ListsService, { provide: PrismaService, useValue: prisma }, { provide: EventsService, useValue: events }],
    }).compile();
    service = module.get<ListsService>(ListsService);
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
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  describe('findByBoard', () => {
    it('should return lists ordered by position', async () => {
      const lists = await service.findByBoard(board.id);
      expect(lists).toHaveLength(5);
      expect(lists[0].name).toBe('Backlog');
      expect(lists[4].name).toBe('Done');
    });

    it('should include task counts', async () => {
      const lists = await service.findByBoard(board.id);
      expect(lists[0]).toHaveProperty('_count');
      expect(lists[0]._count.tasks).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a list by id', async () => {
      const list = await service.findOne(board.lists[0].id);
      expect(list.name).toBe('Backlog');
    });

    it('should throw on non-existent list', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('List not found');
    });
  });

  describe('create', () => {
    it('should create a list at the end', async () => {
      const list = await service.create({ boardId: board.id, name: 'New List' });
      expect(list.name).toBe('New List');
      expect(list.position).toBe(5);
    });

    it('should create a list at a specific position', async () => {
      const list = await service.create({ boardId: board.id, name: 'Middle', position: 2.5 });
      expect(list.position).toBe(2.5);
    });

    it('should create a list with color and wipLimit', async () => {
      const list = await service.create({
        boardId: board.id,
        name: 'Blocked',
        color: '#ef4444',
        wipLimit: 3,
      });
      expect(list.color).toBe('#ef4444');
      expect(list.wipLimit).toBe(3);
    });
  });

  describe('update', () => {
    it('should update list name and color', async () => {
      const list = await service.update(board.lists[0].id, {
        name: 'Icebox',
        color: '#000000',
      });
      expect(list.name).toBe('Icebox');
      expect(list.color).toBe('#000000');
    });
  });

  describe('reorder', () => {
    it('should reorder lists', async () => {
      const lists = await service.findByBoard(board.id);
      const items = lists.map((l, i) => ({ id: l.id, position: 4 - i }));
      await service.reorder({ items });
      const reordered = await service.findByBoard(board.id);
      expect(reordered[0].id).toBe(lists[4].id);
      expect(reordered[4].id).toBe(lists[0].id);
    });
  });

  describe('remove', () => {
    it('should delete a list', async () => {
      await service.remove(board.lists[0].id);
      await expect(service.findOne(board.lists[0].id)).rejects.toThrow('List not found');
    });
  });
});
