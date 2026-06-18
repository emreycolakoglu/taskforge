import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findByBoard(boardId: string) {
    return this.prisma.task.findMany({
      where: {
        list: { boardId },
        status: 'active',
      },
      include: {
        list: true,
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async findByList(listId: string) {
    return this.prisma.task.findMany({
      where: { listId, status: 'active' },
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true } },
      },
      orderBy: { position: 'asc' },
    });
  }

  async search(query: string) {
    return this.prisma.task.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
        ],
        status: 'active',
      },
      include: {
        list: { include: { board: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        list: { include: { board: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        comments: { orderBy: { createdAt: 'desc' } },
        activity: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async create(dto: CreateTaskDto, user?: { id: string; displayName: string }) {
    const maxPos = await this.prisma.task.aggregate({
      where: { listId: dto.listId },
      _max: { position: true },
    });

    const task = await this.prisma.task.create({
      data: {
        listId: dto.listId,
        title: dto.title,
        description: dto.description,
        position: dto.position ?? (maxPos._max.position ?? -1) + 1,
        priority: dto.priority ?? 'medium',
        assigneeId: dto.assigneeId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        metadata: dto.metadata,
        labels: dto.labelIds?.length
          ? { create: dto.labelIds.map((labelId) => ({ labelId })) }
          : undefined,
      },
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        list: true,
      },
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

    this.events.emit('task:created', task);
    return task;
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
        list: true,
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

    this.events.emit('task:updated', task);
    return task;
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
        list: true,
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

    this.events.emit('task:moved', task);
    return task;
  }

  async reorder(dto: ReorderTasksDto) {
    const updates = dto.items.map((item) =>
      this.prisma.task.update({ where: { id: item.id }, data: { position: item.position } }),
    );
    return this.prisma.$transaction(updates);
  }

  async remove(id: string, user?: { id: string; displayName: string }) {
    await this.findOne(id);
    await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'archived',
        detail: JSON.stringify({ reason: 'manual archive' }),
      },
    });
    return this.prisma.task.update({ where: { id }, data: { status: 'archived' } });
  }
}