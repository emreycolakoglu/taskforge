import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { MembersService } from '../members/members.service';
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
  let boardAdmin: any;
  let globalAdmin: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        MembersService,
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
    boardAdmin = await seedUser(prisma, { email: 'project-board-admin@example.com' });
    globalAdmin = await seedUser(prisma, {
      email: 'project-global-admin@example.com',
      role: 'admin',
    });
    await prisma.member.create({ data: { boardId: board.id, userId: owner.id, role: 'member' } });
    await prisma.member.create({ data: { boardId: board.id, userId: member.id, role: 'member' } });
    await prisma.member.create({
      data: { boardId: board.id, userId: boardAdmin.id, role: 'admin' },
    });
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

  const baseDto = {
    boardId: '', // set per-test
    name: 'Roadmap v1',
  };

  it('creates the FIRST project at position 0 (statuses house pattern, not ?? 0)', async () => {
    const created = await service.create({ ...baseDto, boardId: board.id }, boardAdmin);
    expect(created.position).toBe(0);
  });

  it('creates a project appending at the end of the board (position = max+1)', async () => {
    await seedProject(prisma, board.id, { name: 'First', position: 3 });
    const created = await service.create({ ...baseDto, boardId: board.id }, boardAdmin);
    expect(created.name).toBe('Roadmap v1');
    expect(created.position).toBe(4);
    expect(created.icon).toBe('📦');
    expect(created.status).toBe('planned');
    expect(created.completedAt).toBeNull();
  });

  it('rejects project creation by a non-admin member', async () => {
    await expect(service.create({ ...baseDto, boardId: board.id }, member)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows project creation by a board-admin member', async () => {
    const created = await service.create({ ...baseDto, boardId: board.id }, boardAdmin);
    expect(created.name).toBe('Roadmap v1');
  });

  it('allows project creation by a global admin (no board membership)', async () => {
    const created = await service.create({ ...baseDto, boardId: board.id }, globalAdmin);
    expect(created.name).toBe('Roadmap v1');
  });

  it('allows project creation on a legacy board (zero Member rows)', async () => {
    const legacyBoard = await seedBoard(prisma);
    const plainUser = await seedUser(prisma, { email: 'project-legacy-user@example.com' });
    const created = await service.create({ ...baseDto, boardId: legacyBoard.id }, plainUser);
    expect(created.name).toBe('Roadmap v1');
  });

  it('findAll orders projects by position asc', async () => {
    await seedProject(prisma, board.id, { name: 'third', position: 2 });
    await seedProject(prisma, board.id, { name: 'first', position: 0.5 });
    await seedProject(prisma, board.id, { name: 'second', position: 1 });
    const projects = await service.findAll(board.id);
    expect(projects.map((p: any) => p.name)).toEqual(['first', 'second', 'third']);
  });

  it('findOne returns tasks and a progress rollup', async () => {
    const doneStatus = board.statuses.find((s: any) => s.type === 'done');
    const inProgressStatus = board.statuses.find((s: any) => s.type === 'in_progress');
    const cancelledStatus = board.statuses.find((s: any) => s.type === 'cancelled');
    const project = await seedProject(prisma, board.id, { name: 'With tasks' });
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

  it('findOne task rows carry taskNumber matching identifier-number (detail page regression pin)', async () => {
    const status = board.statuses[0];
    const project = await seedProject(prisma, board.id, { name: 'Numbered' });
    const task = await seedTask(prisma, status.id, { number: 101 });
    await prisma.task.update({ where: { id: task.id }, data: { projectId: project.id } });

    const found = await service.findOne(project.id);
    // Same shape tasks.service payloads use — the detail page renders this
    // chip with `task.taskNumber`.
    expect(found.tasks[0].taskNumber).toBe(`${board.identifier}-101`);
  });

  it('update stamps completedAt when status becomes completed', async () => {
    const project = await seedProject(prisma, board.id, { status: 'started' });
    const updated = await service.update(project.id, { status: 'completed' }, boardAdmin);
    expect(updated.completedAt).not.toBeNull();
  });

  it('update clears completedAt when moving away from completed', async () => {
    const project = await seedProject(prisma, board.id, {
      status: 'completed',
      completedAt: new Date(),
    });
    const updated = await service.update(project.id, { status: 'started' }, boardAdmin);
    expect(updated.completedAt).toBeNull();
  });

  it('update leaves completedAt untouched when only the name changes', async () => {
    const completedAt = new Date('2026-01-01T00:00:00.000Z');
    const project = await seedProject(prisma, board.id, {
      status: 'completed',
      completedAt,
    });
    const updated = await service.update(project.id, { name: 'Renamed' }, boardAdmin);
    expect(updated.completedAt).not.toBeNull();
    expect(updated.completedAt!.toISOString()).toBe(completedAt.toISOString());
  });

  it('update rejects a non-admin member', async () => {
    const project = await seedProject(prisma, board.id, { name: 'Untouchable' });
    await expect(service.update(project.id, { name: 'Nope' }, member)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('remove deletes the project and nulls linked tasks (SetNull), tasks still exist', async () => {
    const project = await seedProject(prisma, board.id, { name: 'Doomed' });
    const task = await seedTask(prisma, board.statuses[0].id, {});
    await prisma.task.update({ where: { id: task.id }, data: { projectId: project.id } });
    await service.remove(project.id, boardAdmin);
    await expect(service.findOne(project.id)).rejects.toThrow(NotFoundException);
    const stillThere = await prisma.task.findUnique({ where: { id: task.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere!.projectId).toBeNull();
  });

  it('emits project:created, project:updated and project:deleted events with the boardId', async () => {
    const emitted: any[] = [];
    const orig = events.emit.bind(events);
    (events as any).emit = (...args: any[]) => {
      emitted.push({ event: args[0], data: args[1], boardId: args[2] });
      return orig(...args);
    };
    const created = await service.create({ ...baseDto, boardId: board.id }, boardAdmin);
    await service.update(created.id, { name: 'Renamed' }, boardAdmin);
    await service.remove(created.id, boardAdmin);
    expect(emitted).toHaveLength(3);
    expect(emitted.map((e) => e.event)).toEqual([
      'project:created',
      'project:updated',
      'project:deleted',
    ]);
    for (const e of emitted) {
      expect(e.boardId).toBe(board.id);
    }
  });

  it('delete event carries only the id as its payload', async () => {
    const emitted: any[] = [];
    const orig = events.emit.bind(events);
    (events as any).emit = (...args: any[]) => {
      emitted.push(args[1]);
      return orig(...args);
    };
    const created = await service.create({ ...baseDto, boardId: board.id }, boardAdmin);
    await service.remove(created.id, boardAdmin);
    expect(emitted[emitted.length - 1]).toEqual({ id: created.id });
  });
});
