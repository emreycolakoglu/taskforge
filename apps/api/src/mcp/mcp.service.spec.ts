import { Test, TestingModule } from '@nestjs/testing';
import { McpService } from './mcp.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedComment, seedUser, seedRelation } from '../../test/setup';

describe('McpService', () => {
  let service: McpService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let user: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        RelationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: SubscriptionsService, useValue: new SubscriptionsService(prisma) },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
      ],
    }).compile();
    service = module.get<McpService>(McpService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    user = await seedUser(prisma);
    board = await seedBoard(prisma);
  });

  afterEach(async () => {
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.label.deleteMany();
    await prisma.list.deleteMany();
    await prisma.member.deleteMany();
    await prisma.board.deleteMany();
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  // ─── Boards ───

  describe('boards_list', () => {
    it('should list all boards', async () => {
      const res = await service.handleRequest({ method: 'boards_list', params: {}, id: 1 }, user);
      expect(res.jsonrpc).toBe('2.0');
      expect(res.result).toBeDefined();
      expect(Array.isArray(res.result)).toBe(true);
      expect(res.result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('boards_get', () => {
    it('should get a board with lists and tasks', async () => {
      await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'boards_get', params: { id: board.id }, id: 2 }, user);
      expect(res.result.id).toBe(board.id);
      expect(res.result.lists).toBeDefined();
      expect(res.result.labels).toBeDefined();
    });
  });

  describe('boards_create', () => {
    it('should create a board with default lists', async () => {
      const res = await service.handleRequest({
        method: 'boards_create',
        params: { name: 'MCP Board', slug: 'mcp-board', identifier: 'MCP', description: 'Created via MCP' },
        id: 3,
      }, user);
      expect(res.result.name).toBe('MCP Board');
      expect(res.result.identifier).toBe('MCP');
      expect(res.result.lists).toHaveLength(5);
    });
  });

  describe('boards_delete', () => {
    it('should delete a board', async () => {
      const res = await service.handleRequest({ method: 'boards_delete', params: { id: board.id }, id: 4 }, user);
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Lists ───

  describe('lists_list', () => {
    it('should list lists for a board', async () => {
      const res = await service.handleRequest({ method: 'lists_list', params: { boardId: board.id }, id: 5 }, user);
      expect(res.result).toHaveLength(5);
    });
  });

  describe('lists_create', () => {
    it('should create a list', async () => {
      const res = await service.handleRequest({
        method: 'lists_create',
        params: { boardId: board.id, name: 'MCP List' },
        id: 6,
      }, user);
      expect(res.result.name).toBe('MCP List');
    });
  });

  describe('lists_update', () => {
    it('should update a list', async () => {
      const res = await service.handleRequest({
        method: 'lists_update',
        params: { id: board.lists[0].id, name: 'Updated', color: '#ff0000' },
        id: 7,
      }, user);
      expect(res.result.name).toBe('Updated');
      expect(res.result.color).toBe('#ff0000');
    });
  });

  describe('lists_delete', () => {
    it('should delete a list', async () => {
      const res = await service.handleRequest({
        method: 'lists_delete',
        params: { id: board.lists[0].id },
        id: 8,
      }, user);
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Tasks ───

  describe('tasks_list', () => {
    it('should list tasks with filters', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Task 1' });
      await seedTask(prisma, board.lists[0].id, { title: 'Task 2' });

      const all = await service.handleRequest({ method: 'tasks_list', params: { boardId: board.id }, id: 9 }, user);
      expect(all.result).toHaveLength(2);

      const filtered = await service.handleRequest({ method: 'tasks_list', params: { boardId: board.id, status: 'active' }, id: 10 }, user);
      expect(filtered.result).toHaveLength(2);
    });
  });

  describe('tasks_get', () => {
    it('should get a task with relations', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'tasks_get', params: { id: task.id }, id: 11 }, user);
      expect(res.result.id).toBe(task.id);
      expect(res.result.list).toBeDefined();
    });
  });

  describe('tasks_search', () => {
    it('should search tasks by title and description', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Critical bug fix' });
      await seedTask(prisma, board.lists[0].id, { title: 'Add feature' });

      const res = await service.handleRequest({ method: 'tasks_search', params: { query: 'bug' }, id: 12 }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].title).toBe('Critical bug fix');
      expect(res.result[0]).toHaveProperty('taskNumber');
    });

    it('should search tasks by task number format', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Find by number' });
      const res = await service.handleRequest({ method: 'tasks_search', params: { query: `${board.identifier}-1` }, id: 128 }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].taskNumber).toBe(`${board.identifier}-1`);
    });
  });

  describe('tasks_create', () => {
    it('should create a task with labels', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'MCP task', labelIds: [label.id] },
        id: 13,
      }, user);
      expect(res.result.title).toBe('MCP task');
      expect(res.result.labels).toHaveLength(1);
      expect(res.result).toHaveProperty('taskNumber');
      expect(res.result).toHaveProperty('boardId');
    });

    it('should default assigneeId to authenticated user when not provided', async () => {
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Auto-assigned task' },
        id: 14,
      }, user);
      expect(res.result.assigneeId).toBe(user.id);
    });

    it('should use explicit assigneeId when provided', async () => {
      const otherUser = await seedUser(prisma, { email: 'other@example.com', displayName: 'Other' });
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Explicit assignee', assigneeId: otherUser.id },
        id: 15,
      }, user);
      expect(res.result.assigneeId).toBe(otherUser.id);
    });

    it('should record activity with authenticated user as actor', async () => {
      await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Task with actor' },
        id: 16,
      }, user);
      const activity = await prisma.activity.findFirst({ where: { action: 'created' } });
      expect(activity?.actorId).toBe(user.id);
      expect(activity?.actor).toBe(user.displayName);
    });
  });

  describe('tasks_update', () => {
    it('should update a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'tasks_update',
        params: { id: task.id, title: 'Updated', priority: 'urgent' },
        id: 17,
      }, user);
      expect(res.result.title).toBe('Updated');
      expect(res.result.priority).toBe('urgent');
    });

    it('should return error for non-existent task', async () => {
      const res = await service.handleRequest({ method: 'tasks_update', params: { id: 'nonexistent' }, id: 18 }, user);
      expect(res.error).toBeDefined();
    });
  });

  describe('tasks_move', () => {
    it('should move a task to another list', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'tasks_move',
        params: { id: task.id, listId: board.lists[2].id },
        id: 19,
      }, user);
      expect(res.result.listId).toBe(board.lists[2].id);
    });
  });

  describe('tasks_delete', () => {
    it('should archive a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'tasks_delete', params: { id: task.id }, id: 20 }, user);
      expect(res.result.archived).toBe(true);
    });
  });

  // ─── Sub-tasks (MCP parity) ────────────────────────────────────────────────

  describe('sub-tasks', () => {
    it('tasks_create with parentId returns task with parentId set', async () => {
      const parent = await seedTask(prisma, board.lists[0].id, { title: 'Parent' });
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Child', parentId: parent.id },
        id: 301,
      }, user);
      expect(res.result.parentId).toBe(parent.id);
    });

    it('tasks_create with invalid parentId (other board) returns JSON-RPC error', async () => {
      const otherBoard = await seedBoard(prisma);
      const foreignParent = await seedTask(prisma, otherBoard.lists[0].id, { title: 'Foreign' });
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Child', parentId: foreignParent.id },
        id: 302,
      }, user);
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('same board');
    });

    it('tasks_list with include="top" excludes sub-tasks', async () => {
      const parent = await seedTask(prisma, board.lists[0].id, { title: 'Parent' });
      await seedTask(prisma, board.lists[0].id, { title: 'Child', parentId: parent.id });
      const res = await service.handleRequest({
        method: 'tasks_list',
        params: { boardId: board.id, include: 'top' },
        id: 303,
      }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].id).toBe(parent.id);
    });
  });

  // ─── Comments ───

  describe('comments_list', () => {
    it('should list comments on a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      await seedComment(prisma, task.id);
      const res = await service.handleRequest({ method: 'comments_list', params: { taskId: task.id }, id: 21 }, user);
      expect(res.result).toHaveLength(1);
    });
  });

  describe('comments_create', () => {
    it('should create a comment with authenticated user as author', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'comments_create',
        params: { taskId: task.id, body: 'MCP comment' },
        id: 22,
      }, user);
      expect(res.result.body).toBe('MCP comment');
      expect(res.result.authorId).toBe(user.id);
      expect(res.result.author).toBe(user.displayName);
    });
  });

  // ─── Labels ───

  describe('labels_list', () => {
    it('should list labels on a board', async () => {
      await seedLabel(prisma, board.id);
      const res = await service.handleRequest({ method: 'labels_list', params: { boardId: board.id }, id: 23 }, user);
      expect(res.result).toHaveLength(1);
    });
  });

  describe('labels_create', () => {
    it('should create a label', async () => {
      const res = await service.handleRequest({
        method: 'labels_create',
        params: { boardId: board.id, name: 'MCP-label', color: '#ff0000' },
        id: 24,
      }, user);
      expect(res.result.name).toBe('MCP-label');
    });
  });

  describe('labels_delete', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest({ method: 'labels_delete', params: { id: label.id }, id: 25 }, user);
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Activity ───

  describe('activity_list', () => {
    it('should list activity for a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id, { title: 'Activity test' });
      // Seed some activity for this task
      await prisma.activity.createMany({
        data: [
          { taskId: task.id, actorId: null, actor: 'alice', action: 'created', detail: '{"title":"Activity test"}' },
          { taskId: task.id, actorId: null, actor: 'bob', action: 'moved', detail: '{"to":"In Progress"}' },
        ],
      });
      const res = await service.handleRequest({ method: 'activity_list', params: { taskId: task.id }, id: 26 }, user);
      expect(res.result.length).toBeGreaterThan(0);
    });

    it('should list activity for a board', async () => {
      const res = await service.handleRequest({ method: 'activity_list', params: { boardId: board.id }, id: 27 }, user);
      expect(Array.isArray(res.result)).toBe(true);
    });
  });

  // ─── Relations (MCP parity) ───────────────────────────────────────────────

  describe('relations', () => {
    it('relations_list returns grouped relations', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      await seedRelation(prisma, tA.id, tB.id, 'blocks'); // A blocks B

      const res = await service.handleRequest({
        method: 'relations_list',
        params: { taskId: tA.id },
        id: 401,
      }, user);
      expect(res.result.taskId).toBe(tA.id);
      expect(res.result.blocking).toHaveLength(1);
      expect(res.result.blocking[0].task.id).toBe(tB.id);
      expect(res.result.blockedBy).toEqual([]);
      expect(res.result.relatedTo).toEqual([]);
    });

    it('relations_create with direction=source → URL task blocks other', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      const res = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
        id: 402,
      }, user);
      expect(res.result.type).toBe('blocks');
      expect(res.result.task.id).toBe(tB.id);
      const row = await prisma.taskRelation.findFirst();
      expect(row!.fromTaskId).toBe(tA.id);
      expect(row!.toTaskId).toBe(tB.id);
    });

    it('relations_create with direction=target → URL task blocked by other', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      const res = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'target' },
        id: 403,
      }, user);
      expect(res.result.type).toBe('blocks');
      const row = await prisma.taskRelation.findFirst();
      expect(row!.fromTaskId).toBe(tB.id);
      expect(row!.toTaskId).toBe(tA.id);
    });

    it('relations_create with type=related_to → canonicalized', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      const res = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tB.id, type: 'related_to' },
        id: 404,
      }, user);
      expect(res.result.type).toBe('related_to');
      const row = await prisma.taskRelation.findFirst();
      const [lo, hi] = tA.id < tB.id ? [tA, tB] : [tB, tA];
      expect(row!.fromTaskId).toBe(lo.id);
      expect(row!.toTaskId).toBe(hi.id);
    });

    it('relations_delete removes the relation', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      const created = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
        id: 405,
      }, user);
      const res = await service.handleRequest({
        method: 'relations_delete',
        params: { relationId: created.result.relationId },
        id: 406,
      }, user);
      expect(res.result.deleted).toBe(true);
      const row = await prisma.taskRelation.findFirst();
      expect(row).toBeNull();
    });

    it('relations_create cycle rejection via MCP', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.lists[0].id, { title: 'B' });
      await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
        id: 407,
      }, user); // A blocks B
      const res = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tB.id, otherTaskId: tA.id, type: 'blocks', direction: 'source' },
        id: 408,
      }, user); // B blocks A → cycle
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('cycle');
    });

    it('relations_create self-reference rejection via MCP', async () => {
      const tA = await seedTask(prisma, board.lists[0].id, { title: 'A' });
      const res = await service.handleRequest({
        method: 'relations_create',
        params: { taskId: tA.id, otherTaskId: tA.id, type: 'blocks' },
        id: 409,
      }, user);
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('itself');
    });
  });

  // ─── Error handling ───

  describe('error handling', () => {
    it('should return method not found for unknown methods', async () => {
      const res = await service.handleRequest({ method: 'unknown_method', params: {}, id: 99 }, user);
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32601);
    });

    it('should return internal error on invalid params', async () => {
      const res = await service.handleRequest({ method: 'boards_get', params: {}, id: 100 }, user);
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
    });
  });

  // ─── Subscriptions + Inbox (MCP) ──────────────────────────────────────────

  describe('subscriptions + inbox', () => {
    it('task_subscribe → subscribes the authed user', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'task_subscribe',
        params: { taskId: task.id },
        id: 501,
      }, user);
      expect(res.result).toEqual({ subscribed: true });
      const row = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
      });
      expect(row).not.toBeNull();
    });

    it('task_unsubscribe → removes the subscription', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      await prisma.taskSubscription.create({ data: { taskId: task.id, userId: user.id } });
      const res = await service.handleRequest({
        method: 'task_unsubscribe',
        params: { taskId: task.id },
        id: 502,
      }, user);
      expect(res.result).toEqual({ subscribed: false });
      const row = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
      });
      expect(row).toBeNull();
    });

    it('inbox_list → returns the authed user\'s notifications', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const activity = await prisma.activity.create({
        data: { taskId: task.id, actorId: null, actor: 'someone', action: 'commented', detail: '{}' },
      });
      await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'someone commented' },
      });
      const res = await service.handleRequest({ method: 'inbox_list', params: {}, id: 503 }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].summary).toBe('someone commented');
    });

    it('inbox_list filter=unread → only unread', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const activity = await prisma.activity.create({
        data: { taskId: task.id, actorId: null, actor: 'someone', action: 'commented', detail: '{}' },
      });
      await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'one' },
      });
      await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'two', readAt: new Date() },
      });
      const res = await service.handleRequest({ method: 'inbox_list', params: { filter: 'unread' }, id: 504 }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].summary).toBe('one');
    });

    it('notifications_mark_read with id → marks that one read', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const activity = await prisma.activity.create({
        data: { taskId: task.id, actorId: null, actor: 'someone', action: 'commented', detail: '{}' },
      });
      const notif = await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'x' },
      });
      const res = await service.handleRequest({
        method: 'notifications_mark_read',
        params: { id: notif.id },
        id: 505,
      }, user);
      expect(res.result).toEqual({ updated: 1 });
      const refreshed = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(refreshed!.readAt).not.toBeNull();
    });

    it('notifications_mark_read with no id → marks all read', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const activity = await prisma.activity.create({
        data: { taskId: task.id, actorId: null, actor: 'someone', action: 'commented', detail: '{}' },
      });
      await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'a' },
      });
      await prisma.notification.create({
        data: { userId: user.id, taskId: task.id, activityId: activity.id, action: 'commented', summary: 'b' },
      });
      const res = await service.handleRequest({
        method: 'notifications_mark_read',
        params: {},
        id: 506,
      }, user);
      expect(res.result.updated).toBe(2);
      const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
      expect(unread).toBe(0);
    });
  });

  // ─── Without user (fallback to agent) ───

  describe('without authenticated user', () => {
    it('should fall back to agent actor when no user provided', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'No user task' },
        id: 200,
      });
      const activity = await prisma.activity.findFirst({ where: { action: 'created' } });
      expect(activity?.actor).toBe('agent');
      expect(activity?.actorId).toBeNull();
    });

    it('should use null assigneeId when no user provided', async () => {
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'Unassigned task' },
        id: 201,
      });
      expect(res.result.assigneeId).toBeNull();
    });
  });
});