import { Test, TestingModule } from '@nestjs/testing';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { McpService } from './mcp.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DocumentsService } from '../documents/documents.service';
import { CommentsService } from '../comments/comments.service';
import { MentionsService } from '../mentions/mentions.service';
import { MembersService } from '../members/members.service';
import { LabelsService } from '../labels/labels.service';
import { StatusesService } from '../statuses/statuses.service';
import { ViewsService } from '../views/views.service';
import { ProjectsService } from '../projects/projects.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { LocalDiskDriver } from '../storage/local-disk.driver';
import {
  createTestPrisma,
  seedBoard,
  seedTask,
  seedLabel,
  seedComment,
  seedUser,
  seedRelation,
  seedDocument,
  seedView,
  seedProject,
  seedAttachment,
} from '../../test/setup';

describe('McpService', () => {
  let service: McpService;
  let prisma: PrismaService;
  let events: EventsService;
  let board: any;
  let user: any;
  let storageRoot: string;

  beforeAll(async () => {
    prisma = createTestPrisma() as unknown as PrismaService;
    events = new EventsService();
    storageRoot = mkdtempSync(join(tmpdir(), 'tf-mcp-'));
    const attachments = new AttachmentsService(
      prisma,
      events,
      new MembersService(prisma),
      new LocalDiskDriver(storageRoot),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        RelationsService,
        CommentsService,
        MentionsService,
        MembersService,
        LabelsService,
        StatusesService,
        ViewsService,
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: events },
        { provide: SubscriptionsService, useValue: new SubscriptionsService(prisma) },
        { provide: NotificationsService, useValue: new NotificationsService(prisma, events) },
        { provide: AttachmentsService, useValue: attachments },
        {
          provide: DocumentsService,
          useValue: new DocumentsService(prisma, events, attachments),
        },
      ],
    }).compile();
    service = module.get<McpService>(McpService);
  });

  afterAll(async () => {
    rmSync(storageRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    user = await seedUser(prisma, { role: 'admin' });
    board = await seedBoard(prisma);
    // statuses come back from the include unordered — index-based tests rely on position order
    board.statuses.sort((a: any, b: any) => a.position - b.position);
  });

  afterEach(async () => {
    await prisma.attachment.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.taskSubscription.deleteMany();
    await prisma.taskRelation.deleteMany();
    await prisma.taskLabel.deleteMany();
    await prisma.activity.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.document.deleteMany();
    await prisma.view.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.label.deleteMany();
    await prisma.status.deleteMany();
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

    it('should include members array so clients can detect membership', async () => {
      await prisma.member.create({ data: { boardId: board.id, userId: user.id, role: 'member' } });
      const res = await service.handleRequest({ method: 'boards_list', params: {}, id: 1 }, user);
      const found = (res.result as any[]).find((b: any) => b.id === board.id);
      expect(found).toBeDefined();
      expect(Array.isArray(found.members)).toBe(true);
      expect(found.members).toHaveLength(1);
      expect(found.members[0]).toMatchObject({ userId: user.id, role: 'member' });
    });
  });

  describe('boards_get', () => {
    it('should get a board with statuses and tasks', async () => {
      await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        { method: 'boards_get', params: { id: board.id }, id: 2 },
        user,
      );
      expect(res.result.id).toBe(board.id);
      expect(res.result.statuses).toBeDefined();
      expect(res.result.labels).toBeDefined();
    });
  });

  describe('boards_create', () => {
    it('should create a board with default statuses', async () => {
      const res = await service.handleRequest(
        {
          method: 'boards_create',
          params: {
            name: 'MCP Board',
            slug: 'mcp-board',
            identifier: 'MCP',
            description: 'Created via MCP',
          },
          id: 3,
        },
        user,
      );
      expect(res.result.name).toBe('MCP Board');
      expect(res.result.identifier).toBe('MCP');
      expect(res.result.statuses).toHaveLength(6);
    });
  });

  describe('boards_delete', () => {
    it('should delete a board (legacy board, no admin members)', async () => {
      const res = await service.handleRequest(
        { method: 'boards_delete', params: { id: board.id }, id: 4 },
        user,
      );
      expect(res.result.deleted).toBe(true);
    });

    it('should delete a board when user is admin', async () => {
      const b = await seedBoard(prisma);
      await prisma.member.create({ data: { boardId: b.id, userId: user.id, role: 'admin' } });
      const res = await service.handleRequest(
        { method: 'boards_delete', params: { id: b.id }, id: 4 },
        user,
      );
      expect(res.result.deleted).toBe(true);
    });

    it('should forbid non-admin user from deleting', async () => {
      const b = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      // A plain member: the shared `user` is a global admin (needed for the
      // label/status CRUD tests) and must not be used as the denied actor here.
      const member = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: b.id, userId: admin.id, role: 'admin' } });
      await prisma.member.create({ data: { boardId: b.id, userId: member.id, role: 'member' } });
      const res = await service.handleRequest(
        { method: 'boards_delete', params: { id: b.id }, id: 4 },
        member,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Only board admins can perform this action');
    });

    it('should forbid delete with no user', async () => {
      const b = await seedBoard(prisma);
      const admin = await seedUser(prisma);
      await prisma.member.create({ data: { boardId: b.id, userId: admin.id, role: 'admin' } });
      const res = await service.handleRequest({
        method: 'boards_delete',
        params: { id: b.id },
        id: 4,
      });
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Admin access required');
    });
  });

  // ─── Statuses ───

  describe('statuses_list', () => {
    it('should list statuses for a board', async () => {
      const res = await service.handleRequest(
        { method: 'statuses_list', params: { boardId: board.id }, id: 5 },
        user,
      );
      expect(res.result).toHaveLength(6);
    });
  });

  describe('statuses_create', () => {
    it('should create a status', async () => {
      const res = await service.handleRequest(
        {
          method: 'statuses_create',
          params: { boardId: board.id, name: 'MCP Status', type: 'todo' },
          id: 6,
        },
        user,
      );
      expect(res.result.name).toBe('MCP Status');
      expect(res.result.type).toBe('todo');
    });
  });

  describe('statuses_update', () => {
    it('should update a status', async () => {
      const res = await service.handleRequest(
        {
          method: 'statuses_update',
          params: { id: board.statuses[0].id, name: 'Updated', color: '#ff0000' },
          id: 7,
        },
        user,
      );
      expect(res.result.name).toBe('Updated');
      expect(res.result.color).toBe('#ff0000');
    });
  });

  describe('statuses_delete', () => {
    it('should delete a status', async () => {
      const res = await service.handleRequest(
        {
          method: 'statuses_delete',
          params: { id: board.statuses[0].id },
          id: 8,
        },
        user,
      );
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Tasks ───

  describe('tasks_list', () => {
    it('should list tasks with filters', async () => {
      await seedTask(prisma, board.statuses[0].id, { title: 'Task 1' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Task 2' });

      const all = await service.handleRequest(
        { method: 'tasks_list', params: { boardId: board.id }, id: 9 },
        user,
      );
      expect(all.result).toHaveLength(2);

      const byStatus = await service.handleRequest(
        {
          method: 'tasks_list',
          params: { boardId: board.id, statusId: board.statuses[0].id },
          id: 10,
        },
        user,
      );
      expect(byStatus.result).toHaveLength(2);
    });
  });

  describe('tasks_get', () => {
    it('should get a task with relations', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        { method: 'tasks_get', params: { id: task.id }, id: 11 },
        user,
      );
      expect(res.result.id).toBe(task.id);
      expect(res.result.status).toBeDefined();
    });
  });

  describe('tasks_search', () => {
    it('should search tasks by title and description', async () => {
      await seedTask(prisma, board.statuses[0].id, { title: 'Critical bug fix' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Add feature' });

      const res = await service.handleRequest(
        { method: 'tasks_search', params: { query: 'bug' }, id: 12 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].title).toBe('Critical bug fix');
      expect(res.result[0]).toHaveProperty('taskNumber');
    });

    it('should search tasks by task number format', async () => {
      await seedTask(prisma, board.statuses[0].id, { title: 'Find by number' });
      const res = await service.handleRequest(
        { method: 'tasks_search', params: { query: `${board.identifier}-1` }, id: 128 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].taskNumber).toBe(`${board.identifier}-1`);
    });
  });

  describe('tasks_create', () => {
    it('should create a task with labels', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'MCP task', labelIds: [label.id] },
          id: 13,
        },
        user,
      );
      expect(res.result.title).toBe('MCP task');
      expect(res.result.labels).toHaveLength(1);
      expect(res.result).toHaveProperty('taskNumber');
      expect(res.result).toHaveProperty('boardId');
    });

    it('should default assigneeId to authenticated user when not provided', async () => {
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Auto-assigned task' },
          id: 14,
        },
        user,
      );
      expect(res.result.assigneeId).toBe(user.id);
    });

    it('should use explicit assigneeId when provided', async () => {
      const otherUser = await seedUser(prisma, {
        email: 'other@example.com',
        displayName: 'Other',
      });
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: {
            statusId: board.statuses[0].id,
            title: 'Explicit assignee',
            assigneeId: otherUser.id,
          },
          id: 15,
        },
        user,
      );
      expect(res.result.assigneeId).toBe(otherUser.id);
    });

    it('should record activity with authenticated user as actor', async () => {
      await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Task with actor' },
          id: 16,
        },
        user,
      );
      const activity = await prisma.activity.findFirst({ where: { action: 'created' } });
      expect(activity?.actorId).toBe(user.id);
      expect(activity?.actor).toBe(user.displayName);
    });

    it('should create a task with an estimate', async () => {
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Estimated task', estimate: 3 },
          id: 22,
        },
        user,
      );
      expect(res.result.estimate).toBe(3);
    });
  });

  describe('tasks_update', () => {
    it('should update a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'tasks_update',
          params: { id: task.id, title: 'Updated', priority: 'urgent' },
          id: 17,
        },
        user,
      );
      expect(res.result.title).toBe('Updated');
      expect(res.result.priority).toBe('urgent');
    });

    it('should return error for non-existent task', async () => {
      const res = await service.handleRequest(
        { method: 'tasks_update', params: { id: 'nonexistent' }, id: 18 },
        user,
      );
      expect(res.error).toBeDefined();
    });

    it('should update a task estimate', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { estimate: 2 });
      const res = await service.handleRequest(
        { method: 'tasks_update', params: { id: task.id, estimate: 13 }, id: 23 },
        user,
      );
      expect(res.result.estimate).toBe(13);
    });

    it('should clear a task estimate with null', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { estimate: 8 });
      const res = await service.handleRequest(
        { method: 'tasks_update', params: { id: task.id, estimate: null }, id: 24 },
        user,
      );
      expect(res.result.estimate).toBeNull();
    });

    it('tasks_update with projectId links the task and logs project activity', async () => {
      const project = await seedProject(prisma, { name: 'Roadmap' });
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Linkable' });
      const emitted: Array<{
        event: string;
        data: { id?: string; previousProjectId?: string | null };
      }> = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'task.project.updated') emitted.push(payload);
      });
      const res = await service.handleRequest(
        {
          method: 'tasks_update',
          params: { id: task.id, projectId: project.id },
          id: 25,
        },
        user,
      );
      subscription.unsubscribe();
      expect(res.error).toBeUndefined();
      expect(res.result.projectId).toBe(project.id);
      expect(res.result.project).toMatchObject({ id: project.id, name: 'Roadmap' });
      // TasksService parity: dedicated event scoped to the board, carrying the
      // project the task moved away from (null here).
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.id).toBe(task.id);
      expect(emitted[0].data.previousProjectId).toBeNull();
      const activity = await prisma.activity.findFirst({
        where: { taskId: task.id, action: 'updated' },
        orderBy: { createdAt: 'desc' },
      });
      const detail = JSON.parse(activity!.detail ?? '{}');
      expect(detail.changes).toEqual(['added to project: Roadmap']);
    });

    it('tasks_update with projectId: null clears the link and logs removal', async () => {
      const project = await seedProject(prisma, { name: 'Roadmap' });
      const task = await seedTask(prisma, board.statuses[0].id, {
        title: 'Linked',
        projectId: project.id,
      });
      const emitted: Array<{
        event: string;
        data: { id?: string; previousProjectId?: string | null };
      }> = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'task.project.updated') emitted.push(payload);
      });
      const res = await service.handleRequest(
        { method: 'tasks_update', params: { id: task.id, projectId: null }, id: 26 },
        user,
      );
      subscription.unsubscribe();
      expect(res.error).toBeUndefined();
      expect(res.result.projectId).toBeNull();
      expect(res.result.project).toBeNull();
      // TasksService parity pin: clearing must also fire the dedicated emit,
      // carrying the removed project's id as previousProjectId.
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.id).toBe(task.id);
      expect(emitted[0].data.previousProjectId).toBe(project.id);
      const activity = await prisma.activity.findFirst({
        where: { taskId: task.id, action: 'updated' },
        orderBy: { createdAt: 'desc' },
      });
      const detail = JSON.parse(activity!.detail ?? '{}');
      expect(detail.changes).toEqual(['removed from project']);
    });

    it('tasks_update with any workspace project → accepted (v2 pin: P2 board check removed)', async () => {
      // Projects have no board in v2 — a task on ANY board may link to ANY
      // project. v1 rejected this with 'Project is on a different board'.
      const otherBoard = await seedBoard(prisma);
      const project = await seedProject(prisma, { name: 'Global' });
      const task = await seedTask(prisma, otherBoard.statuses[0].id, { title: 'Local' });
      const res = await service.handleRequest(
        {
          method: 'tasks_update',
          params: { id: task.id, projectId: project.id },
          id: 27,
        },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.projectId).toBe(project.id);
      expect(res.result.project).toMatchObject({ id: project.id, name: 'Global' });
    });

    it('tasks_create with projectId creates the task already linked', async () => {
      const project = await seedProject(prisma, { name: 'Roadmap' });
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Born linked', projectId: project.id },
          id: 28,
        },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.projectId).toBe(project.id);
      expect(res.result.project).toMatchObject({ id: project.id, name: 'Roadmap' });
    });
  });

  describe('tasks_move', () => {
    it('should move a task to another status', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: task.id, statusId: board.statuses[2].id },
          id: 19,
        },
        user,
      );
      expect(res.result.statusId).toBe(board.statuses[2].id);
    });

    it('should stamp doneAt when moving to a Done status', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: task.id, statusId: board.statuses[3].id },
          id: 701,
        },
        user,
      );
      expect(res.result.doneAt).not.toBeNull();
    });

    it('should clear doneAt when moving out of a Done status', async () => {
      const task = await seedTask(prisma, board.statuses[3].id, { doneAt: new Date() });
      const res = await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: task.id, statusId: board.statuses[0].id },
          id: 702,
        },
        user,
      );
      expect(res.result.doneAt).toBeNull();
    });

    it('should not stamp doneAt when moving to a Duplicate status', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: task.id, statusId: board.statuses[5].id },
          id: 703,
        },
        user,
      );
      expect(res.result.doneAt).toBeNull();
    });

    it('should auto-unblock when moving to a Done status', async () => {
      const taskA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const taskB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      await prisma.taskRelation.create({
        data: { type: 'blocks', fromTaskId: taskA.id, toTaskId: taskB.id },
      });
      await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: taskA.id, statusId: board.statuses[3].id },
          id: 704,
        },
        user,
      );
      const relations = await prisma.taskRelation.findMany({
        where: { fromTaskId: taskA.id, type: 'blocks' },
      });
      expect(relations).toHaveLength(0);
    });

    it('should log moved activity with the human status name, not the status id', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await service.handleRequest(
        {
          method: 'tasks_move',
          params: { id: task.id, statusId: board.statuses[2].id },
          id: 705,
        },
        user,
      );
      const movedActivity = await prisma.activity.findFirst({
        where: { taskId: task.id, action: 'moved' },
        orderBy: { createdAt: 'desc' },
      });
      expect(movedActivity).toBeDefined();
      const detail = JSON.parse(movedActivity!.detail ?? '{}');
      expect(detail.statusName).toBe(board.statuses[2].name);
      expect(detail.to).toBe(board.statuses[2].id);
      expect(detail.from).toBe(board.statuses[0].id);
    });
  });

  // Projects v2 §4 — MCP parity with TasksService: cross-board status moves
  // are blocked, and project-linked moves also emit task.project.updated.
  describe('same-board status guard + project kanban emits', () => {
    const captureAll = () => {
      const emitted: Array<{ event: string; data: any; boardId?: string }> = [];
      const subscription = events.observe().subscribe((payload) => emitted.push(payload));
      return { emitted, stop: () => subscription.unsubscribe() };
    };

    it('tasks_move to another board’s status → error, row unchanged, no activity, no events', async () => {
      const otherBoard = await seedBoard(prisma);
      const task = await seedTask(prisma, board.statuses[0].id, { position: 7 });
      const { emitted, stop } = captureAll();
      try {
        const res = await service.handleRequest(
          {
            method: 'tasks_move',
            params: { id: task.id, statusId: otherBoard.statuses[1].id },
            id: 801,
          },
          user,
        );
        expect(res.error?.message).toBe('Status belongs to a different board');
        const stored = await prisma.task.findUnique({ where: { id: task.id } });
        expect(stored!.statusId).toBe(board.statuses[0].id);
        expect(stored!.boardId).toBe(board.id);
        expect(stored!.position).toBe(7);
        expect(await prisma.activity.count({ where: { taskId: task.id } })).toBe(0);
        expect(emitted).toHaveLength(0);
      } finally {
        stop();
      }
    });

    it('tasks_update with another board’s statusId → error before ANY write', async () => {
      const otherBoard = await seedBoard(prisma);
      const label = await seedLabel(prisma, board.id);
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Stay' });
      await prisma.taskLabel.create({ data: { taskId: task.id, labelId: label.id } });
      const { emitted, stop } = captureAll();
      try {
        const res = await service.handleRequest(
          {
            method: 'tasks_update',
            params: {
              id: task.id,
              statusId: otherBoard.statuses[1].id,
              title: 'Moved?',
              labelIds: [],
            },
            id: 802,
          },
          user,
        );
        expect(res.error?.message).toBe('Status belongs to a different board');
        const stored = await prisma.task.findUnique({ where: { id: task.id } });
        expect(stored!.statusId).toBe(board.statuses[0].id);
        expect(stored!.boardId).toBe(board.id);
        expect(stored!.title).toBe('Stay');
        expect(await prisma.taskLabel.count({ where: { taskId: task.id } })).toBe(1);
        expect(await prisma.activity.count({ where: { taskId: task.id } })).toBe(0);
        expect(emitted).toHaveLength(0);
      } finally {
        stop();
      }
    });

    it('tasks_move of a project-linked task also emits task.project.updated', async () => {
      const project = await seedProject(prisma, { name: 'Kanban' });
      const task = await seedTask(prisma, board.statuses[0].id, { projectId: project.id });
      const { emitted, stop } = captureAll();
      try {
        const res = await service.handleRequest(
          {
            method: 'tasks_move',
            params: { id: task.id, statusId: board.statuses[2].id },
            id: 803,
          },
          user,
        );
        expect(res.error).toBeUndefined();
        expect(emitted.filter((e) => e.event === 'task:moved')).toHaveLength(1);
        const projectEvents = emitted.filter((e) => e.event === 'task.project.updated');
        expect(projectEvents).toHaveLength(1);
        expect(projectEvents[0].boardId).toBeUndefined(); // global broadcast (spec §3)
        expect(projectEvents[0].data.id).toBe(task.id);
        expect(projectEvents[0].data.projectId).toBe(project.id);
        expect(projectEvents[0].data.previousProjectId).toBe(project.id);
      } finally {
        stop();
      }
    });

    it('tasks_move of an unlinked task does NOT emit task.project.updated', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const { emitted, stop } = captureAll();
      try {
        await service.handleRequest(
          {
            method: 'tasks_move',
            params: { id: task.id, statusId: board.statuses[2].id },
            id: 804,
          },
          user,
        );
        expect(emitted.filter((e) => e.event === 'task:moved')).toHaveLength(1);
        expect(emitted.filter((e) => e.event === 'task.project.updated')).toHaveLength(0);
      } finally {
        stop();
      }
    });

    it('tasks_update changing the status of a linked task emits task.project.updated', async () => {
      const project = await seedProject(prisma, { name: 'Kanban' });
      const task = await seedTask(prisma, board.statuses[0].id, { projectId: project.id });
      const { emitted, stop } = captureAll();
      try {
        await service.handleRequest(
          {
            method: 'tasks_update',
            params: { id: task.id, statusId: board.statuses[1].id },
            id: 805,
          },
          user,
        );
        const projectEvents = emitted.filter((e) => e.event === 'task.project.updated');
        expect(projectEvents).toHaveLength(1);
        expect(projectEvents[0].data.previousProjectId).toBe(project.id);
      } finally {
        stop();
      }
    });

    it('tasks_update changing projectId AND statusId emits task.project.updated exactly once', async () => {
      const projectA = await seedProject(prisma, { name: 'Alpha' });
      const projectB = await seedProject(prisma, { name: 'Beta' });
      const task = await seedTask(prisma, board.statuses[0].id, { projectId: projectA.id });
      const { emitted, stop } = captureAll();
      try {
        await service.handleRequest(
          {
            method: 'tasks_update',
            params: { id: task.id, projectId: projectB.id, statusId: board.statuses[2].id },
            id: 806,
          },
          user,
        );
        const projectEvents = emitted.filter((e) => e.event === 'task.project.updated');
        expect(projectEvents).toHaveLength(1);
        expect(projectEvents[0].data.projectId).toBe(projectB.id);
        expect(projectEvents[0].data.previousProjectId).toBe(projectA.id);
      } finally {
        stop();
      }
    });
  });

  describe('tasks_delete', () => {
    it('should hard-delete a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        { method: 'tasks_delete', params: { id: task.id }, id: 20 },
        user,
      );
      expect(res.result.deleted).toBe(true);
      const gone = await prisma.task.findUnique({ where: { id: task.id } });
      expect(gone).toBeNull();
    });

    it('emits task:deleted with boardId in the payload (parity with REST remove)', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const emitted: Array<{ event: string; data: { id?: string; boardId?: string } }> = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'task:deleted') emitted.push(payload);
      });
      await service.handleRequest(
        { method: 'tasks_delete', params: { id: task.id }, id: 21 },
        user,
      );
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.id).toBe(task.id);
      expect(emitted[0].data.boardId).toBe(board.id);
      subscription.unsubscribe();
    });
  });

  // ─── Sub-tasks (MCP parity) ────────────────────────────────────────────────

  describe('sub-tasks', () => {
    it('tasks_create with parentId returns task with parentId set', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Child', parentId: parent.id },
          id: 301,
        },
        user,
      );
      expect(res.result.parentId).toBe(parent.id);
    });

    it('tasks_create with parentId from different board → succeeds (cross-board sub-tasks allowed)', async () => {
      const otherBoard = await seedBoard(prisma);
      const foreignParent = await seedTask(prisma, otherBoard.statuses[0].id, { title: 'Foreign' });
      const res = await service.handleRequest(
        {
          method: 'tasks_create',
          params: { statusId: board.statuses[0].id, title: 'Child', parentId: foreignParent.id },
          id: 302,
        },
        user,
      );
      expect(res.result).toBeDefined();
      expect(res.result.parentId).toBe(foreignParent.id);
    });

    it('tasks_update with parentId change emits previousParentId (parity with REST update)', async () => {
      const parentA = await seedTask(prisma, board.statuses[0].id, { title: 'ParentA' });
      const parentB = await seedTask(prisma, board.statuses[0].id, { title: 'ParentB' });
      const child = await seedTask(prisma, board.statuses[0].id, {
        title: 'Child',
        parentId: parentA.id,
      });
      const emitted: Array<{
        event: string;
        data: { id?: string; parentId?: string; previousParentId?: string };
      }> = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'task:updated') emitted.push(payload);
      });
      await service.handleRequest(
        {
          method: 'tasks_update',
          params: { id: child.id, parentId: parentB.id },
          id: 304,
        },
        user,
      );
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.id).toBe(child.id);
      expect(emitted[0].data.parentId).toBe(parentB.id);
      expect(emitted[0].data.previousParentId).toBe(parentA.id);
      subscription.unsubscribe();
    });

    it('tasks_update without parent change omits previousParentId from the emit', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Plain' });
      const emitted: Array<{ event: string; data: { previousParentId?: string } }> = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'task:updated') emitted.push(payload);
      });
      await service.handleRequest(
        { method: 'tasks_update', params: { id: task.id, title: 'Renamed' }, id: 305 },
        user,
      );
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.previousParentId).toBeUndefined();
      subscription.unsubscribe();
    });

    it('tasks_list with include="top" excludes sub-tasks', async () => {
      const parent = await seedTask(prisma, board.statuses[0].id, { title: 'Parent' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Child', parentId: parent.id });
      const res = await service.handleRequest(
        {
          method: 'tasks_list',
          params: { boardId: board.id, include: 'top' },
          id: 303,
        },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].id).toBe(parent.id);
    });
  });

  // ─── Comments ───

  describe('comments_list', () => {
    it('should list comments on a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await seedComment(prisma, task.id);
      const res = await service.handleRequest(
        { method: 'comments_list', params: { taskId: task.id }, id: 21 },
        user,
      );
      expect(res.result).toHaveLength(1);
    });

    it('should return reactions grouped by emoji', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const comment = await seedComment(prisma, task.id);
      const other = await seedUser(prisma, { displayName: 'Other' });
      await prisma.commentReaction.createMany({
        data: [
          { commentId: comment.id, userId: user.id, emoji: '👍' },
          { commentId: comment.id, userId: other.id, emoji: '👍' },
        ],
      });

      const res = await service.handleRequest(
        { method: 'comments_list', params: { taskId: task.id }, id: 211 },
        user,
      );

      expect(res.result[0].reactions).toEqual([{ emoji: '👍', userIds: [user.id, other.id] }]);
    });

    it('returns comments as a nested tree', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const parent = await seedComment(prisma, task.id);
      const child = await seedComment(prisma, task.id, { parentId: parent.id });
      const res = await service.handleRequest(
        { method: 'comments_list', params: { taskId: task.id }, id: 251 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].replies).toHaveLength(1);
      expect(res.result[0].replies[0].id).toBe(child.id);
    });
  });

  describe('comments_create', () => {
    it('should create a comment with authenticated user as author', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'comments_create',
          params: { taskId: task.id, body: 'MCP comment' },
          id: 22,
        },
        user,
      );
      expect(res.result.body).toBe('MCP comment');
      expect(res.result.authorId).toBe(user.id);
      expect(res.result.author).toBe(user.displayName);
    });

    it('creates a reply when parentId targets a same-task comment', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const parent = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'parent' }, id: 240 },
        user,
      );
      const reply = await service.handleRequest(
        {
          method: 'comments_create',
          params: { taskId: task.id, body: 'reply', parentId: parent.result.id },
          id: 241,
        },
        user,
      );
      expect(reply.result.parentId).toBe(parent.result.id);

      const otherTask = await seedTask(prisma, board.statuses[0].id);
      // handleRequest catches handler errors and returns them as JSON-RPC error objects,
      // so the cross-task rejection surfaces as res.error, not a thrown exception.
      const rejected = await service.handleRequest(
        {
          method: 'comments_create',
          params: { taskId: otherTask.id, body: 'cross-task', parentId: parent.result.id },
          id: 242,
        },
        user,
      );
      expect(rejected.error).toBeDefined();
      expect(rejected.error.message).toBe('Invalid parent comment');
    });
  });

  describe('comments_update', () => {
    it('edits a comment as the author', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'orig' }, id: 30 },
        user,
      );
      const res = await service.handleRequest(
        {
          method: 'comments_update',
          params: { id: created.result.id, body: 'edited via MCP' },
          id: 31,
        },
        user,
      );
      expect(res.result.body).toBe('edited via MCP');
      expect(res.result.editedAt).not.toBeNull();
    });

    it('returns and emits grouped reactions', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'orig' }, id: 30 },
        user,
      );
      const other = await seedUser(prisma, { displayName: 'Other' });
      await prisma.commentReaction.createMany({
        data: [
          { commentId: created.result.id, userId: user.id, emoji: '👍' },
          { commentId: created.result.id, userId: other.id, emoji: '👍' },
        ],
      });
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'comment:updated') emitted.push(payload);
      });

      const res = await service.handleRequest(
        {
          method: 'comments_update',
          params: { id: created.result.id, body: 'edited via MCP' },
          id: 31,
        },
        user,
      );

      subscription.unsubscribe();
      expect(res.result.reactions).toEqual([{ emoji: '👍', userIds: [user.id, other.id] }]);
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data.reactions).toEqual([{ emoji: '👍', userIds: [user.id, other.id] }]);
    });

    it('forbids editing another user comment (non-admin)', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'mine' }, id: 30 },
        user,
      );
      const other = await seedUser(prisma, { displayName: 'Other' });
      const otherAuth = { id: other.id, displayName: other.displayName, role: other.role };
      const res = await service.handleRequest(
        {
          method: 'comments_update',
          params: { id: created.result.id, body: 'hacked' },
          id: 31,
        },
        otherAuth,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('only edit');
    });

    it('rejects an anonymous edit when no user is provided', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const comment = await seedComment(prisma, task.id, { authorId: null });

      const res = await service.handleRequest({
        method: 'comments_update',
        params: { id: comment.id, body: 'anonymous edit' },
        id: 32,
      });

      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('only edit');
    });
  });

  describe('comments_delete', () => {
    it('includes the task id in the deleted event payload', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'delete me' }, id: 33 },
        user,
      );
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'comment:deleted') emitted.push(payload);
      });

      await service.handleRequest(
        { method: 'comments_delete', params: { id: created.result.id }, id: 34 },
        user,
      );

      subscription.unsubscribe();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data).toEqual({ id: created.result.id, taskId: task.id });
    });

    it('tombstones a comment with replies instead of deleting it', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const parent = await seedComment(prisma, task.id, { authorId: user.id });
      await seedComment(prisma, task.id, { parentId: parent.id });

      const res = await service.handleRequest(
        { method: 'comments_delete', params: { id: parent.id }, id: 250 },
        user,
      );

      expect(res.result.success).toBe(true);
      const stored = await prisma.comment.findUnique({ where: { id: parent.id } });
      expect(stored).not.toBeNull();
      expect(stored!.deletedAt).not.toBeNull();
      expect(stored!.body).toBe('');
    });
  });

  describe('comments_react', () => {
    it('toggles a reaction on', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'c' }, id: 30 },
        user,
      );
      const res = await service.handleRequest(
        {
          method: 'comments_react',
          params: { commentId: created.result.id, emoji: '👍' },
          id: 31,
        },
        user,
      );
      expect(res.result.emoji).toBe('👍');
      expect(res.result.userIds).toContain(user.id);
    });

    it('toggles a reaction off when called twice', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'c' }, id: 30 },
        user,
      );
      await service.handleRequest(
        { method: 'comments_react', params: { commentId: created.result.id, emoji: '👍' }, id: 31 },
        user,
      );
      const res = await service.handleRequest(
        { method: 'comments_react', params: { commentId: created.result.id, emoji: '👍' }, id: 32 },
        user,
      );
      expect(res.result.userIds).toEqual([]);
    });

    it('rejects an unknown emoji', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const created = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'c' }, id: 30 },
        user,
      );
      const res = await service.handleRequest(
        {
          method: 'comments_react',
          params: { commentId: created.result.id, emoji: '🦄' },
          id: 31,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Invalid reaction emoji');
    });
  });

  describe('mentions', () => {
    it('comments_create should subscribe + notify mentioned users', async () => {
      const mentioned = await seedUser(prisma, { displayName: 'Bob' });
      const task = await seedTask(prisma, board.statuses[0].id);

      const res = await service.handleRequest(
        { method: 'comments_create', params: { taskId: task.id, body: 'hey @Bob' }, id: 1 },
        user,
      );

      expect(res.error).toBeUndefined();
      const sub = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: mentioned.id } },
      });
      expect(sub).not.toBeNull();
      expect(
        await prisma.notification.count({ where: { userId: mentioned.id, action: 'mentioned' } }),
      ).toBe(1);
    });

    it('tasks_update should subscribe + notify on description change', async () => {
      const mentioned = await seedUser(prisma, { displayName: 'Bob' });
      const task = await seedTask(prisma, board.statuses[0].id);

      const res = await service.handleRequest(
        { method: 'tasks_update', params: { id: task.id, description: 'cc @Bob' }, id: 2 },
        user,
      );

      expect(res.error).toBeUndefined();
      const sub = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: mentioned.id } },
      });
      expect(sub).not.toBeNull();
      expect(
        await prisma.notification.count({ where: { userId: mentioned.id, action: 'mentioned' } }),
      ).toBe(1);
    });
  });

  // ─── Labels ───

  describe('labels_list', () => {
    it('should list labels on a board', async () => {
      await seedLabel(prisma, board.id);
      const res = await service.handleRequest(
        { method: 'labels_list', params: { boardId: board.id }, id: 23 },
        user,
      );
      expect(res.result).toHaveLength(1);
    });
  });

  describe('labels_create', () => {
    it('should create a label', async () => {
      const res = await service.handleRequest(
        {
          method: 'labels_create',
          params: { boardId: board.id, name: 'MCP-label', color: '#ff0000' },
          id: 24,
        },
        user,
      );
      expect(res.result.name).toBe('MCP-label');
    });
  });

  describe('labels_delete', () => {
    it('should delete a label', async () => {
      const label = await seedLabel(prisma, board.id);
      const res = await service.handleRequest(
        { method: 'labels_delete', params: { id: label.id }, id: 25 },
        user,
      );
      expect(res.result.deleted).toBe(true);
    });
  });

  // ─── Views ───

  describe('views_list', () => {
    it('should list shared views plus the caller personal views', async () => {
      const other = await seedUser(prisma, { displayName: 'Other' });
      await seedView(prisma, board.id, { userId: user.id, name: 'Mine' });
      await seedView(prisma, board.id, { userId: other.id, name: 'Shared', isShared: true });
      // Personal view of another user — must not appear
      await seedView(prisma, board.id, { userId: other.id, name: 'Hidden' });

      const res = await service.handleRequest(
        { method: 'views_list', params: { boardId: board.id }, id: 601 },
        user,
      );
      expect(res.result).toHaveLength(2);
      expect(res.result.map((v: any) => v.name).sort()).toEqual(['Mine', 'Shared']);
    });
  });

  describe('views_create', () => {
    it('should create a shared view when the caller is a board member', async () => {
      await prisma.member.create({ data: { boardId: board.id, userId: user.id, role: 'member' } });
      const res = await service.handleRequest(
        {
          method: 'views_create',
          params: {
            boardId: board.id,
            name: 'Urgent work',
            filters: { priorities: ['urgent'] },
            groupBy: 'priority',
            sortBy: 'priority',
            layout: 'list',
            shared: true,
            position: 2,
          },
          id: 602,
        },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('Urgent work');
      expect(res.result.isShared).toBe(true);
      expect(res.result.groupBy).toBe('priority');
      expect(res.result.layout).toBe('list');
      expect(res.result.position).toBe(2);
      expect(JSON.parse(res.result.filters)).toEqual({ priorities: ['urgent'] });
    });

    it('should default shared=false and defaults for omitted fields', async () => {
      const res = await service.handleRequest(
        {
          method: 'views_create',
          params: { boardId: board.id, name: 'Personal' },
          id: 603,
        },
        user,
      );
      expect(res.result.isShared).toBe(false);
      expect(res.result.groupBy).toBe('status');
      expect(res.result.sortBy).toBe('position');
      expect(res.result.layout).toBe('board');
      expect(JSON.parse(res.result.filters)).toEqual({});
    });

    it('should reject shared=true for a non-member', async () => {
      // The shared `user` is a global admin who passes the membership gate;
      // use a plain non-member instead. The board needs at least one Member
      // row, otherwise it counts as a legacy board where sharing is allowed
      // for all users.
      await prisma.member.create({ data: { boardId: board.id, userId: user.id, role: 'member' } });
      const outsider = await seedUser(prisma, { displayName: 'Outsider' });
      const res = await service.handleRequest(
        {
          method: 'views_create',
          params: { boardId: board.id, name: 'Sneaky', shared: true },
          id: 604,
        },
        { id: outsider.id, displayName: outsider.displayName, role: outsider.role },
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Board membership required');
    });
  });

  describe('views_update', () => {
    it('should update a view as the creator', async () => {
      const view = await seedView(prisma, board.id, { userId: user.id, name: 'Old' });
      const res = await service.handleRequest(
        {
          method: 'views_update',
          params: { id: view.id, name: 'New', filters: { priorities: ['high'] } },
          id: 605,
        },
        user,
      );
      expect(res.result.name).toBe('New');
      expect(JSON.parse(res.result.filters)).toEqual({ priorities: ['high'] });
    });

    it('should reject the update from a non-creator', async () => {
      // Personal views are creator-only — no admin override.
      const view = await seedView(prisma, board.id, { userId: user.id, name: 'Mine' });
      const res = await service.handleRequest(
        { method: 'views_update', params: { id: view.id, name: 'Hacked' }, id: 606 },
        { id: 'nobody', displayName: 'Nobody', role: 'member' },
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Only the creator');
    });
  });

  describe('views_delete', () => {
    it('should delete a view as the creator', async () => {
      const view = await seedView(prisma, board.id, { userId: user.id, name: 'Gone' });
      const res = await service.handleRequest(
        { method: 'views_delete', params: { id: view.id }, id: 607 },
        user,
      );
      expect(await prisma.view.findUnique({ where: { id: view.id } })).toBeNull();
      expect(res.result).toBeUndefined();
    });
  });

  // ─── Projects ───

  describe('projects_list', () => {
    it('lists ALL workspace projects in position order (v2: no boardId param)', async () => {
      await seedProject(prisma, { name: 'Roadmap', position: 1 });
      await seedProject(prisma, { name: 'Infra', position: 0 });
      await seedProject(prisma, { name: 'Elsewhere', position: 5 });

      const res = await service.handleRequest(
        { method: 'projects_list', params: {}, id: 610 },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.map((p: any) => p.name)).toEqual(['Infra', 'Roadmap', 'Elsewhere']);
    });

    it('ignores a legacy boardId param (workspace-wide listing regardless)', async () => {
      await seedProject(prisma, { name: 'Roadmap', position: 1 });
      const res = await service.handleRequest(
        { method: 'projects_list', params: { boardId: 'whatever' }, id: 611 },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.map((p: any) => p.name)).toEqual(['Roadmap']);
    });
  });

  describe('projects_get', () => {
    it('should return a project with tasks and progress', async () => {
      const project = await seedProject(prisma, { name: 'Roadmap' });
      await seedTask(prisma, board.statuses[0].id, { title: 'Linked', projectId: project.id });
      const res = await service.handleRequest(
        { method: 'projects_get', params: { id: project.id }, id: 612 },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('Roadmap');
      expect(res.result.tasks).toHaveLength(1);
      expect(res.result.tasks[0].projectId).toBe(project.id);
      expect(res.result.progress).toEqual({ total: 1, completed: 0, byStatus: { backlog: 1 } });
    });

    it('should error for a non-existent project', async () => {
      const res = await service.handleRequest(
        { method: 'projects_get', params: { id: 'nonexistent' }, id: 613 },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Project not found');
    });
  });

  describe('projects_create', () => {
    it('should create a workspace project (no boardId) and emit project:created globally', async () => {
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'project:created') emitted.push(payload);
      });
      const res = await service.handleRequest(
        {
          method: 'projects_create',
          params: {
            name: 'MCP Project',
            description: 'via MCP',
            icon: '🚀',
            status: 'started',
            startDate: '2026-10-01',
            targetDate: '2026-12-31',
          },
          id: 614,
        },
        user,
      );
      subscription.unsubscribe();
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('MCP Project');
      expect(res.result.icon).toBe('🚀');
      expect(res.result.status).toBe('started');
      expect('boardId' in res.result).toBe(false);
      expect(emitted).toHaveLength(1);
      // Global broadcast — no board room scope on v2 project events.
      expect(emitted[0].boardId).toBeUndefined();
      expect(emitted[0].data.name).toBe('MCP Project');
    });

    it('should default icon to 📦 and status to planned', async () => {
      const res = await service.handleRequest(
        { method: 'projects_create', params: { name: 'Defaults' }, id: 615 },
        user,
      );
      expect(res.result.icon).toBe('📦');
      expect(res.result.status).toBe('planned');
    });

    it('allows creation by a plain member of a board (v2: all-members)', async () => {
      const b = await seedBoard(prisma);
      const member = await seedUser(prisma, { displayName: 'Member' });
      await prisma.member.create({ data: { boardId: b.id, userId: member.id, role: 'member' } });
      const res = await service.handleRequest(
        { method: 'projects_create', params: { name: 'Anyone can' }, id: 616 },
        { id: member.id, displayName: member.displayName, role: member.role },
      );
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('Anyone can');
    });
  });

  describe('projects_update', () => {
    it('should update a project as any member and emit project:updated globally', async () => {
      const project = await seedProject(prisma, { name: 'Before' });
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'project:updated') emitted.push(payload);
      });
      const res = await service.handleRequest(
        {
          method: 'projects_update',
          params: { id: project.id, name: 'After', status: 'completed' },
          id: 617,
        },
        user,
      );
      subscription.unsubscribe();
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('After');
      expect(res.result.status).toBe('completed');
      expect(res.result.completedAt).not.toBeNull();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].boardId).toBeUndefined();
    });

    it('should clear completedAt when leaving completed', async () => {
      const project = await seedProject(prisma, {
        name: 'Done once',
        status: 'completed',
        completedAt: new Date(),
      });
      const res = await service.handleRequest(
        { method: 'projects_update', params: { id: project.id, status: 'started' }, id: 618 },
        user,
      );
      expect(res.result.completedAt).toBeNull();
    });

    it('allows update by a plain member (v2: all-members, no admin gate)', async () => {
      const member = await seedUser(prisma, { displayName: 'Member' });
      const project = await seedProject(prisma, { name: 'Editable' });
      const res = await service.handleRequest(
        { method: 'projects_update', params: { id: project.id, name: 'Renamed' }, id: 619 },
        { id: member.id, displayName: member.displayName, role: member.role },
      );
      expect(res.error).toBeUndefined();
      expect(res.result.name).toBe('Renamed');
    });
  });

  describe('projects_delete', () => {
    it('should delete a project and unlink its tasks (SetNull)', async () => {
      const project = await seedProject(prisma, { name: 'Doomed' });
      const task = await seedTask(prisma, board.statuses[0].id, {
        title: 'Survivor',
        projectId: project.id,
      });
      const emitted: any[] = [];
      const subscription = events.observe().subscribe((payload) => {
        if (payload.event === 'project:deleted') emitted.push(payload);
      });
      const res = await service.handleRequest(
        { method: 'projects_delete', params: { id: project.id }, id: 620 },
        user,
      );
      subscription.unsubscribe();
      expect(res.error).toBeUndefined();
      expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
      const survivor = await prisma.task.findUnique({ where: { id: task.id } });
      expect(survivor).not.toBeNull();
      expect(survivor!.projectId).toBeNull();
      expect(emitted).toHaveLength(1);
      expect(emitted[0].data).toEqual({ id: project.id });
      expect(emitted[0].boardId).toBeUndefined();
    });

    it('should error for a non-existent project', async () => {
      const res = await service.handleRequest(
        { method: 'projects_delete', params: { id: 'nonexistent' }, id: 621 },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Project not found');
    });
  });

  it('projects dispatch with unknown action → error result', async () => {
    const res = await service.handleRequest(
      { method: 'projects_frobnicate', params: {}, id: 622 },
      user,
    );
    expect(res.error).toBeDefined();
    expect(res.error.message).toContain('Unknown projects action');
  });

  it('projects_get without user → JSON-RPC error', async () => {
    const res = await service.handleRequest({ method: 'projects_get', params: {}, id: 623 });
    expect(res.error).toBeDefined();
    expect(res.error.message).toContain('Authentication required');
  });

  // ─── Activity ───

  describe('activity_list', () => {
    it('should list activity for a task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id, { title: 'Activity test' });
      // Seed some activity for this task
      await prisma.activity.createMany({
        data: [
          {
            taskId: task.id,
            actorId: null,
            actor: 'alice',
            action: 'created',
            detail: '{"title":"Activity test"}',
          },
          {
            taskId: task.id,
            actorId: null,
            actor: 'bob',
            action: 'moved',
            detail: '{"to":"In Progress"}',
          },
        ],
      });
      const res = await service.handleRequest(
        { method: 'activity_list', params: { taskId: task.id }, id: 26 },
        user,
      );
      expect(res.result.length).toBeGreaterThan(0);
    });

    it('should list activity for a board', async () => {
      const res = await service.handleRequest(
        { method: 'activity_list', params: { boardId: board.id }, id: 27 },
        user,
      );
      expect(Array.isArray(res.result)).toBe(true);
    });
  });

  // ─── Relations (MCP parity) ───────────────────────────────────────────────

  describe('relations', () => {
    it('relations_list returns grouped relations', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      await seedRelation(prisma, tA.id, tB.id, 'blocks'); // A blocks B

      const res = await service.handleRequest(
        {
          method: 'relations_list',
          params: { taskId: tA.id },
          id: 401,
        },
        user,
      );
      expect(res.result.taskId).toBe(tA.id);
      expect(res.result.blocking).toHaveLength(1);
      expect(res.result.blocking[0].task.id).toBe(tB.id);
      expect(res.result.blockedBy).toEqual([]);
      expect(res.result.relatedTo).toEqual([]);
    });

    it('relations_create with direction=source → URL task blocks other', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
          id: 402,
        },
        user,
      );
      expect(res.result.type).toBe('blocks');
      expect(res.result.task.id).toBe(tB.id);
      const row = await prisma.taskRelation.findFirst();
      expect(row!.fromTaskId).toBe(tA.id);
      expect(row!.toTaskId).toBe(tB.id);
    });

    it('relations_create with direction=target → URL task blocked by other', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'target' },
          id: 403,
        },
        user,
      );
      expect(res.result.type).toBe('blocks');
      const row = await prisma.taskRelation.findFirst();
      expect(row!.fromTaskId).toBe(tB.id);
      expect(row!.toTaskId).toBe(tA.id);
    });

    it('relations_create with type=related_to → canonicalized', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'related_to' },
          id: 404,
        },
        user,
      );
      expect(res.result.type).toBe('related_to');
      const row = await prisma.taskRelation.findFirst();
      const [lo, hi] = tA.id < tB.id ? [tA, tB] : [tB, tA];
      expect(row!.fromTaskId).toBe(lo.id);
      expect(row!.toTaskId).toBe(hi.id);
    });

    it('relations_create with type=duplicate_of → URL task moved to Duplicate status; activity attributed to user; doneAt NOT stamped', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'duplicate_of', direction: 'source' },
          id: 410,
        },
        user,
      );
      expect(res.result.type).toBe('duplicate_of');
      const row = await prisma.taskRelation.findFirst();
      expect(row!.fromTaskId).toBe(tA.id);
      expect(row!.toTaskId).toBe(tB.id);

      const dupStatus = board.statuses.find((s: any) => s.type === 'duplicate')!;
      const moved = await prisma.task.findUnique({ where: { id: tA.id } });
      expect(moved!.statusId).toBe(dupStatus.id);
      expect(moved!.doneAt).toBeNull();

      const activity = await prisma.activity.findFirst({ where: { taskId: tA.id } });
      expect(activity!.action).toBe('marked_duplicate');
      expect(activity!.actor).toBe(user.displayName);
    });

    it('relations_delete removes the relation', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      const created = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
          id: 405,
        },
        user,
      );
      const res = await service.handleRequest(
        {
          method: 'relations_delete',
          params: { relationId: created.result.relationId },
          id: 406,
        },
        user,
      );
      expect(res.result.deleted).toBe(true);
      const row = await prisma.taskRelation.findFirst();
      expect(row).toBeNull();
    });

    it('relations_create cycle rejection via MCP', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const tB = await seedTask(prisma, board.statuses[0].id, { title: 'B' });
      await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tB.id, type: 'blocks', direction: 'source' },
          id: 407,
        },
        user,
      ); // A blocks B
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tB.id, otherTaskId: tA.id, type: 'blocks', direction: 'source' },
          id: 408,
        },
        user,
      ); // B blocks A → cycle
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('cycle');
    });

    it('relations_create self-reference rejection via MCP', async () => {
      const tA = await seedTask(prisma, board.statuses[0].id, { title: 'A' });
      const res = await service.handleRequest(
        {
          method: 'relations_create',
          params: { taskId: tA.id, otherTaskId: tA.id, type: 'blocks' },
          id: 409,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('itself');
    });
  });

  // ─── Error handling ───

  describe('error handling', () => {
    it('should return method not found for unknown methods', async () => {
      const res = await service.handleRequest(
        { method: 'unknown_method', params: {}, id: 99 },
        user,
      );
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
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'task_subscribe',
          params: { taskId: task.id },
          id: 501,
        },
        user,
      );
      expect(res.result).toEqual({ subscribed: true });
      const row = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
      });
      expect(row).not.toBeNull();
    });

    it('task_unsubscribe → removes the subscription', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await prisma.taskSubscription.create({ data: { taskId: task.id, userId: user.id } });
      const res = await service.handleRequest(
        {
          method: 'task_unsubscribe',
          params: { taskId: task.id },
          id: 502,
        },
        user,
      );
      expect(res.result).toEqual({ subscribed: false });
      const row = await prisma.taskSubscription.findUnique({
        where: { taskId_userId: { taskId: task.id, userId: user.id } },
      });
      expect(row).toBeNull();
    });

    it("inbox_list → returns the authed user's notifications", async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const activity = await prisma.activity.create({
        data: {
          taskId: task.id,
          actorId: null,
          actor: 'someone',
          action: 'commented',
          detail: '{}',
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'someone commented',
        },
      });
      const res = await service.handleRequest({ method: 'inbox_list', params: {}, id: 503 }, user);
      expect(res.result).toHaveLength(1);
      expect(res.result[0].summary).toBe('someone commented');
    });

    it('inbox_list filter=unread → only unread', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const activity = await prisma.activity.create({
        data: {
          taskId: task.id,
          actorId: null,
          actor: 'someone',
          action: 'commented',
          detail: '{}',
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'one',
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'two',
          readAt: new Date(),
        },
      });
      const res = await service.handleRequest(
        { method: 'inbox_list', params: { filter: 'unread' }, id: 504 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].summary).toBe('one');
    });

    it('notifications_mark_read with id → marks that one read', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const activity = await prisma.activity.create({
        data: {
          taskId: task.id,
          actorId: null,
          actor: 'someone',
          action: 'commented',
          detail: '{}',
        },
      });
      const notif = await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'x',
        },
      });
      const res = await service.handleRequest(
        {
          method: 'notifications_mark_read',
          params: { id: notif.id },
          id: 505,
        },
        user,
      );
      expect(res.result).toEqual({ updated: 1 });
      const refreshed = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(refreshed!.readAt).not.toBeNull();
    });

    it('notifications_mark_read with no id → marks all read', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const activity = await prisma.activity.create({
        data: {
          taskId: task.id,
          actorId: null,
          actor: 'someone',
          action: 'commented',
          detail: '{}',
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'a',
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          taskId: task.id,
          activityId: activity.id,
          action: 'commented',
          summary: 'b',
        },
      });
      const res = await service.handleRequest(
        {
          method: 'notifications_mark_read',
          params: {},
          id: 506,
        },
        user,
      );
      expect(res.result.updated).toBe(2);
      const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
      expect(unread).toBe(0);
    });

    it('task_subscribe without user → JSON-RPC error', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest({
        method: 'task_subscribe',
        params: { taskId: task.id },
        id: 507,
      });
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('Authentication required');
    });

    it('inbox_list without user → JSON-RPC error', async () => {
      const res = await service.handleRequest({ method: 'inbox_list', params: {}, id: 508 });
      expect(res.error).toBeDefined();
      expect(res.error.code).toBe(-32603);
      expect(res.error.message).toContain('Authentication required');
    });
  });

  // ─── Without user (fallback to agent) ───

  describe('without authenticated user', () => {
    it('should fall back to agent actor when no user provided', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await service.handleRequest({
        method: 'tasks_create',
        params: { statusId: board.statuses[0].id, title: 'No user task' },
        id: 200,
      });
      const activity = await prisma.activity.findFirst({ where: { action: 'created' } });
      expect(activity?.actor).toBe('agent');
      expect(activity?.actorId).toBeNull();
    });

    it('should use null assigneeId when no user provided', async () => {
      const res = await service.handleRequest({
        method: 'tasks_create',
        params: { statusId: board.statuses[0].id, title: 'Unassigned task' },
        id: 201,
      });
      expect(res.result.assigneeId).toBeNull();
    });
  });

  // ─── Documents ───

  describe('documents_create', () => {
    it('creates a document with a board-level doc number', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'documents_create',
          params: { taskId: task.id, title: 'Spec doc', body: 'body' },
          id: 900,
        },
        user,
      );
      expect(res.result.title).toBe('Spec doc');
      expect(res.result).toHaveProperty('docNumber');
      expect(res.result.boardId).toBe(board.id);
    });
  });

  describe('documents_list', () => {
    it('lists by board without body', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await seedDocument(prisma, task.id, { title: 'A', body: 'secret' });
      const res = await service.handleRequest(
        { method: 'documents_list', params: { boardId: board.id }, id: 901 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].title).toBe('A');
      expect(res.result[0]).not.toHaveProperty('body');
    });

    it('lists by task', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      await seedDocument(prisma, task.id, { title: 'A' });
      const res = await service.handleRequest(
        { method: 'documents_list', params: { taskId: task.id }, id: 902 },
        user,
      );
      expect(res.result).toHaveLength(1);
    });
  });

  describe('documents_get', () => {
    it('returns the full body', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const doc = await seedDocument(prisma, task.id, { title: 'A', body: '**full**' });
      const res = await service.handleRequest(
        { method: 'documents_get', params: { id: doc.id }, id: 903 },
        user,
      );
      expect(res.result.body).toBe('**full**');
      expect(res.result).toHaveProperty('taskNumber');
    });
  });

  describe('documents_update', () => {
    it('updates a document', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const doc = await seedDocument(prisma, task.id, { title: 'Old' });
      const res = await service.handleRequest(
        {
          method: 'documents_update',
          params: { id: doc.id, title: 'New' },
          id: 904,
        },
        user,
      );
      expect(res.result.title).toBe('New');
    });
  });

  describe('documents_delete', () => {
    it('deletes a document', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const doc = await seedDocument(prisma, task.id);
      const res = await service.handleRequest(
        { method: 'documents_delete', params: { id: doc.id }, id: 905 },
        user,
      );
      expect(res.result.deleted).toBe(true);
    });
  });

  describe('project documents', () => {
    it('documents_create with projectId numbers from the project counter', async () => {
      const project = await seedProject(prisma, { name: 'Roadmap' });
      const res = await service.handleRequest(
        {
          method: 'documents_create',
          params: { projectId: project.id, title: 'Plan', body: 'b' },
          id: 910,
        },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.projectId).toBe(project.id);
      expect(res.result.boardId).toBeNull();
      expect(res.result.taskId).toBeNull();
      expect(res.result.docNumber).toBe('D-1');
      const refreshed = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(refreshed.nextDocNum).toBe(2);
    });

    it('documents_create rejects taskId + projectId together', async () => {
      const project = await seedProject(prisma);
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'documents_create',
          params: { taskId: task.id, projectId: project.id, title: 'X' },
          id: 911,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('not both');
      expect(await prisma.document.count()).toBe(0);
    });

    it('documents_list filters by projectId', async () => {
      const project = await seedProject(prisma);
      const task = await seedTask(prisma, board.statuses[0].id);
      await seedDocument(prisma, '', { projectId: project.id, title: 'P', body: 'secret' });
      await seedDocument(prisma, task.id, { title: 'T' });
      const res = await service.handleRequest(
        { method: 'documents_list', params: { projectId: project.id }, id: 912 },
        user,
      );
      expect(res.result).toHaveLength(1);
      expect(res.result[0].title).toBe('P');
      expect(res.result[0]).not.toHaveProperty('body');
      expect(res.result[0].project).toEqual({
        id: project.id,
        name: project.name,
        icon: project.icon,
      });
    });

    it('documents_get on a project doc returns null taskNumber instead of crashing', async () => {
      const project = await seedProject(prisma);
      const doc = await seedDocument(prisma, '', { projectId: project.id, body: '**p**' });
      const res = await service.handleRequest(
        { method: 'documents_get', params: { id: doc.id }, id: 913 },
        user,
      );
      expect(res.error).toBeUndefined();
      expect(res.result.body).toBe('**p**');
      expect(res.result.taskNumber).toBeNull();
      expect(res.result.project.id).toBe(project.id);
    });
  });

  // ─── Attachments (MCP parity) ─────────────────────────────────────────────

  describe('attachments_*', () => {
    it('uploads via base64 and lists metadata', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const b64 = Buffer.from('mcp-upload').toString('base64');
      const up = await service.handleRequest(
        {
          method: 'attachments_upload',
          params: {
            subjectType: 'task',
            subjectId: task.id,
            filename: 'm.txt',
            mimeType: 'text/plain',
            base64Content: b64,
          },
          id: 1,
        },
        user,
      );
      expect(up.error).toBeUndefined();
      expect(up.result.filename).toBe('m.txt');
      const list = await service.handleRequest(
        { method: 'attachments_list', params: { subjectType: 'task', subjectId: task.id }, id: 2 },
        user,
      );
      expect(list.result).toHaveLength(1);
      expect(list.result[0].storageKey).toBeUndefined();
    });

    it('rejects payloads over 1 MiB', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const big = Buffer.alloc(1024 * 1024 + 1, 7).toString('base64');
      const res = await service.handleRequest(
        {
          method: 'attachments_upload',
          params: {
            subjectType: 'task',
            subjectId: task.id,
            filename: 'big.bin',
            mimeType: 'application/zip',
            base64Content: big,
          },
          id: 3,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toMatch(/1 MiB/i);
    });

    it('rejects invalid base64', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'attachments_upload',
          params: {
            subjectType: 'task',
            subjectId: task.id,
            filename: 'x.txt',
            mimeType: 'text/plain',
            base64Content: '!!!!',
          },
          id: 4,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toMatch(/base64/i);
    });

    it('rejects empty base64Content', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const res = await service.handleRequest(
        {
          method: 'attachments_upload',
          params: {
            subjectType: 'task',
            subjectId: task.id,
            filename: 'empty.txt',
            mimeType: 'text/plain',
            base64Content: '',
          },
          id: 8,
        },
        user,
      );
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('base64Content is required');
    });

    it('get_meta returns metadata without storageKey', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const att = await seedAttachment(prisma, 'task', task.id);
      const res = await service.handleRequest(
        { method: 'attachments_get_meta', params: { id: att.id }, id: 5 },
        user,
      );
      expect(res.result.id).toBe(att.id);
      expect(res.result.storageKey).toBeUndefined();
    });

    it('deletes with permission', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const att = await seedAttachment(prisma, 'task', task.id, { uploaderId: user.id });
      const res = await service.handleRequest(
        { method: 'attachments_delete', params: { id: att.id }, id: 6 },
        user,
      );
      expect(res.result.success).toBe(true);
      expect(await prisma.attachment.findUnique({ where: { id: att.id } })).toBeNull();
    });

    it('rejects upload without an authenticated user', async () => {
      const task = await seedTask(prisma, board.statuses[0].id);
      const b64 = Buffer.from('anon').toString('base64');
      const res = await service.handleRequest({
        method: 'attachments_upload',
        params: {
          subjectType: 'task',
          subjectId: task.id,
          filename: 'anon.txt',
          mimeType: 'text/plain',
          base64Content: b64,
        },
        id: 7,
      });
      expect(res.error).toBeDefined();
      expect(res.error.message).toContain('Authentication required');
    });
  });
});
