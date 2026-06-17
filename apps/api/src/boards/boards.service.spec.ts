import { Test, TestingModule } from '@nestjs/testing';
import { BoardsService } from './boards.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard } from '../../test/setup';

describe('BoardsService', () => {
  let service: BoardsService;
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [BoardsService, { provide: PrismaService, useValue: prisma }],
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
    await prisma.list.deleteMany();
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
      expect(boards[0]._count).toHaveProperty('lists');
      expect(boards[0]._count).toHaveProperty('members');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException for non-existent board', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('Board not found');
    });

    it('should return board with lists, labels, and members', async () => {
      const seeded = await seedBoard(prisma);
      const board = await service.findOne(seeded.id);
      expect(board.id).toBe(seeded.id);
      expect(board.lists).toHaveLength(5);
      expect(board.labels).toEqual([]);
      expect(board.members).toEqual([]);
    });
  });

  describe('findFull', () => {
    it('should return board with nested tasks', async () => {
      const seeded = await seedBoard(prisma);
      const board = await service.findFull(seeded.id);
      expect(board.lists).toHaveLength(5);
      for (const list of board.lists) {
        expect(list).toHaveProperty('tasks');
        expect(Array.isArray(list.tasks)).toBe(true);
      }
    });
  });

  describe('create', () => {
    it('should create a board with 5 default lists', async () => {
      const board = await service.create({ name: 'New Board', slug: 'new-board' });
      expect(board.name).toBe('New Board');
      expect(board.slug).toBe('new-board');
      expect(board.lists).toHaveLength(5);
      const listNames = board.lists.map((l) => l.name);
      expect(listNames).toEqual(['Backlog', 'To Do', 'In Progress', 'Review', 'Done']);
    });

    it('should create a board with description', async () => {
      const board = await service.create({
        name: 'Sprint',
        slug: 'sprint-1',
        description: 'Q3 sprint',
      });
      expect(board.description).toBe('Q3 sprint');
    });
  });

  describe('update', () => {
    it('should update board name', async () => {
      const seeded = await seedBoard(prisma);
      const updated = await service.update(seeded.id, { name: 'Updated Board' });
      expect(updated.name).toBe('Updated Board');
    });

    it('should throw on non-existent board', async () => {
      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow('Board not found');
    });
  });

  describe('remove', () => {
    it('should delete a board', async () => {
      const seeded = await seedBoard(prisma);
      await service.remove(seeded.id);
      await expect(service.findOne(seeded.id)).rejects.toThrow('Board not found');
    });

    it('should cascade delete lists', async () => {
      const seeded = await seedBoard(prisma);
      await service.remove(seeded.id);
      const lists = await prisma.list.findMany({ where: { boardId: seeded.id } });
      expect(lists).toHaveLength(0);
    });
  });
});
