import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ViewsService } from './views.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedUser, seedView, testFilters } from '../../test/setup';

describe('ViewsService', () => {
  let service: ViewsService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let owner: any;
  let member: any;
  let outsider: any;
  let boardAdmin: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ViewsService,
        MembersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<ViewsService>(ViewsService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    owner = await seedUser(prisma, { email: 'view-owner@example.com' });
    member = await seedUser(prisma, { email: 'view-member@example.com' });
    outsider = await seedUser(prisma, { email: 'view-outsider@example.com' });
    boardAdmin = await seedUser(prisma, { email: 'view-admin@example.com' });
    await prisma.member.create({ data: { boardId: board.id, userId: owner.id, role: 'member' } });
    await prisma.member.create({ data: { boardId: board.id, userId: member.id, role: 'member' } });
    await prisma.member.create({
      data: { boardId: board.id, userId: boardAdmin.id, role: 'admin' },
    });
  });

  afterEach(async () => {
    await prisma.view.deleteMany();
    await prisma.member.deleteMany();
    await prisma.user.deleteMany();
    await prisma.board.deleteMany();
  });

  const baseDto = {
    boardId: '', // set per-test
    name: 'Urgent this week',
    filters: testFilters,
    shared: false,
  };

  it('creates a personal view with serialized filters', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, owner);
    expect(view.name).toBe('Urgent this week');
    expect(view.userId).toBe(owner.id);
    expect(view.filters).toBe(JSON.stringify(testFilters));
  });

  it('creates a shared view with creator set (isShared true)', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    expect(view.isShared).toBe(true);
    expect(view.userId).toBe(owner.id);
  });

  it('rejects shared view creation by a non-member', async () => {
    await expect(
      service.create({ ...baseDto, boardId: board.id, shared: true }, outsider),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects duplicate name in the same personal scope', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member);
    await expect(
      service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member),
    ).rejects.toThrow(ConflictException);
  });

  it('allows the same name across users (personal scopes are independent)', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, member);
    const other = await service.create({ ...baseDto, boardId: board.id, name: 'My view' }, owner);
    expect(other.userId).toBe(owner.id);
    expect(other.isShared).toBe(false);
  });

  it('allows the same personal name across a personal and a shared view (separate scopes)', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'My view', shared: true }, owner);
    const personal = await service.create(
      { ...baseDto, boardId: board.id, name: 'My view' },
      owner,
    );
    expect(personal.isShared).toBe(false);
  });

  it('lists shared views plus only my personal views, ordered by position', async () => {
    await seedView(prisma, board.id, {
      name: 'shared-1',
      userId: member.id,
      isShared: true,
      position: 2,
    });
    await seedView(prisma, board.id, { name: 'mine', userId: owner.id, position: 1 });
    await seedView(prisma, board.id, { name: 'theirs', userId: member.id });
    const views = await service.findAll(board.id, owner.id);
    expect(views.map((v: any) => v.name)).toEqual(['mine', 'shared-1']);
  });

  it('fetches a shared view for any authenticated user', async () => {
    const view = await seedView(prisma, board.id, {
      name: 'shared',
      userId: member.id,
      isShared: true,
    });
    const found = await service.findOne(view.id, outsider);
    expect(found.id).toBe(view.id);
  });

  it("404s someone else's personal view on findOne", async () => {
    const view = await seedView(prisma, board.id, { name: 'private', userId: owner.id });
    await expect(service.findOne(view.id, outsider)).rejects.toThrow(NotFoundException);
  });

  it('creator (plain member) updates their own shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, member);
    const updated = await service.update(view.id, { name: 'Creator edit' }, member);
    expect(updated.name).toBe('Creator edit');
  });

  it('owner updates their personal view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    const updated = await service.update(view.id, { name: 'Renamed' }, member);
    expect(updated.name).toBe('Renamed');
  });

  it('rejects personal view update by a non-owner', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    await expect(service.update(view.id, { name: 'x' }, owner)).rejects.toThrow(ForbiddenException);
  });

  it('board admin (not creator) updates a shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    const updated = await service.update(view.id, { name: 'Admin edit' }, boardAdmin);
    expect(updated.name).toBe('Admin edit');
  });

  it('plain member (not creator, not admin) cannot update a shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    await expect(service.update(view.id, { name: 'x' }, member)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('creator (plain member) deletes their own shared view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, member);
    await service.remove(view.id, member);
    const remaining = await service.findAll(board.id, member.id);
    expect(remaining).toHaveLength(0);
  });

  it('rejects rename to a duplicate name in the same shared scope', async () => {
    const a = await service.create(
      { ...baseDto, boardId: board.id, name: 'A', shared: true },
      owner,
    );
    const b = await service.create(
      { ...baseDto, boardId: board.id, name: 'B', shared: true },
      owner,
    );
    await expect(service.update(b.id, { name: 'A' }, boardAdmin)).rejects.toThrow(
      ConflictException,
    );
    expect(a.name).toBe('A');
  });

  it('allows the same shared name across different creators (scope includes userId)', async () => {
    await service.create({ ...baseDto, boardId: board.id, name: 'A', shared: true }, member);
    const other = await service.create(
      { ...baseDto, boardId: board.id, name: 'A', shared: true },
      owner,
    );
    expect(other.isShared).toBe(true);
    expect(other.userId).toBe(owner.id);
  });

  it('owner deletes their personal view', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id }, member);
    await service.remove(view.id, member);
    const remaining = await service.findAll(board.id, member.id);
    expect(remaining).toHaveLength(0);
  });

  it('member (non-creator, non-admin) cannot delete a shared view but admin can', async () => {
    const view = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    await expect(service.remove(view.id, member)).rejects.toThrow(ForbiddenException);
    await service.remove(view.id, boardAdmin);
    expect(await service.findAll(board.id, member.id)).toHaveLength(0);
  });

  it('emits events for shared views only', async () => {
    const emitted: any[] = [];
    const orig = events.emit.bind(events);
    (events as any).emit = (...args: any[]) => {
      emitted.push(args[0]);
      return orig(...args);
    };
    const shared = await service.create({ ...baseDto, boardId: board.id, shared: true }, owner);
    const personal = await service.create({ ...baseDto, boardId: board.id, name: 'second' }, owner);
    await service.update(shared.id, { name: 'Shared v2' }, boardAdmin);
    await service.remove(shared.id, boardAdmin);
    await service.remove(personal.id, owner);
    expect(emitted.filter((e) => e.startsWith && e.startsWith('view:'))).toEqual([
      'view:created',
      'view:updated',
      'view:deleted',
    ]);
  });
});
