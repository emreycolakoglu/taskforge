import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

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

@Injectable()
export class McpService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async handleRequest(req: McpRequest): Promise<McpResponse> {
    try {
      const [resource, action] = req.method.split('_');

      let result: any;

      switch (resource) {
        case 'boards': result = await this.handleBoards(action, req.params); break;
        case 'lists': result = await this.handleLists(action, req.params); break;
        case 'tasks': result = await this.handleTasks(action, req.params); break;
        case 'comments': result = await this.handleComments(action, req.params); break;
        case 'labels': result = await this.handleLabels(action, req.params); break;
        case 'activity': result = await this.handleActivity(action, req.params); break;
        default:
          return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
      }

      return { jsonrpc: '2.0', id: req.id, result };
    } catch (err: any) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: err.message } };
    }
  }

  private async handleBoards(action: string, params: any) {
    switch (action) {
      case 'list': {
        const boards = await this.prisma.board.findMany({
          include: { _count: { select: { lists: true, tasks: true } } },
        });
        return { jsonrpc: '2.0', result: boards };
      }
      case 'get': {
        const board = await this.prisma.board.findUnique({
          where: { id: params.id },
          include: {
            lists: { orderBy: { position: 'asc' }, include: { tasks: { where: { status: 'active' }, orderBy: { position: 'asc' } } } },
            labels: true,
          },
        });
        return { jsonrpc: '2.0', result: board };
      }
      case 'create': {
        const board = await this.prisma.board.create({
          data: {
            name: params.name,
            slug: params.slug,
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
        return { jsonrpc: '2.0', result: board };
      }
      case 'delete': {
        await this.prisma.board.delete({ where: { id: params.id } });
        return { jsonrpc: '2.0', result: { deleted: true } };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: boards_${action}` } };
    }
  }

  private async handleLists(action: string, params: any) {
    switch (action) {
      case 'list': {
        const lists = await this.prisma.list.findMany({
          where: { boardId: params.boardId },
          orderBy: { position: 'asc' },
          include: { _count: { select: { tasks: true } } },
        });
        return { jsonrpc: '2.0', result: lists };
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
        this.events.emit('list:created', list);
        return { jsonrpc: '2.0', result: list };
      }
      case 'update': {
        const list = await this.prisma.list.update({
          where: { id: params.id },
          data: { name: params.name, color: params.color, wipLimit: params.wipLimit },
        });
        this.events.emit('list:updated', list);
        return { jsonrpc: '2.0', result: list };
      }
      case 'delete': {
        await this.prisma.list.delete({ where: { id: params.id } });
        return { jsonrpc: '2.0', result: { deleted: true } };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: lists_${action}` } };
    }
  }

  private async handleTasks(action: string, params: any) {
    switch (action) {
      case 'list': {
        const where: any = {};
        if (params.boardId) where.list = { boardId: params.boardId };
        if (params.listId) where.listId = params.listId;
        if (params.assignee) where.assignee = params.assignee;
        if (params.status) where.status = params.status;
        else where.status = 'active';

        const tasks = await this.prisma.task.findMany({
          where,
          include: {
            list: true,
            labels: { include: { label: true } },
            _count: { select: { comments: true } },
          },
          orderBy: { position: 'asc' },
          take: params.limit || 100,
        });
        return { jsonrpc: '2.0', result: tasks };
      }
      case 'get': {
        const task = await this.prisma.task.findUnique({
          where: { id: params.id },
          include: {
            list: { include: { board: true } },
            labels: { include: { label: true } },
            comments: { orderBy: { createdAt: 'desc' } },
            activity: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        });
        return { jsonrpc: '2.0', result: task };
      }
      case 'search': {
        const tasks = await this.prisma.task.findMany({
          where: {
            OR: [
              { title: { contains: params.query } },
              { description: { contains: params.query } },
            ],
            status: 'active',
          },
          include: { list: { include: { board: true } }, labels: { include: { label: true } } },
          take: 20,
          orderBy: { updatedAt: 'desc' },
        });
        return { jsonrpc: '2.0', result: tasks };
      }
      case 'create': {
        const maxPos = await this.prisma.task.aggregate({
          where: { listId: params.listId },
          _max: { position: true },
        });
        const task = await this.prisma.task.create({
          data: {
            listId: params.listId,
            title: params.title,
            description: params.description,
            position: params.position ?? (maxPos._max.position ?? -1) + 1,
            priority: params.priority || 'medium',
            assignee: params.assignee,
            dueDate: params.dueDate ? new Date(params.dueDate) : undefined,
            metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
            labels: params.labelIds?.length
              ? { create: params.labelIds.map((id: string) => ({ labelId: id })) }
              : undefined,
          },
          include: { labels: { include: { label: true } }, list: true },
        });
        await this.prisma.activity.create({
          data: { taskId: task.id, actor: params.assignee || 'agent', action: 'created', detail: JSON.stringify({ title: task.title }) },
        });
        this.events.emit('task:created', task);
        return { jsonrpc: '2.0', result: task };
      }
      case 'update': {
        const existing = await this.prisma.task.findUnique({ where: { id: params.id } });
        if (!existing) return { jsonrpc: '2.0', error: { code: -32602, message: 'Task not found' } };

        const data: any = {};
        if (params.title !== undefined) data.title = params.title;
        if (params.description !== undefined) data.description = params.description;
        if (params.priority !== undefined) data.priority = params.priority;
        if (params.status !== undefined) data.status = params.status;
        if (params.assignee !== undefined) data.assignee = params.assignee;
        if (params.dueDate !== undefined) data.dueDate = new Date(params.dueDate);
        if (params.listId !== undefined) data.listId = params.listId;
        if (params.position !== undefined) data.position = params.position;

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
          include: { labels: { include: { label: true } }, list: true },
        });

        const changes: string[] = [];
        if (params.title && params.title !== existing.title) changes.push(`title updated`);
        if (params.listId && params.listId !== existing.listId) {
          const newList = await this.prisma.list.findUnique({ where: { id: params.listId } });
          changes.push(`moved to ${newList?.name}`);
        }
        if (params.assignee && params.assignee !== existing.assignee) changes.push(`assigned to ${params.assignee}`);
        if (params.status && params.status !== existing.status) changes.push(`status: ${params.status}`);

        if (changes.length > 0) {
          await this.prisma.activity.create({
            data: { taskId: params.id, actor: params.assignee || 'agent', action: 'updated', detail: JSON.stringify({ changes }) },
          });
        }

        this.events.emit('task:updated', task);
        return { jsonrpc: '2.0', result: task };
      }
      case 'move': {
        const maxPos = await this.prisma.task.aggregate({
          where: { listId: params.listId },
          _max: { position: true },
        });
        const task = await this.prisma.task.update({
          where: { id: params.id },
          data: { listId: params.listId, position: params.position ?? (maxPos._max.position ?? -1) + 1 },
          include: { list: true },
        });
        const newList = await this.prisma.list.findUnique({ where: { id: params.listId } });
        await this.prisma.activity.create({
          data: { taskId: params.id, actor: 'agent', action: 'moved', detail: JSON.stringify({ to: newList?.name }) },
        });
        this.events.emit('task:moved', task);
        return { jsonrpc: '2.0', result: task };
      }
      case 'delete': {
        await this.prisma.task.update({ where: { id: params.id }, data: { status: 'archived' } });
        return { jsonrpc: '2.0', result: { archived: true } };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: tasks_${action}` } };
    }
  }

  private async handleComments(action: string, params: any) {
    switch (action) {
      case 'list': {
        const comments = await this.prisma.comment.findMany({
          where: { taskId: params.taskId },
          orderBy: { createdAt: 'desc' },
        });
        return { jsonrpc: '2.0', result: comments };
      }
      case 'create': {
        const comment = await this.prisma.comment.create({
          data: { taskId: params.taskId, author: params.author, body: params.body },
        });
        await this.prisma.activity.create({
          data: { taskId: params.taskId, actor: params.author, action: 'commented', detail: JSON.stringify({ commentId: comment.id }) },
        });
        this.events.emit('comment:created', comment);
        return { jsonrpc: '2.0', result: comment };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: comments_${action}` } };
    }
  }

  private async handleLabels(action: string, params: any) {
    switch (action) {
      case 'list': {
        const labels = await this.prisma.label.findMany({ where: { boardId: params.boardId } });
        return { jsonrpc: '2.0', result: labels };
      }
      case 'create': {
        const label = await this.prisma.label.create({
          data: { boardId: params.boardId, name: params.name, color: params.color || '#6366f1' },
        });
        return { jsonrpc: '2.0', result: label };
      }
      case 'delete': {
        await this.prisma.taskLabel.deleteMany({ where: { labelId: params.id } });
        await this.prisma.label.delete({ where: { id: params.id } });
        return { jsonrpc: '2.0', result: { deleted: true } };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: labels_${action}` } };
    }
  }

  private async handleActivity(action: string, params: any) {
    switch (action) {
      case 'list': {
        const where: any = {};
        if (params.taskId) where.taskId = params.taskId;
        if (params.boardId) where.task = { list: { boardId: params.boardId } };

        const activity = await this.prisma.activity.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: params.limit || 50,
          include: { task: { select: { id: true, title: true } } },
        });
        return { jsonrpc: '2.0', result: activity };
      }
      default:
        return { jsonrpc: '2.0', error: { code: -32601, message: `Unknown action: activity_${action}` } };
    }
  }
}
