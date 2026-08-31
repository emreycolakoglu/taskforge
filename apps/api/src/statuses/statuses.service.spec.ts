import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StatusesService } from './statuses.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedUser } from '../../test/setup';

describe('StatusesService', () => {
  let service: StatusesService;
  let prisma: PrismaService;
  let board: any;
  let adminUser: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    const events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusesService,
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<StatusesService>(StatusesService);
    // Global admin: passes isBoardAdmin on any board, for legacy CRUD tests.
    adminUser = await seedUser(prisma, { role: 'admin', email: 'statuses-admin@example.com' });
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
      const status = await service.create(
        { boardId: board.id, name: 'New Status', type: 'todo' },
        adminUser,
      );
      expect(status.name).toBe('New Status');
      expect(status.position).toBe(6);
      expect(status.type).toBe('todo');
      expect(status.progress).toBe(0);
    });

    it('should create a status at a specific position', async () => {
      const status = await service.create(
        {
          boardId: board.id,
          name: 'Middle',
          type: 'todo',
          position: 2.5,
        },
        adminUser,
      );
      expect(status.position).toBe(2.5);
    });

    it('should create a status with color', async () => {
      const status = await service.create(
        {
          boardId: board.id,
          name: 'Blocked',
          type: 'todo',
          color: '#ef4444',
        },
        adminUser,
      );
      expect(status.color).toBe('#ef4444');
    });

    it('should set progress from type default on create', async () => {
      const inProgress = await service.create(
        {
          boardId: board.id,
          name: 'WIP',
          type: 'in_progress',
        },
        adminUser,
      );
      expect(inProgress.progress).toBe(50);

      const done = await service.create(
        { boardId: board.id, name: 'Shipped', type: 'done' },
        adminUser,
      );
      expect(done.progress).toBe(100);

      const cancelled = await service.create(
        {
          boardId: board.id,
          name: 'Abandoned',
          type: 'cancelled',
        },
        adminUser,
      );
      expect(cancelled.progress).toBeNull();
    });

    it('should reject create without type', async () => {
      await expect(
        service.create({ boardId: board.id, name: 'No Type' } as any, adminUser),
      ).rejects.toThrow();
    });

    it('should allow a board admin to create a status', async () => {
      const admin = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: admin.id, role: 'admin' },
      });
      const status = await service.create(
        { boardId: board.id, name: 'Admin Status', type: 'todo' },
        admin,
      );
      expect(status.name).toBe('Admin Status');
    });

    it('should allow a global admin to create a status', async () => {
      const status = await service.create(
        { boardId: board.id, name: 'Global Admin Status', type: 'todo' },
        adminUser,
      );
      expect(status.name).toBe('Global Admin Status');
    });

    it('should reject status creation by a non-admin member', async () => {
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(
        service.create({ boardId: board.id, name: 'Nope', type: 'todo' }, member),
      ).rejects.toThrow('Only board admins can create statuses');
    });

    it('should reject status creation when no user is provided', async () => {
      await expect(
        service.create({ boardId: board.id, name: 'Nope', type: 'todo' }),
      ).rejects.toThrow('Admin access required');
    });
  });

  describe('update', () => {
    it('should update status name and color', async () => {
      const status = await service.update(
        board.statuses[0].id,
        {
          name: 'Icebox',
          color: '#000000',
        },
        adminUser,
      );
      expect(status.name).toBe('Icebox');
      expect(status.color).toBe('#000000');
    });

    it('should update status type and recompute progress to locked value', async () => {
      const status = await service.update(board.statuses[0].id, { type: 'done' }, adminUser);
      expect(status.type).toBe('done');
      expect(status.progress).toBe(100);
    });

    it('should update status type to cancelled and set progress to null', async () => {
      const status = await service.update(board.statuses[0].id, { type: 'cancelled' }, adminUser);
      expect(status.type).toBe('cancelled');
      expect(status.progress).toBeNull();
    });

    it('should allow progress update for in_progress type', async () => {
      const inProgress = await service.create(
        {
          boardId: board.id,
          name: 'WIP',
          type: 'in_progress',
        },
        adminUser,
      );
      const updated = await service.update(inProgress.id, { progress: 75 }, adminUser);
      expect(updated.progress).toBe(75);
    });

    it('should reject progress update for done type', async () => {
      await expect(
        service.update(board.statuses[3].id, { progress: 50 }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject progress update for backlog type', async () => {
      await expect(
        service.update(board.statuses[0].id, { progress: 50 }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject status update by a non-admin member', async () => {
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(
        service.update(board.statuses[0].id, { name: 'Hacked' }, member),
      ).rejects.toThrow('Only board admins can update statuses');
    });

    it('should allow a global admin to update a status', async () => {
      const status = await service.update(board.statuses[0].id, { name: 'Renamed' }, adminUser);
      expect(status.name).toBe('Renamed');
    });
  });

  describe('reorder', () => {
    it('should reorder statuses', async () => {
      const statuses = await service.findByBoard(board.id);
      const items = statuses.map((s, i) => ({ id: s.id, position: 5 - i }));
      await service.reorder({ items }, adminUser);
      const reordered = await service.findByBoard(board.id);
      expect(reordered[0].id).toBe(statuses[5].id);
      expect(reordered[5].id).toBe(statuses[0].id);
    });

    it('should reject reorder by a non-admin member', async () => {
      const statuses = await service.findByBoard(board.id);
      const items = statuses.map((s, i) => ({ id: s.id, position: 5 - i }));
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(service.reorder({ items }, member)).rejects.toThrow(
        'Only board admins can reorder statuses',
      );
    });
  });

  describe('remove', () => {
    it('should delete a status', async () => {
      await service.remove(board.statuses[0].id, adminUser);
      await expect(service.findOne(board.statuses[0].id)).rejects.toThrow('Status not found');
    });

    it('should reject status delete by a non-admin member', async () => {
      const member = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: member.id, role: 'member' },
      });
      await expect(service.remove(board.statuses[0].id, member)).rejects.toThrow(
        'Only board admins can delete statuses',
      );
    });

    it('should allow a board admin to delete a status', async () => {
      const admin = await seedUser(prisma);
      await prisma.member.create({
        data: { boardId: board.id, userId: admin.id, role: 'admin' },
      });
      await service.remove(board.statuses[0].id, admin);
      await expect(service.findOne(board.statuses[0].id)).rejects.toThrow('Status not found');
    });
  });
});
