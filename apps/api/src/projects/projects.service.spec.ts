import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedProject, seedTask, seedUser } from '../../test/setup';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let owner: any;
  let member: any;
  let globalAdmin: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<ProjectsService>(ProjectsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    owner = await seedUser(prisma, { email: 'project-owner@example.com' });
    member = await seedUser(prisma, { email: 'project-member@example.com' });
    globalAdmin = await seedUser(prisma, {
      email: 'project-global-admin@example.com',
      role: 'admin',
    });
    await prisma.member.create({ data: { boardId: board.id, userId: owner.id, role: 'member' } });
    await prisma.member.create({ data: { boardId: board.id, userId: member.id, role: 'member' } });
  });

  // Reverse dependency order per the brief; project deletes after task (tasks
  // hold the projectId FK, so tasks must go first).
  afterEach(async () => {
    await prisma.activity.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.label.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.view.deleteMany();
    await prisma.member.deleteMany();
    await prisma.status.deleteMany();
    await prisma.board.deleteMany();
    await prisma.user.deleteMany();
    await prisma.session.deleteMany();
    await prisma.settings.deleteMany();
  });

  // The v2 user shape reaching ProjectsService — `bot` rides the request's
  // session flag (see ProjectsController.assertNotBot); services test the
  // flag directly on the user object the controller passes through.
  const human = (u: any) => ({ id: u.id, displayName: u.displayName, bot: false });
  const bot = (u: any) => ({ id: u.id, displayName: u.displayName, bot: true });
  const baseDto = { name: 'Roadmap v1' };

  describe('create', () => {
    it('creates the FIRST project at position 0 (statuses house pattern, not ?? 0)', async () => {
      const created = await service.create({ ...baseDto }, human(owner));
      expect(created.position).toBe(0);
      expect('boardId' in created).toBe(false);
    });

    it('appends at the end of the workspace (position = global max+1, not per-board)', async () => {
      await seedProject(prisma, { name: 'First', position: 3 });
      const created = await service.create({ ...baseDto }, human(owner));
      expect(created.name).toBe('Roadmap v1');
      expect(created.position).toBe(4);
      expect(created.icon).toBe('📦');
      expect(created.status).toBe('planned');
      expect(created.completedAt).toBeNull();
    });

    it('allows creation by ANY authenticated member (v2: all-members)', async () => {
      // Plain member, no admin role anywhere, no membership needed at all —
      // v1's board-admin gate is gone.
      const created = await service.create({ ...baseDto }, human(member));
      expect(created.name).toBe('Roadmap v1');
    });

    it('allows creation by a member of a DIFFERENT board (workspace-wide)', async () => {
      const otherBoard = await seedBoard(prisma);
      const outsider = await seedUser(prisma, { email: 'project-outsider@example.com' });
      await prisma.member.create({
        data: { boardId: otherBoard.id, userId: outsider.id, role: 'member' },
      });
      const created = await service.create({ ...baseDto }, human(outsider));
      expect(created.name).toBe('Roadmap v1');
    });

    it('allows creation by a global admin', async () => {
      const created = await service.create({ ...baseDto }, human(globalAdmin));
      expect(created.name).toBe('Roadmap v1');
    });

    it('rejects bot sessions (ForbiddenException)', async () => {
      await expect(service.create({ ...baseDto }, bot(owner))).rejects.toThrow(ForbiddenException);
      await expect(service.create({ ...baseDto }, bot(owner))).rejects.toThrow(
        'Bot sessions cannot manage projects',
      );
      // Nothing was written.
      expect(await prisma.project.count()).toBe(0);
    });

    it('requires authentication', async () => {
      await expect(service.create({ ...baseDto }, undefined)).rejects.toThrow(
        'Authentication required',
      );
    });
  });

  describe('findAll', () => {
    it('lists ALL projects workspace-wide, ordered by position asc', async () => {
      await seedProject(prisma, { name: 'third', position: 2 });
      await seedProject(prisma, { name: 'first', position: 0.5 });
      await seedProject(prisma, { name: 'second', position: 1 });
      // A second board existing must not affect the listing.
      await seedBoard(prisma);
      const projects = await service.findAll();
      expect(projects.map((p: any) => p.name)).toEqual(['first', 'second', 'third']);
    });
  });

  describe('findOne', () => {
    it('returns tasks and a progress rollup', async () => {
      const doneStatus = board.statuses.find((s: any) => s.type === 'done');
      const inProgressStatus = board.statuses.find((s: any) => s.type === 'in_progress');
      const cancelledStatus = board.statuses.find((s: any) => s.type === 'cancelled');
      const project = await seedProject(prisma, { name: 'With tasks' });
      // seedTask does not forward projectId, so link after creation.
      const link = (t: any) =>
        prisma.task.update({ where: { id: t.id }, data: { projectId: project.id } });
      await link(await seedTask(prisma, doneStatus.id, { position: 2 }));
      await link(await seedTask(prisma, doneStatus.id, { position: 1, title: 'B' }));
      await link(await seedTask(prisma, inProgressStatus.id, {}));
      await link(await seedTask(prisma, cancelledStatus.id, {}));
      const found = await service.findOne(project.id);
      expect(found.tasks).toHaveLength(4);
      expect(found.progress).toEqual({
        total: 4,
        completed: 2,
        byStatus: { done: 2, in_progress: 1, cancelled: 1 },
      });
    });

    it('task rows carry taskNumber matching identifier-number (detail page regression pin)', async () => {
      const status = board.statuses[0];
      const project = await seedProject(prisma, { name: 'Numbered' });
      const task = await seedTask(prisma, status.id, { number: 101 });
      await prisma.task.update({ where: { id: task.id }, data: { projectId: project.id } });

      const found = await service.findOne(project.id);
      // Same shape tasks.service payloads use — the detail page renders this
      // chip with `task.taskNumber`.
      expect(found.tasks[0].taskNumber).toBe(`${board.identifier}-101`);
    });

    it('throws NotFoundException for a missing project', async () => {
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('stamps completedAt when status becomes completed', async () => {
      const project = await seedProject(prisma, { status: 'started' });
      const updated = await service.update(project.id, { status: 'completed' }, human(member));
      expect(updated.completedAt).not.toBeNull();
    });

    it('clears completedAt when moving away from completed', async () => {
      const project = await seedProject(prisma, {
        status: 'completed',
        completedAt: new Date(),
      });
      const updated = await service.update(project.id, { status: 'started' }, human(member));
      expect(updated.completedAt).toBeNull();
    });

    it('leaves completedAt untouched when only the name changes', async () => {
      const completedAt = new Date('2026-01-01T00:00:00.000Z');
      const project = await seedProject(prisma, {
        status: 'completed',
        completedAt,
      });
      const updated = await service.update(project.id, { name: 'Renamed' }, human(member));
      expect(updated.completedAt).not.toBeNull();
      expect(updated.completedAt!.toISOString()).toBe(completedAt.toISOString());
    });

    it('allows update by any member (v2: all-members, no board-admin gate)', async () => {
      const project = await seedProject(prisma, { name: 'Editable' });
      const updated = await service.update(project.id, { name: 'Renamed' }, human(member));
      expect(updated.name).toBe('Renamed');
    });

    it('rejects bot sessions', async () => {
      const project = await seedProject(prisma, { name: 'Untouchable' });
      await expect(service.update(project.id, { name: 'Nope' }, bot(owner))).rejects.toThrow(
        'Bot sessions cannot manage projects',
      );
      const stored = await prisma.project.findUnique({ where: { id: project.id } });
      expect(stored!.name).toBe('Untouchable');
    });
  });

  describe('remove', () => {
    it('deletes the project and nulls linked tasks (SetNull), tasks still exist', async () => {
      const project = await seedProject(prisma, { name: 'Doomed' });
      const task = await seedTask(prisma, board.statuses[0].id, {});
      await prisma.task.update({ where: { id: task.id }, data: { projectId: project.id } });
      await service.remove(project.id, human(member));
      await expect(service.findOne(project.id)).rejects.toThrow(NotFoundException);
      const stillThere = await prisma.task.findUnique({ where: { id: task.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.projectId).toBeNull();
    });

    it('rejects bot sessions', async () => {
      const project = await seedProject(prisma, { name: 'Doomed' });
      await expect(service.remove(project.id, bot(owner))).rejects.toThrow(
        'Bot sessions cannot manage projects',
      );
      const stored = await prisma.project.findUnique({ where: { id: project.id } });
      expect(stored).not.toBeNull();
    });
  });

  describe('events', () => {
    it('emits project:created/updated/deleted with NO board scope (global broadcast)', async () => {
      const emitted: any[] = [];
      const orig = events.emit.bind(events);
      (events as any).emit = (...args: any[]) => {
        emitted.push({ event: args[0], data: args[1], boardId: args[2] });
        return orig(...args);
      };
      try {
        const created = await service.create({ ...baseDto }, human(owner));
        await service.update(created.id, { name: 'Renamed' }, human(owner));
        await service.remove(created.id, human(owner));
        expect(emitted).toHaveLength(3);
        expect(emitted.map((e) => e.event)).toEqual([
          'project:created',
          'project:updated',
          'project:deleted',
        ]);
        // v2: no third arg — projects are workspace-level, so EventsService
        // broadcasts to every connected socket (undefined boardId = broadcast).
        for (const e of emitted) {
          expect(e.boardId).toBeUndefined();
        }
      } finally {
        (events as any).emit = orig;
      }
    });

    it('delete event carries only the id as its payload', async () => {
      const emitted: any[] = [];
      const orig = events.emit.bind(events);
      (events as any).emit = (...args: any[]) => {
        emitted.push(args[1]);
        return orig(...args);
      };
      try {
        const created = await service.create({ ...baseDto }, human(owner));
        await service.remove(created.id, human(owner));
        expect(emitted[emitted.length - 1]).toEqual({ id: created.id });
      } finally {
        (events as any).emit = orig;
      }
    });
  });
});
