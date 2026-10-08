import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { MembersService } from '../members/members.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import {
  createTestPrisma,
  seedBoard,
  seedDocument,
  seedProject,
  seedTask,
  seedUser,
} from '../../test/setup';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let owner: any;
  let member: any;
  let globalAdmin: any;
  let attachments: AttachmentsService;
  let driver: LocalDiskDriver;
  let storageRoot: string;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    storageRoot = mkdtempSync(join(tmpdir(), 'tf-proj-att-'));
    driver = new LocalDiskDriver(storageRoot);
    attachments = new AttachmentsService(prisma, events, new MembersService(prisma), driver);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: AttachmentsService, useValue: attachments },
      ],
    }).compile();
    service = module.get<ProjectsService>(ProjectsService);
  });

  afterAll(async () => {
    rmSync(storageRoot, { recursive: true, force: true });
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
    await prisma.attachment.deleteMany();
    await prisma.document.deleteMany();
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
  // session flag (see `actor()` in projects.controller.ts); services test the
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

    it('rejects a non-existent leadId with BadRequestException (not an FK 500)', async () => {
      await expect(
        service.create({ ...baseDto, leadId: 'no-such-user' }, human(owner)),
      ).rejects.toThrow(BadRequestException);
      expect(await prisma.project.count()).toBe(0);
    });

    it('stores the lead when it exists', async () => {
      const created = await service.create({ ...baseDto, leadId: owner.id }, human(owner));
      expect(created.leadId).toBe(owner.id);
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

    it('embeds a { total, completed } progress rollup per project, across boards', async () => {
      const otherBoard = await seedBoard(prisma);
      const done = board.statuses.find((s: any) => s.type === 'done');
      const otherDone = otherBoard.statuses.find((s: any) => s.type === 'done');
      const inProgress = board.statuses.find((s: any) => s.type === 'in_progress');
      const cancelled = board.statuses.find((s: any) => s.type === 'cancelled');
      const roadmap = await seedProject(prisma, { name: 'Roadmap', position: 0 });
      const empty = await seedProject(prisma, { name: 'Empty', position: 1 });
      const link = (t: any, projectId: string) =>
        prisma.task.update({ where: { id: t.id }, data: { projectId } });
      await link(await seedTask(prisma, done.id, {}), roadmap.id);
      await link(await seedTask(prisma, otherDone.id, {}), roadmap.id);
      await link(await seedTask(prisma, inProgress.id, {}), roadmap.id);
      // Cancelled is terminal but not 'done' — same rule as findOne.
      await link(await seedTask(prisma, cancelled.id, {}), roadmap.id);
      // Unlinked tasks contribute nowhere.
      await seedTask(prisma, done.id, {});

      const projects = await service.findAll();
      const byName = Object.fromEntries(projects.map((p: any) => [p.name, p.progress]));
      expect(byName).toEqual({
        Roadmap: { total: 4, completed: 2 },
        Empty: { total: 0, completed: 0 },
      });
    });

    it('computes progress in a constant number of queries (no N+1)', async () => {
      for (let i = 0; i < 5; i++) await seedProject(prisma, { name: `p${i}`, position: i });
      // `as any`: Prisma's groupBy generics trip TS2615 under jest.spyOn.
      const taskDelegate = prisma.task as any;
      const spies = ['findMany', 'groupBy', 'count'].map((m) => jest.spyOn(taskDelegate, m));
      try {
        await service.findAll();
        const calls = spies.reduce((n, s) => n + s.mock.calls.length, 0);
        expect(calls).toBeLessThanOrEqual(2);
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
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

    // Edit dialog clears fields with explicit null. `new Date(null)` is the
    // epoch, so a naive `!== undefined` gate stored 1970-01-01 instead.
    it('clears startDate, targetDate, leadId and description on explicit null', async () => {
      const project = await seedProject(prisma, {
        leadId: owner.id,
        description: 'Some words',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        targetDate: new Date('2026-06-01T00:00:00.000Z'),
      });
      const updated = await service.update(
        project.id,
        { startDate: null, targetDate: null, leadId: null, description: null },
        human(member),
      );
      expect(updated.startDate).toBeNull();
      expect(updated.targetDate).toBeNull();
      expect(updated.leadId).toBeNull();
      expect(updated.description).toBeNull();
    });

    it('leaves dates, lead and description untouched when the fields are omitted', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const targetDate = new Date('2026-06-01T00:00:00.000Z');
      const project = await seedProject(prisma, {
        leadId: owner.id,
        description: 'Keep me',
        startDate,
        targetDate,
      });
      const updated = await service.update(project.id, { name: 'Renamed' }, human(member));
      expect(updated.startDate!.toISOString()).toBe(startDate.toISOString());
      expect(updated.targetDate!.toISOString()).toBe(targetDate.toISOString());
      expect(updated.leadId).toBe(owner.id);
      expect(updated.description).toBe('Keep me');
    });

    it('sets dates and lead from strings', async () => {
      const project = await seedProject(prisma);
      const updated = await service.update(
        project.id,
        { startDate: '2026-03-01', targetDate: '2026-04-01', leadId: owner.id },
        human(member),
      );
      expect(updated.startDate!.toISOString()).toBe('2026-03-01T00:00:00.000Z');
      expect(updated.targetDate!.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      expect(updated.leadId).toBe(owner.id);
    });

    it('rejects a non-existent leadId with BadRequestException (not an FK 500)', async () => {
      const project = await seedProject(prisma, { leadId: owner.id });
      await expect(
        service.update(project.id, { leadId: 'no-such-user' }, human(member)),
      ).rejects.toThrow(BadRequestException);
      const stored = await prisma.project.findUnique({ where: { id: project.id } });
      expect(stored!.leadId).toBe(owner.id);
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

    it('deletes its documents and their attachments (FK SetNull would orphan them)', async () => {
      const project = await seedProject(prisma, { name: 'Doomed' });
      const other = await seedProject(prisma, { name: 'Survivor' });
      const doomedDoc = await seedDocument(prisma, '', { projectId: project.id });
      const keptDoc = await seedDocument(prisma, '', { projectId: other.id });
      const task = await seedTask(prisma, board.statuses[0].id, {});
      const taskDoc = await seedDocument(prisma, task.id);
      const att = await attachments.create({
        subjectType: 'document',
        subjectId: doomedDoc.id,
        filename: 'spec.txt',
        mimeType: 'text/plain',
        content: Buffer.from('spec'),
        user: { id: member.id, displayName: member.displayName, role: 'member' },
      });
      const { storageKey } = await prisma.attachment.findUniqueOrThrow({ where: { id: att.id } });

      await service.remove(project.id, human(member));

      expect(await prisma.document.findUnique({ where: { id: doomedDoc.id } })).toBeNull();
      expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
      expect(await driver.stat(storageKey)).toBeNull();
      expect(await prisma.document.findUnique({ where: { id: keptDoc.id } })).not.toBeNull();
      expect(await prisma.document.findUnique({ where: { id: taskDoc.id } })).not.toBeNull();
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
