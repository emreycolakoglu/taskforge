import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

export function withTaskNumber(task: any): any {
  const identifier = task.board?.identifier ?? task.list?.board?.identifier;
  return {
    ...task,
    taskNumber: identifier ? `${identifier}-${task.number}` : null,
  };
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findByBoard(boardId: string) {
    const tasks = await this.prisma.task.findMany({
      where: {
        list: { boardId },
        status: 'active',
      },
      include: {
        list: true,
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: 'asc' },
    });
    return tasks.map(withTaskNumber);
  }

  async findByList(listId: string) {
    const tasks = await this.prisma.task.findMany({
      where: { listId, status: 'active' },
      include: {
        list: { include: { board: true } },
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: 'asc' },
    });
    return tasks.map(withTaskNumber);
  }

  async search(query: string) {
    const taskNumMatch = query.match(/^([A-Z]{1,3})-(\d+)$/i);
    if (taskNumMatch) {
      const [, prefix, numStr] = taskNumMatch;
      const results = await this.prisma.task.findMany({
        where: {
          board: { identifier: { equals: prefix.toUpperCase() } },
          number: parseInt(numStr, 10),
          status: 'active',
        },
        include: {
          list: { include: { board: true } },
          board: { select: { identifier: true } },
          assignee: { select: { id: true, email: true, displayName: true, role: true } },
          labels: { include: { label: true } },
        },
        take: 20,
        orderBy: { updatedAt: 'desc' },
      });
      return results.map(withTaskNumber);
    }

    const results = await this.prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
        status: 'active',
      },
      include: {
        list: { include: { board: true } },
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
    return results.map(withTaskNumber);
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        list: { include: { board: true } },
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        comments: { orderBy: { createdAt: 'desc' } },
        activity: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return withTaskNumber(task);
  }

  async create(dto: CreateTaskDto, user?: { id: string; displayName: string }) {
    const task = await this.prisma.$transaction(async (tx) => {
      const list = await tx.list.findUniqueOrThrow({
        where: { id: dto.listId },
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
        where: { listId: dto.listId },
        _max: { position: true },
      });

      return tx.task.create({
        data: {
          listId: dto.listId,
          boardId: list.boardId,
          number: taskNumber,
          title: dto.title,
          description: dto.description ?? null,
          position: dto.position ?? (maxPos._max.position ?? -1) + 1,
          priority: dto.priority ?? 'medium',
          status: 'active',
          assigneeId: dto.assigneeId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          metadata: dto.metadata ?? null,
          labels: dto.labelIds?.length
            ? { create: dto.labelIds.map((labelId: string) => ({ labelId })) }
            : undefined,
        },
        include: {
          assignee: { select: { id: true, email: true, displayName: true, role: true } },
          labels: { include: { label: true } },
          list: { include: { board: true } },
          board: { select: { identifier: true } },
        },
      });
    });

    await this.prisma.activity.create({
      data: {
        taskId: task.id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'created',
        detail: JSON.stringify({ title: task.title }),
      },
    });

    this.events.emit('task:created', task, task.list.boardId);
    return withTaskNumber(task);
  }

  async update(id: string, dto: UpdateTaskDto, user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);
    const changes: Record<string, any> = {};

    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.description !== undefined) changes.description = dto.description;
    if (dto.priority !== undefined) changes.priority = dto.priority;
    if (dto.status !== undefined) changes.status = dto.status;
    if (dto.assigneeId !== undefined) changes.assigneeId = dto.assigneeId;
    if (dto.dueDate !== undefined) changes.dueDate = new Date(dto.dueDate);
    if (dto.metadata !== undefined) changes.metadata = dto.metadata;
    if (dto.listId !== undefined) changes.listId = dto.listId;
    if (dto.position !== undefined) changes.position = dto.position;

    // Handle label updates
    if (dto.labelIds !== undefined) {
      await this.prisma.taskLabel.deleteMany({ where: { taskId: id } });
      if (dto.labelIds.length > 0) {
        await this.prisma.taskLabel.createMany({
          data: dto.labelIds.map((labelId) => ({ taskId: id, labelId })),
        });
      }
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: changes,
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        list: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });

    // Log activity
    const detail: string[] = [];
    if (dto.title && dto.title !== existing.title) detail.push(`title: "${existing.title}" → "${dto.title}"`);
    if (dto.listId && dto.listId !== existing.listId) {
      const newList = await this.prisma.list.findUnique({ where: { id: dto.listId } });
      detail.push(`moved to "${newList?.name}"`);
    }
    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId) detail.push(`assigned to ${dto.assigneeId}`);
    if (dto.status && dto.status !== existing.status) detail.push(`status: ${dto.status}`);

    if (detail.length > 0) {
      await this.prisma.activity.create({
        data: {
          taskId: id,
          actorId: user?.id ?? null,
          actor: user?.displayName ?? 'system',
          action: 'updated',
          detail: JSON.stringify({ changes: detail }),
        },
      });
    }

    this.events.emit('task:updated', task, task.list.boardId);
    return withTaskNumber(task);
  }

  async move(id: string, dto: MoveTaskDto, user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);
    const maxPos = await this.prisma.task.aggregate({
      where: { listId: dto.listId },
      _max: { position: true },
    });

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        listId: dto.listId,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
      },
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        list: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });

    const newList = await this.prisma.list.findUnique({ where: { id: dto.listId } });
    await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'moved',
        detail: JSON.stringify({ from: existing.listId, to: dto.listId, listName: newList?.name }),
      },
    });

    this.events.emit('task:moved', task, task.list.boardId);
    return withTaskNumber(task);
  }

  async reorder(dto: ReorderTasksDto) {
    const updates = dto.items.map((item) =>
      this.prisma.task.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string, user?: { id: string; displayName: string }) {
    const task = await this.findOne(id);
    const boardId = task.list.boardId;
    await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'archived',
        detail: JSON.stringify({ reason: 'manual archive' }),
      },
    });
    const archived = await this.prisma.task.update({ where: { id }, data: { status: 'archived' } });
    this.events.emit('task:deleted', { id }, boardId);
    return archived;
  }

  async attachLabel(taskId: string, labelId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { list: { select: { boardId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    const taskLabel = await this.prisma.taskLabel.create({
      data: { taskId, labelId },
      include: { label: true },
    });

    const updatedTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        labels: { include: { label: true } },
        list: { select: { boardId: true } },
      },
    });

    this.events.emit('task.label.attached', updatedTask, task.list.boardId);
    return taskLabel;
  }

  async detachLabel(taskId: string, labelId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { list: { select: { boardId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.taskLabel.delete({
      where: { taskId_labelId: { taskId, labelId } },
    });

    const updatedTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        labels: { include: { label: true } },
        list: { select: { boardId: true } },
      },
    });

    this.events.emit('task.label.detached', updatedTask, task.list.boardId);
  }
}