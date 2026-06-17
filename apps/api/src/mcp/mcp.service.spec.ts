import { Test, TestingModule } from '@nestjs/testing';
import { McpService } from './mcp.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { createTestPrisma, seedBoard, seedTask, seedLabel, seedComment } from '../../test/setup';

describe('McpService', () => {
  let service: McpService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
      ],
    }).compile();
    service = module.get<McpService>(McpService);
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

  // ─── Boards ───

  describe('boards_list', () => {
    it('should list all boards', async () => {
      const res = await service.handleRequest({ method: 'boards_list', params: {}, id: 1 });
      expect(res.jsonrpc).toBe('2.0');
      expect(res.result).toBeDefined();
      expect(Array.isArray(res.result)).toBe(true);
      expect(res.result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('boards_get', () => {
    it('should get a board with lists and tasks', async () => {
      await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'boards_get', params: { id: board.id }, id: 2 });
      expect(res.result.id).toBe(board.id);
      expect(res.result.lists).toBeDefined();
      expect(res.result.labels).toBeDefined();
    });
  });

  describe('boards_create', () => {
    it('should create a board with default lists', async () => {
      const res = await service.handleRequest({
        method: 'boards_create',
        params: { name: 'MCP Board', slug: 'mcp-board', description: 'Created via MCP' },
        id: 3,
      });
      expect(res.result.name).toBe('MCP Board');
      expect(res.result.lists).toHaveLength(5);
    });
  });

  describe('boards_delete', () => {
    it('should delete a board', async () => {
      const res = await service.handleRequest({ method: 'boards_delete', params: { id: board.id }, id: 4 });
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Lists ───

  describe('lists_list', () => {
    it('should list lists for a board', async () => {
      const res = await service.handleRequest({ method: 'lists_list', params: { boardId: board.id }, id: 5 });
      expect(res.result).toHaveLength(5);
    });
  });

  describe('lists_create', () => {
    it('should create a list', async () => {
      const res = await service.handleRequest({
        method: 'lists_create',
        params: { boardId: board.id, name: 'MCP List' },
        id: 6,
      });
      expect(res.result.name).toBe('MCP List');
    });
  });

  describe('lists_update', () => {
    it('should update a list', async () => {
      const res = await service.handleRequest({
        method: 'lists_update',
        params: { id: board.lists[0].id, name: 'Updated', color: '#ff0000' },
        id: 7,
      });
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
      });
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Tasks ───

  describe('tasks_list', () => {
    it('should list tasks with filters', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Task 1', assignee: 'alice' });
      await seedTask(prisma, board.lists[0].id, { title: 'Task 2', assignee: 'bob' });

      const all = await service.handleRequest({ method: 'tasks_list', params: { boardId: board.id }, id: 9 });
      expect(all.result).toHaveLength(2);

      const filtered = await service.handleRequest({ method: 'tasks_list', params: { assignee: 'alice' }, id: 10 });
      expect(filtered.result).toHaveLength(1);
      expect(filtered.result[0].assignee).toBe('alice');
    });
  });

  describe('tasks_get', () => {
    it('should get a task with relations', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'tasks_get', params: { id: task.id }, id: 11 });
      expect(res.result.id).toBe(task.id);
      expect(res.result.list).toBeDefined();
    });
  });

  describe('tasks_search', () => {
    it('should search tasks by title and description', async () => {
      await seedTask(prisma, board.lists[0].id, { title: 'Critical bug fix' });
      await seedTask(prisma, board.lists[0].id, { title: 'Add feature' });

      const res = await service.handleRequest({ method: 'tasks_search', params: { query: 'bug' }, id: 12 });
      expect(res.result).toHaveLength(1);
      expect(res.result[0].title).toBe('Critical bug fix');
    });
  });

  describe('tasks_create', () => {
    it('should create a task with labels', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { listId: board.lists[0].id, title: 'MCP task', labelIds: [label.id], assignee: 'agent' },
        id: 13,
      });
      expect(res.result.title).toBe('MCP task');
      expect(res.result.labels).toHaveLength(1);
    });
  });

  describe('tasks_update', () => {
    it('should update a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'tasks_update',
        params: { id: task.id, title: 'Updated', priority: 'urgent' },
        id: 14,
      });
      expect(res.result.title).toBe('Updated');
      expect(res.result.priority).toBe('urgent');
    });

    it('should return error for non-existent task', async () => {
      const res = await service.handleRequest({ method: 'tasks_update', params: { id: 'nonexistent' }, id: 15 });
      expect(res.error).toBeDefined();
    });
  });

  describe('tasks_move', () => {
    it('should move a task to another list', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'tasks_move',
        params: { id: task.id, listId: board.lists[2].id },
        id: 16,
      });
      expect(res.result.listId).toBe(board.lists[2].id);
    });
  });

  describe('tasks_delete', () => {
    it('should archive a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({ method: 'tasks_delete', params: { id: task.id }, id: 17 });
      expect(res.result.archived).toBe(true);
    });
  });

  // ─── Comments ───

  describe('comments_list', () => {
    it('should list comments on a task', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      await seedComment(prisma, task.id);
      const res = await service.handleRequest({ method: 'comments_list', params: { taskId: task.id }, id: 18 });
      expect(res.result).toHaveLength(1);
    });
  });

  describe('comments_create', () => {
    it('should create a comment', async () => {
      const task = await seedTask(prisma, board.lists[0].id);
      const res = await service.handleRequest({
        method: 'comments_create',
        params: { taskId: task.id, author: 'agent', body: 'MCP comment' },
        id: 19,
      });
      expect(res.result.body).toBe('MCP comment');
    });
  });

  // ─── Labels ───

  describe('labels_list', () => {
    it('should list labels on a board', async () => {
      await seedLabel(prisma, board.id);
      const res = await service.handleRequest({ method: 'labels_list', params: { boardId: board.id }, id: 20 });
      expect(res.result).toHaveLength(1);
    });
  });

  describe('labels_create', () => {
    it('should create a label', async () => {
      const res = await service.handleRequest({
        method: 'labels_create',
        params: { boardId: board.id, name: 'MCP-label', color: '#ff0000' },
        id: 21,
      });
      expect(res.result.name).toBe('MCP-label');
    });
  });

  describe('labels_delete', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest({ method: 'labels_delete', params: { id: label.id }, id: 22 });
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
          { taskId: task.id, actor: 'alice', action: 'created', detail: '{"title":"Activity test"}' },
          { taskId: task.id, actor: 'bob', action: 'moved', detail: '{"to":"In Progress"}' },
        ],
      });
      const res = await service.handleRequest({ method: 'activity_list', params: { taskId: task.id }, id: 23 });
      expect(res.result.length).toBeGreaterThan(0);
    });

    it('should list activity for a board', async () => {
      const res = await service.handleRequest({ method: 'activity_list', params: { boardId: board.id }, id: 24 });
      expect(Array.isArray(res.result)).toBe(true);
    });
  });

  // ─── Error handling ───

  describe('error handling', () => {
    it('should return method not found for unknown methods', async () => {
      const res = await service.handleRequest({ method: 'unknown_method', params: {}, id: 99 });
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32601);
    });

    it('should return internal error on invalid params', async () => {
      const res = await service.handleRequest({ method: 'boards_get', params: {}, id: 100 });
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
    });
  });
});
