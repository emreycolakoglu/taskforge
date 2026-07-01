import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';

function withTaskNumber(task: any): any {
  const identifier = task.board?.identifier ?? task.list?.board?.identifier;
  return {
    ...task,
    taskNumber: identifier ? `${identifier}-${task.number}` : null,
  };
}

/**
 * Inline mirror of TasksService.validateParent (sub-task rules C1-C5).
 * MCP mirrors checks inline rather than delegating to TasksService.
 */
async function validateParent(
  prisma: PrismaService,
  parentId: string | null,
  context: { taskId?: string; boardId: string },
): Promise<void> {
  if (parentId === null) return;
  if (context.taskId && parentId === context.taskId) {
    throw new BadRequestException('A task cannot be its own parent');
  }
  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  if (!parent) throw new NotFoundException('Parent task not found');
  if (parent.boardId !== context.boardId) {
    throw new BadRequestException('Parent task must be in the same board');
  }
  if (parent.parentId) {
    throw new BadRequestException('Sub-tasks cannot have sub-tasks (single level only)');
  }
  if (context.taskId) {
    const childCount = await prisma.task.count({ where: { parentId: context.taskId } });
    if (childCount > 0) {
      throw new BadRequestException('Cannot nest a task that already has sub-tasks');
    }
  }
}

interface McpRequest {
  method: string;
  params: any;
  id?: string | number;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: { code: number; message: string };
}

export interface AuthUser {
  id: string;
  displayName: string;
  role: string;
}

@Injectable()
export class McpService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private relations: RelationsService,
    private subscriptions: SubscriptionsService,
    private notifications: NotificationsService,
  ) {}

  async handleRequest(req: McpRequest, user?: AuthUser): Promise<McpResponse> {
    try {
      const [resource, ...actionParts] = req.method.split('_');
      const action = actionParts.join('_');

      let result: any;

      switch (resource) {
        case 'boards': result = await this.handleBoards(action, req.params, user); break;
        case 'lists': result = await this.handleLists(action, req.params, user); break;
        case 'tasks': result = await this.handleTasks(action, req.params, user); break;
        case 'task': result = await this.handleTasks(action, req.params, user); break;
        case 'comments': result = await this.handleComments(action, req.params, user); break;
        case 'labels': result = await this.handleLabels(action, req.params); break;
        case 'activity': result = await this.handleActivity(action, req.params); break;
        case 'relations': result = await this.handleRelations(action, req.params, user); break;
        case 'inbox': result = await this.handleInbox(action, req.params, user); break;
        case 'notifications': result = await this.handleNotifications(action, req.params, user); break;
        default:
          return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
      }

      return { jsonrpc: '2.0', id: req.id, result };
    } catch (err: any) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err.message } };
    }
  }

  private actorInfo(user?: AuthUser) {
    return { actorId: user?.id ?? null, actor: user?.displayName ?? 'agent' };
  }

  private async handleBoards(action: string, params: any, user?: AuthUser) {
    switch (action) {
      case 'list': {
        return this.prisma.board.findMany({
          include: { _count: { select: { lists: true, members: true } } },
        });
      }
      case 'get': {
        return this.prisma.board.findUnique({
          where: { id: params.id },
          include: {
            lists: { orderBy: { position: 'asc' }, include: { tasks: { where: { status: 'active' }, orderBy: { position: 'asc' } } } },
            labels: true,
          },
        });
      }
      case 'create': {
        const board = await this.prisma.board.create({
          data: {
            name: params.name,
            slug: params.slug,
            identifier: (params.identifier || '???').toUpperCase(),
            description: params.description,
            lists: {
              create: [
                { name: 'Backlog', position: 0, color: '#94a3b8' },
                { name: 'To Do', position: 1, color: '#6366f1' },
                { name: 'In Progress', position: 2, color: '#f59e0b' },
                { name: 'Review', position: 3, color: '#8b5cf6' },
                { name: 'Done', position: 4, color: '#22c55e' },
              ],
            },
          },
          include: { lists: true },
        });
        this.events.emit('board:created', board);
        return board;
      }
      case 'delete': {
        await this.prisma.board.delete({ where: { id: params.id } });
        this.events.emit('board:deleted', { id: params.id }, params.id);
        return { deleted: true };
      }
      default:
        throw new Error(`Unknown action: boards_${action}`);
    }
  }

  private async handleLists(action: string, params: any, user?: AuthUser) {
    switch (action) {
      case 'list': {
        return this.prisma.list.findMany({
          where: { boardId: params.boardId },
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: true } } },
        });
      }
      case 'create': {
        const maxPos = await this.prisma.list.aggregate({
          where: { boardId: params.boardId },
          _max: { position: true },
        });
        const list = await this.prisma.list.create({
          data: {
            boardId: params.boardId,
            name: params.name,
            position: params.position ?? (maxPos._max.position ?? -1) + 1,
            color: params.color,
            wipLimit: params.wipLimit,
          },
        });
        this.events.emit('list:created', list, params.boardId);
        return list;
      }
      case 'update': {
        const list = await this.prisma.list.update({
          where: { id: params.id },
          data: { name: params.name, color: params.color, wipLimit: params.wipLimit },
        });
        this.events.emit('list:updated', list, list.boardId);
        return list;
      }
      case 'delete': {
        const list = await this.prisma.list.findUnique({ where: { id: params.id } });
        await this.prisma.list.delete({ where: { id: params.id } });
        this.events.emit('list:deleted', { id: params.id }, list?.boardId);
        return { deleted: true };
      }
      default:
        throw new Error(`Unknown action: lists_${action}`);
    }
  }

  private async handleTasks(action: string, params: any, user?: AuthUser) {
    const { actorId, actor } = this.actorInfo(user);

    switch (action) {
      case 'list': {
        const where: any = {};
        if (params.boardId) where.boardId = params.boardId;
        if (params.listId) where.listId = params.listId;
        if (params.assigneeId) where.assigneeId = params.assigneeId;
        if (params.status) where.status = params.status;
        else where.status = 'active';
        // Sub-task filtering — parentId overrides include.
        if (params.parentId !== undefined) {
          where.parentId = params.parentId;
        } else if (params.include === 'top') {
          where.parentId = null;
        } else if (params.include === 'sub') {
          where.parentId = { not: null };
        }

        const tasks = await this.prisma.task.findMany({
          where,
          include: {
            list: true,
            board: { select: { identifier: true } },
            labels: { include: { label: true } },
            _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
          },
          orderBy: { position: 'asc' },
          take: params.limit || 100,
        });
        return tasks.map(withTaskNumber);
      }
      case 'get': {
        const task = await this.prisma.task.findUnique({
          where: { id: params.id },
          include: {
            list: { include: { board: true } },
            board: { select: { identifier: true } },
            labels: { include: { label: true } },
            comments: { orderBy: { createdAt: 'desc' } },
            activity: { orderBy: { createdAt: 'desc' }, take: 20 },
            subTasks: {
              where: { status: 'active' },
              orderBy: { position: 'asc' },
              include: { board: { select: { identifier: true } } },
            },
            parent: { select: { id: true, number: true, title: true, board: { select: { identifier: true } } } },
            _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
          },
        });
        if (!task) return null;
        return withTaskNumber({ ...task, subTasks: (task.subTasks ?? []).map(withTaskNumber) });
      }
      case 'search': {
        const taskNumMatch = params.query?.match(/^([A-Z]{1,3})-(\d+)$/i);
        if (taskNumMatch) {
          const [, prefix, numStr] = taskNumMatch;
          const results = await this.prisma.task.findMany({
            where: {
              board: { identifier: { equals: prefix.toUpperCase() } },
              number: parseInt(numStr, 10),
              status: 'active',
            },
            include: { list: { include: { board: true } }, board: { select: { identifier: true } }, labels: { include: { label: true } } },
            take: 20,
            orderBy: { updatedAt: 'desc' },
          });
          return results.map(withTaskNumber);
        }

        const results = await this.prisma.task.findMany({
          where: {
            OR: [
              { title: { contains: params.query } },
              { description: { contains: params.query } },
            ],
            status: 'active',
          },
          include: { list: { include: { board: true } }, board: { select: { identifier: true } }, labels: { include: { label: true } } },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        });
        return results.map(withTaskNumber);
      }
      case 'create': {
        // Sub-task validation (C2, C3, C4). C1/C5 impossible pre-create.
        if (params.parentId) {
          const list = await this.prisma.list.findUniqueOrThrow({ where: { id: params.listId } });
          await validateParent(this.prisma, params.parentId, { boardId: list.boardId });
        }
        const task = await this.prisma.$transaction(async (tx) => {
          const list = await tx.list.findUniqueOrThrow({
            where: { id: params.listId },
          });
          const board = await tx.board.findUniqueOrThrow({
            where: { id: list.boardId },
          });

          const taskNumber = board.nextTaskNum;
          await tx.board.update({
            where: { id: board.id },
            data: { nextTaskNum: taskNumber + 1 },
          });

          const maxPos = await tx.task.aggregate({
            where: { listId: params.listId },
            _max: { position: true },
          });

          return tx.task.create({
            data: {
              listId: params.listId,
              boardId: list.boardId,
              number: taskNumber,
              title: params.title,
              description: params.description ?? null,
              position: params.position ?? (maxPos._max.position ?? -1) + 1,
              priority: params.priority || 'medium',
              assigneeId: params.assigneeId ?? user?.id ?? null,
              dueDate: params.dueDate ? new Date(params.dueDate) : null,
              metadata: params.metadata ? JSON.stringify(params.metadata) : null,
              status: 'active',
              parentId: params.parentId ?? null,
              labels: params.labelIds?.length
                ? { create: params.labelIds.map((id: string) => ({ labelId: id })) }
                : undefined,
            },
            include: { labels: { include: { label: true } }, list: { include: { board: true } }, board: { select: { identifier: true } } },
          });
        });
        await this.prisma.activity.create({
          data: { taskId: task.id, actorId, actor, action: 'created', detail: JSON.stringify({ title: task.title, parentId: params.parentId ?? null }) },
        });
        this.events.emit('task:created', task, task.list?.boardId);
        return withTaskNumber(task);
      }
      case 'update': {
        const existing = await this.prisma.task.findUnique({ where: { id: params.id } });
        if (!existing) throw new Error('Task not found');

        const data: any = {};
        if (params.title !== undefined) data.title = params.title;
        if (params.description !== undefined) data.description = params.description;
        if (params.priority !== undefined) data.priority = params.priority;
        if (params.status !== undefined) data.status = params.status;
        if (params.assigneeId !== undefined) data.assigneeId = params.assigneeId;
        if (params.dueDate !== undefined) data.dueDate = new Date(params.dueDate);
        if (params.listId !== undefined) data.listId = params.listId;
        if (params.position !== undefined) data.position = params.position;

        // Sub-task validation (C1-C5). parentId: null is always allowed (un-nest).
        let parentChanged = false;
        if (params.parentId !== undefined) {
          await validateParent(this.prisma, params.parentId, { taskId: params.id, boardId: existing.boardId });
          data.parentId = params.parentId;
          parentChanged = true;
        }

        if (params.labelIds !== undefined) {
          await this.prisma.taskLabel.deleteMany({ where: { taskId: params.id } });
          if (params.labelIds.length > 0) {
            await this.prisma.taskLabel.createMany({
              data: params.labelIds.map((id: string) => ({ taskId: params.id, labelId: id })),
            });
          }
        }

        const task = await this.prisma.task.update({
          where: { id: params.id },
          data,
          include: { labels: { include: { label: true } }, list: { include: { board: true } }, board: { select: { identifier: true } } },
        });

        const changes: string[] = [];
        if (params.title && params.title !== existing.title) changes.push(`title updated`);
        if (params.listId && params.listId !== existing.listId) {
          const newList = await this.prisma.list.findUnique({ where: { id: params.listId } });
          changes.push(`moved to ${newList?.name}`);
        }
        if (params.assigneeId && params.assigneeId !== existing.assigneeId) changes.push(`assigned to ${params.assigneeId}`);
        if (params.status && params.status !== existing.status) changes.push(`status: ${params.status}`);
        if (parentChanged) {
          if (params.parentId === null) changes.push('un-nested from parent');
          else changes.push(`set parent: ${params.parentId}`);
        }

        if (changes.length > 0) {
          await this.prisma.activity.create({
            data: { taskId: params.id, actorId, actor, action: 'updated', detail: JSON.stringify({ changes }) },
          });
        }

        this.events.emit('task:updated', task, task.list?.boardId);
        return withTaskNumber(task);
      }
      case 'move': {
        const maxPos = await this.prisma.task.aggregate({
          where: { listId: params.listId },
          _max: { position: true },
        });
        const task = await this.prisma.task.update({
          where: { id: params.id },
          data: { listId: params.listId, position: params.position ?? (maxPos._max.position ?? -1) + 1 },
          include: { list: { include: { board: true } }, board: { select: { identifier: true } } },
        });
        const newList = await this.prisma.list.findUnique({ where: { id: params.listId } });
        await this.prisma.activity.create({
          data: { taskId: params.id, actorId, actor, action: 'moved', detail: JSON.stringify({ to: newList?.name }) },
        });
        this.events.emit('task:moved', task, task.list?.boardId);
        return withTaskNumber(task);
      }
      case 'delete': {
        const existingTask = await this.prisma.task.findUnique({
          where: { id: params.id },
          select: { boardId: true },
        });
        await this.prisma.task.update({ where: { id: params.id }, data: { status: 'archived' } });
        // Relation cleanup on archive (emits relation:deleted per row).
        // NOTE: sub-task orphan promotion (clearing parentId on children) is not
        // performed here — parity gap with TasksService.remove, out of scope.
        await this.relations.cleanupForTask(params.id);
        this.events.emit('task:deleted', { id: params.id }, existingTask?.boardId);
        return { archived: true };
      }
      case 'subscribe': {
        if (!user) throw new Error('Authentication required');
        await this.subscriptions.subscribe(params.taskId, user.id);
        return { subscribed: true };
      }
      case 'unsubscribe': {
        if (!user) throw new Error('Authentication required');
        await this.subscriptions.unsubscribe(params.taskId, user.id);
        return { subscribed: false };
      }
      default:
        throw new Error(`Unknown action: tasks_${action}`);
    }
  }

  private async handleComments(action: string, params: any, user?: AuthUser) {
    const { actorId, actor: authorName } = this.actorInfo(user);

    switch (action) {
      case 'list': {
        return this.prisma.comment.findMany({
          where: { taskId: params.taskId },
          orderBy: { createdAt: 'desc' },
        });
      }
      case 'create': {
        const comment = await this.prisma.comment.create({
          data: { taskId: params.taskId, authorId: actorId, author: authorName, body: params.body },
        });
        await this.prisma.activity.create({
          data: { taskId: params.taskId, actorId, actor: authorName, action: 'commented', detail: JSON.stringify({ commentId: comment.id }) },
        });
        const task = await this.prisma.task.findUnique({
          where: { id: params.taskId },
          include: { list: { select: { boardId: true } } },
        });
        this.events.emit('comment:created', comment, task?.list?.boardId);
        return comment;
      }
      default:
        throw new Error(`Unknown action: comments_${action}`);
    }
  }

  private async handleLabels(action: string, params: any) {
    switch (action) {
      case 'list': {
        return this.prisma.label.findMany({ where: { boardId: params.boardId } });
      }
      case 'create': {
        const label = await this.prisma.label.create({
          data: { boardId: params.boardId, name: params.name, color: params.color || '#6366f1' },
        });
        this.events.emit('label:created', label, params.boardId);
        return label;
      }
      case 'delete': {
        const label = await this.prisma.label.findUnique({ where: { id: params.id } });
        await this.prisma.taskLabel.deleteMany({ where: { labelId: params.id } });
        await this.prisma.label.delete({ where: { id: params.id } });
        this.events.emit('label:deleted', { id: params.id }, label?.boardId);
        return { deleted: true };
      }
      default:
        throw new Error(`Unknown action: labels_${action}`);
    }
  }

  private async handleActivity(action: string, params: any) {
    switch (action) {
      case 'list': {
        const where: any = {};
        if (params.taskId) where.taskId = params.taskId;
        if (params.boardId) where.task = { list: { boardId: params.boardId } };

        return this.prisma.activity.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.limit || 50,
          include: { task: { select: { id: true, title: true } } },
        });
      }
      default:
        throw new Error(`Unknown action: activity_${action}`);
    }
  }

  // Delegates to RelationsService — graph logic lives there, not inline.
  private async handleRelations(action: string, params: any, _user?: AuthUser) {
    switch (action) {
      case 'list':
        return this.relations.list(params.taskId);
      case 'create':
        return this.relations.create(params.taskId, {
          otherTaskId: params.otherTaskId,
          type: params.type,
          direction: params.direction,
        });
      case 'delete':
        return this.relations.delete(params.relationId);
      default:
        throw new Error(`Unknown action: relations_${action}`);
    }
  }

  private async handleInbox(action: string, params: any, user?: AuthUser) {
    switch (action) {
      case 'list': {
        if (!user) throw new Error('Authentication required');
        return this.notifications.listForUser(user.id, params.filter ?? 'all', params.limit);
      }
      default:
        throw new Error(`Unknown action: inbox_${action}`);
    }
  }

  private async handleNotifications(action: string, params: any, user?: AuthUser) {
    switch (action) {
      case 'mark_read': {
        if (!user) throw new Error('Authentication required');
        if (params.id) {
          await this.notifications.markRead(params.id, user.id);
          return { updated: 1 };
        }
        return this.notifications.markAllRead(user.id);
      }
      default:
        throw new Error(`Unknown action: notifications_${action}`);
    }
  }
}