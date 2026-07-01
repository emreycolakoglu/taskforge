import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { RelationsService } from './relations.service';
import { TasksService } from '../tasks/tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createTestPrisma, seedBoard, seedTask, seedRelation } from '../../test/setup';

describe('RelationsService', () => {
  let service: RelationsService;
  let tasksService: TasksService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let tA: any, tB: any, tC: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationsService,
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: SubscriptionsService, useValue: new SubscriptionsService(prisma) },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
      ],
    }).compile();
    service = module.get<RelationsService>(RelationsService);
    tasksService = module.get<TasksService>(TasksService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    board = await seedBoard(prisma);
    tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
    tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
    tC = await seedTask(prisma, board.statuses[0].id, { title: 'C' });
  });

  afterEach(async () => {
    // reverse dependency order: relations before tasks
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
  });

  // ─── create ──────────────────────────────────────────────────────────────

  it('1. create blocks (direction=source) → row {from: urlTask, to: other}; entry has taskNumber', async () => {
    const entry = await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    expect(entry.type).toBe('blocks');
    expect(entry.task.id).toBe(tB.id);
    expect(entry.task.taskNumber).toBe(`${board.identifier}-${tB.number}`);

    const row = await prisma.taskRelation.findFirst();
    expect(row!.fromTaskId).toBe(tA.id);
    expect(row!.toTaskId).toBe(tB.id);
  });

  it('2. create blocks (direction=target) → row {from: other, to: urlTask}', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'target' });
    const row = await prisma.taskRelation.findFirst();
    expect(row!.fromTaskId).toBe(tB.id);
    expect(row!.toTaskId).toBe(tA.id);
  });

  it('3. create related_to → canonicalized (fromId < toId) regardless of input order', async () => {
    // Pass in "reverse" order; service should canonicalize.
    const [lo, hi] = tA.id < tB.id ? [tA, tB] : [tB, tA];
    await service.create(tA.id, { otherTaskId: tB.id, type: 'related_to' });
    const row = await prisma.taskRelation.findFirst();
    expect(row!.fromTaskId).toBe(lo.id);
    expect(row!.toTaskId).toBe(hi.id);
  });

  it('4. create related_to with direction specified → direction ignored, still canonicalized', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'related_to', direction: 'target' });
    const row = await prisma.taskRelation.findFirst();
    const [lo, hi] = tA.id < tB.id ? [tA, tB] : [tB, tA];
    expect(row!.fromTaskId).toBe(lo.id);
    expect(row!.toTaskId).toBe(hi.id);
  });

  it('5. create with self → BadRequestException (both types)', async () => {
    await expect(service.create(tA.id, { otherTaskId: tA.id, type: 'blocks' }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create(tA.id, { otherTaskId: tA.id, type: 'related_to' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('6. create with non-existent otherTaskId → NotFoundException', async () => {
    await expect(service.create(tA.id, { otherTaskId: 'nope', type: 'blocks' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('7. create across boards → BadRequestException', async () => {
    const otherBoard = await seedBoard(prisma);
    const foreign = await seedTask(prisma, otherBoard.statuses[0].id, { title: 'Foreign' });
    await expect(service.create(tA.id, { otherTaskId: foreign.id, type: 'blocks' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('8. create duplicate (same pair+type) → ConflictException (409)', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    await expect(service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('9. create blocks A→B then B→A → BadRequestException (cycle)', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' }); // A blocks B
    // Now try B blocks A → B→A would close a cycle (A already blocks B).
    await expect(service.create(tB.id, { otherTaskId: tA.id, type: 'blocks', direction: 'source' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('10. create blocks A→B, B→C, then C→A → cycle rejected (3-node chain)', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' }); // A→B
    await service.create(tB.id, { otherTaskId: tC.id, type: 'blocks', direction: 'source' }); // B→C
    // C→A would close A→B→C→A
    await expect(service.create(tC.id, { otherTaskId: tA.id, type: 'blocks', direction: 'source' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('11. create blocks A→B, B→C, then A→C → succeeds (no cycle)', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' }); // A→B
    await service.create(tB.id, { otherTaskId: tC.id, type: 'blocks', direction: 'source' }); // B→C
    // A→C is fine (no path C→A)
    const entry = await service.create(tA.id, { otherTaskId: tC.id, type: 'blocks', direction: 'source' });
    expect(entry.type).toBe('blocks');
  });

  it('12. create related_to A→B, then blocks A→B → succeeds (different types independent)', async () => {
    await service.create(tA.id, { otherTaskId: tB.id, type: 'related_to' });
    const entry = await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    expect(entry.type).toBe('blocks');
    const rows = await prisma.taskRelation.findMany();
    expect(rows).toHaveLength(2);
  });

  // ─── list ────────────────────────────────────────────────────────────────

  it('13. list → correctly groups blocking / blockedBy / relatedTo; other task fields present', async () => {
    const tD = await seedTask(prisma, board.statuses[0].id, { title: 'D' });
    // A blocks B
    await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    // C blocks A
    await service.create(tA.id, { otherTaskId: tC.id, type: 'blocks', direction: 'target' });
    // A related_to D
    await service.create(tA.id, { otherTaskId: tD.id, type: 'related_to' });

    const res = await service.list(tA.id);
    expect(res.blocking).toHaveLength(1);
    expect(res.blocking[0].task.id).toBe(tB.id);
    expect(res.blockedBy).toHaveLength(1);
    expect(res.blockedBy[0].task.id).toBe(tC.id);
    expect(res.relatedTo).toHaveLength(1);
    expect(res.relatedTo[0].task.id).toBe(tD.id);
    // taskNumber present
    expect(res.blocking[0].task.taskNumber).toBe(`${board.identifier}-${tB.number}`);
    expect(res.blocking[0].task.title).toBe('B');
  });

  it('14. list with no relations → all three groups empty arrays', async () => {
    const res = await service.list(tA.id);
    expect(res.blocking).toEqual([]);
    expect(res.blockedBy).toEqual([]);
    expect(res.relatedTo).toEqual([]);
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  it('15. delete existing relation → removed; returns {deleted: true}', async () => {
    const entry = await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    const res = await service.delete(entry.relationId);
    expect(res).toEqual({ deleted: true });
    const row = await prisma.taskRelation.findUnique({ where: { id: entry.relationId } });
    expect(row).toBeNull();
  });

  it('16. delete non-existent relationId → NotFoundException', async () => {
    await expect(service.delete('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── cleanup ─────────────────────────────────────────────────────────────

  it('17. archive a task with relations → relation rows hard-deleted; relation:deleted emitted per row; task:deleted still emitted', async () => {
    // Seed two relations touching tA: A blocks B, A related_to C
    await seedRelation(prisma, tA.id, tB.id, 'blocks');
    await seedRelation(prisma, tA.id, tC.id, 'related_to');

    const emitSpy = jest.spyOn(events, 'emit');
    await tasksService.remove(tA.id);

    const remaining = await prisma.taskRelation.findMany();
    expect(remaining).toHaveLength(0);

    const deletedEvents = emitSpy.mock.calls.filter((c) => c[0] === 'relation:deleted');
    expect(deletedEvents).toHaveLength(2);
    const taskDeletedEvents = emitSpy.mock.calls.filter((c) => c[0] === 'task:deleted');
    expect(taskDeletedEvents.length).toBeGreaterThanOrEqual(1);
    emitSpy.mockRestore();
  });

  it('18. blocks cycle check ignores related_to edges', async () => {
    // A related_to B (undirected, no cycle impact), then A blocks B should succeed.
    await service.create(tA.id, { otherTaskId: tB.id, type: 'related_to' });
    const entry = await service.create(tA.id, { otherTaskId: tB.id, type: 'blocks', direction: 'source' });
    expect(entry.type).toBe('blocks');
  });
});