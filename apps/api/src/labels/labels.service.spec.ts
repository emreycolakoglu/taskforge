import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService } from './labels.service';
import { PrismaService } from '../prisma/prisma.service';
import { createTestPrisma, seedBoard, seedLabel } from '../../test/setup';

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: PrismaService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const module: TestingModule = await Test.createTestingModule({
      providers: [LabelsService, { provide: PrismaService, useValue: prisma }],
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

  describe('findByBoard', () => {
    it('should return labels for a board', async () => {
      await seedLabel(prisma, board.id);
      await seedLabel(prisma, board.id);
      const labels = await service.findByBoard(board.id);
      expect(labels).toHaveLength(2);
    });
  });

  describe('create', () => {
    it('should create a label', async () => {
      const label = await service.create({ boardId: board.id, name: 'feature', color: '#22c55e' });
      expect(label.name).toBe('feature');
      expect(label.color).toBe('#22c55e');
    });

    it('should use default color when not provided', async () => {
      const label = await service.create({ boardId: board.id, name: 'bug' });
      expect(label.color).toBe('#6366f1');
    });
  });

  describe('update', () => {
    it('should update label name and color', async () => {
      const label = await seedLabel(prisma, board.id);
      const updated = await service.update(label.id, { name: 'critical', color: '#ff0000' });
      expect(updated.name).toBe('critical');
      expect(updated.color).toBe('#ff0000');
    });
  });

  describe('remove', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      await service.remove(label.id);
      const labels = await service.findByBoard(board.id);
      expect(labels).toHaveLength(0);
    });
  });
});
