import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService } from './labels.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedLabel } from '../../test/setup';

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: PrismaService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LabelsService, { provide: PrismaService, useValue: prisma }, { provide: EventsService, useValue: events }],
    }).compile();
    service = module.get<LabelsService>(LabelsService);
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

  describe('findAll', () => {
    it('should return labels for a board', async () => {
      await seedLabel(prisma, board.id);
      await seedLabel(prisma, board.id);
      const labels = await service.findAll(board.id);
      expect(labels).toHaveLength(2);
    });
  });

  describe('findOne', () => {
    it('should return a single label', async () => {
      const label = await seedLabel(prisma, board.id);
      const found = await service.findOne(label.id);
      expect(found.id).toBe(label.id);
      expect(found.name).toBe(label.name);
    });

    it('should throw NotFoundException for non-existent label', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow('Label not found');
    });
  });

  describe('create', () => {
    it('should create a label', async () => {
      const label = await service.create(board.id, { name: 'feature', color: '#22C55E' });
      expect(label.name).toBe('feature');
      expect(label.color).toBe('#22C55E');
      expect(label.boardId).toBe(board.id);
    });
  });

  describe('update', () => {
    it('should update label name and color', async () => {
      const label = await seedLabel(prisma, board.id);
      const updated = await service.update(label.id, { name: 'critical', color: '#ff0000' });
      expect(updated.name).toBe('critical');
      expect(updated.color).toBe('#ff0000');
    });

    it('should throw on non-existent label', async () => {
      await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow('Label not found');
    });
  });

  describe('remove', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      await service.remove(label.id);
      const labels = await service.findAll(board.id);
      expect(labels).toHaveLength(0);
    });

    it('should throw on non-existent label', async () => {
      await expect(service.remove('nonexistent')).rejects.toThrow('Label not found');
    });
  });
});