import { Test, TestingModule } from '@nestjs/testing';
import { LabelsService } from './labels.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedLabel, seedUser } from '../../test/setup';

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: PrismaService;
  let board: any;
  // Global admin used by legacy tests that only exercise CRUD mechanics, not
  // authorization. Global admins pass isBoardAdmin on any board.
  let adminUser: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<LabelsService>(LabelsService);
    // seedUser requires tables that the afterAll disconnect handles; create the
    // admin inside beforeAll after prisma is up.
    adminUser = await seedUser(prisma, { role: 'admin', email: 'labels-admin@example.com' });
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
      const label = await service.create(
        board.id,
        { name: 'feature', color: '#22C55E' },
        adminUser,
      );
      expect(label.name).toBe('feature');
      expect(label.color).toBe('#22C55E');
      expect(label.boardId).toBe(board.id);
    });

    it('should allow a board admin to create a label', async () => {
      const admin = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: admin.id, role: 'admin' },
      });
      const label = await service.create(
        board.id,
        { name: 'admin-label', color: '#000000' },
        admin,
      );
      expect(label.name).toBe('admin-label');
    });

    it('should allow a global admin to create a label', async () => {
      const globalAdmin = await seedUser(prisma, { role: 'admin' });
      const label = await service.create(
        board.id,
        { name: 'global-admin-label', color: '#000000' },
        globalAdmin,
      );
      expect(label.name).toBe('global-admin-label');
    });

    it('should reject label creation by a non-admin user', async () => {
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(
        service.create(board.id, { name: 'nope', color: '#000000' }, member),
      ).rejects.toThrow('Only board admins can create labels');
    });

    it('should reject label creation by a user who is not a member at all', async () => {
      const outsider = await seedUser(prisma);
      await expect(
        service.create(board.id, { name: 'nope', color: '#000000' }, outsider),
      ).rejects.toThrow('Only board admins can create labels');
    });

    it('should reject when no user is provided', async () => {
      await expect(service.create(board.id, { name: 'nope', color: '#000000' })).rejects.toThrow(
        'Admin access required',
      );
    });
  });

  describe('update', () => {
    it('should update label name and color', async () => {
      const label = await seedLabel(prisma, board.id);
      const updated = await service.update(
        label.id,
        { name: 'critical', color: '#ff0000' },
        adminUser,
      );
      expect(updated.name).toBe('critical');
      expect(updated.color).toBe('#ff0000');
    });

    it('should throw on non-existent label', async () => {
      await expect(service.update('nonexistent', { name: 'x' })).rejects.toThrow('Label not found');
    });

    it('should reject label update by a non-admin user', async () => {
      const label = await seedLabel(prisma, board.id);
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(service.update(label.id, { name: 'x' }, member)).rejects.toThrow(
        'Only board admins can update labels',
      );
    });

    it('should allow a global admin to update a label', async () => {
      const label = await seedLabel(prisma, board.id);
      const globalAdmin = await seedUser(prisma, { role: 'admin' });
      const updated = await service.update(label.id, { name: 'renamed' }, globalAdmin);
      expect(updated.name).toBe('renamed');
    });
  });

  describe('remove', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      await service.remove(label.id, adminUser);
      const labels = await service.findAll(board.id);
      expect(labels).toHaveLength(0);
    });

    it('should throw on non-existent label', async () => {
      await expect(service.remove('nonexistent')).rejects.toThrow('Label not found');
    });

    it('should reject label delete by a non-admin user', async () => {
      const label = await seedLabel(prisma, board.id);
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(service.remove(label.id, member)).rejects.toThrow(
        'Only board admins can delete labels',
      );
    });

    it('should allow a board admin to delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      const admin = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: admin.id, role: 'admin' },
      });
      await service.remove(label.id, admin);
      const labels = await service.findAll(board.id);
      expect(labels).toHaveLength(0);
    });
  });
});
