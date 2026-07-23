import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { RelationsService } from '../relations/relations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto, ReorderTasksDto } from './dto/task.dto';

export function withTaskNumber(task: any): any {
  const identifier = task.board?.identifier ?? task.status?.board?.identifier;
  const blockedByCount = task._count?.relationsTo ?? 0;
  return {
    ...task,
    blockedByCount,
    taskNumber: identifier ? `${identifier}-${task.number}` : null,
  };
}

/**
 * Mutates a Prisma `where` clause to apply the include/parentId filter.
 * parentId filter overrides include.
 *   - include='top'  → only tasks with no parent
 *   - include='sub'  → only tasks that have a parent
 *   - parentId=<id>   → only children of that parent
 */
function applyParentFilter(where: any, opts?: { include?: 'all' | 'top' | 'sub'; parentId?: string }): void {
  if (!opts) return;
  if (opts.parentId !== undefined) {
    where.parentId = opts.parentId;
  } else if (opts.include === 'top') {
    where.parentId = null;
  } else if (opts.include === 'sub') {
    where.parentId = { not: null };
  }
}

/**
 * Sub-task validation rules (single-level nesting only).
 *
 * C1: a task cannot be its own parent
 * C2: parent must exist
 * C4: parent must not itself have a parentId (no nesting beyond one level)
 * C5: a task being assigned a parent must not already have children
 *
 * C6 (orphan promotion on parent archive) is handled in remove().
 */
async function validateParent(
  prisma: PrismaService,
  parentId: string | null,
  context: { taskId?: string; boardId: string },
): Promise<void> {
  // Setting parentId to null is always allowed (un-nest).
  if (parentId === null) return;

  // C1 — self-parent
  if (context.taskId && parentId === context.taskId) {
    throw new BadRequestException('A task cannot be its own parent');
  }

  const parent = await prisma.task.findUnique({ where: { id: parentId } });
  // C2 — existence
  if (!parent) throw new NotFoundException('Parent task not found');
  // C4 — single level
  if (parent.parentId) {
    throw new BadRequestException('Sub-tasks cannot have sub-tasks (single level only)');
  }

  // C5 — the task being nested must not already have children
  if (context.taskId) {
    const childCount = await prisma.task.count({ where: { parentId: context.taskId } });
    if (childCount > 0) {
      throw new BadRequestException('Cannot nest a task that already has sub-tasks');
    }
  }
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private relations: RelationsService,
    private subscriptions: SubscriptionsService,
    private notifications: NotificationsService,
  ) {}

  async findByBoard(boardId: string, opts?: { include?: 'all' | 'top' | 'sub'; parentId?: string }) {
    const where: any = {
      status: { boardId },
    };
    applyParentFilter(where, opts);
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        status: true,
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
      },
      orderBy: { position: 'asc' },
    });
    return tasks.map(withTaskNumber);
  }

  async findByStatus(statusId: string, opts?: { include?: 'all' | 'top' | 'sub'; parentId?: string }) {
    const where: any = { statusId };
    applyParentFilter(where, opts);
    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        status: { include: { board: true } },
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
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
        },
        include: {
          status: { include: { board: true } },
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
      },
      include: {
        status: { include: { board: true } },
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
        status: { include: { board: true } },
        board: { select: { identifier: true } },
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        comments: { orderBy: { createdAt: 'desc' } },
        activity: { orderBy: { createdAt: 'desc' }, take: 20 },
        subTasks: {
          orderBy: { position: 'asc' },
          include: { board: { select: { identifier: true } } },
        },
        parent: { select: { id: true, number: true, title: true, board: { select: { identifier: true } } } },
        _count: { select: { comments: true, relationsTo: { where: { type: 'blocks' } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    const withSubNumbers = {
      ...task,
      subTasks: (task.subTasks ?? []).map(withTaskNumber),
    };
    return withTaskNumber(withSubNumbers);
  }

  async create(dto: CreateTaskDto, user?: { id: string; displayName: string }) {
    // Sub-task validation (C2, C3, C4). C1/C5 impossible pre-create.
    if (dto.parentId) {
      const status = await this.prisma.status.findUniqueOrThrow({ where: { id: dto.statusId } });
      await validateParent(this.prisma, dto.parentId, { boardId: status.boardId });
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const status = await tx.status.findUniqueOrThrow({
        where: { id: dto.statusId },
      });
      const board = await tx.board.findUniqueOrThrow({
        where: { id: status.boardId },
      });

      const taskNumber = board.nextTaskNum;
      await tx.board.update({
        where: { id: board.id },
        data: { nextTaskNum: taskNumber + 1 },
      });

      const maxPos = await tx.task.aggregate({
        where: { statusId: dto.statusId },
        _max: { position: true },
      });

      return tx.task.create({
        data: {
          statusId: dto.statusId,
          boardId: status.boardId,
          number: taskNumber,
          title: dto.title,
          description: dto.description ?? null,
          position: dto.position ?? (maxPos._max.position ?? -1) + 1,
          priority: dto.priority ?? 'medium',
          assigneeId: dto.assigneeId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          metadata: dto.metadata ?? null,
          parentId: dto.parentId ?? null,
          labels: dto.labelIds?.length
            ? { create: dto.labelIds.map((labelId: string) => ({ labelId })) }
            : undefined,
        },
        include: {
          assignee: { select: { id: true, email: true, displayName: true, role: true } },
          labels: { include: { label: true } },
          status: { include: { board: true } },
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
        detail: JSON.stringify({ title: task.title, parentId: dto.parentId ?? null }),
      },
    });

    if (user) {
      await this.subscriptions.subscribe(task.id, user.id);
    }

    this.events.emit('task:created', task, task.status.boardId);
    return withTaskNumber(task);
  }

  async update(id: string, dto: UpdateTaskDto, user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);
    const changes: Record<string, any> = {};

    if (dto.title !== undefined) changes.title = dto.title;
    if (dto.description !== undefined) changes.description = dto.description;
    if (dto.priority !== undefined) changes.priority = dto.priority;
    if (dto.assigneeId !== undefined) changes.assigneeId = dto.assigneeId;
    if (dto.dueDate !== undefined) changes.dueDate = new Date(dto.dueDate);
    if (dto.metadata !== undefined) changes.metadata = dto.metadata;
    if (dto.statusId !== undefined) changes.statusId = dto.statusId;
    if (dto.position !== undefined) changes.position = dto.position;

    // Sub-task validation (C1-C5). parentId: null is always allowed (un-nest).
    let parentChanged = false;
    if (dto.parentId !== undefined) {
      await validateParent(this.prisma, dto.parentId, { taskId: id, boardId: existing.boardId });
      changes.parentId = dto.parentId;
      parentChanged = true;
    }

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
        status: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });

    // Log activity
    const detail: string[] = [];
    if (dto.title && dto.title !== existing.title) detail.push(`title: "${existing.title}" → "${dto.title}"`);
    if (dto.statusId && dto.statusId !== existing.statusId) {
      const newStatus = await this.prisma.status.findUnique({ where: { id: dto.statusId } });
      detail.push(`moved to "${newStatus?.name}"`);
    }
    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId) detail.push(`assigned to ${dto.assigneeId}`);
    if (parentChanged) {
      if (dto.parentId === null) detail.push('un-nested from parent');
      else detail.push(`set parent: ${dto.parentId}`);
    }

    if (detail.length > 0) {
      const activity = await this.prisma.activity.create({
        data: {
          taskId: id,
          actorId: user?.id ?? null,
          actor: user?.displayName ?? 'system',
          action: 'updated',
          detail: JSON.stringify({ changes: detail }),
        },
      });
      await this.notifications.dispatchFromActivity(activity);
    }

    this.events.emit('task:updated', task, task.status.boardId);
    return withTaskNumber(task);
  }

  async move(id: string, dto: MoveTaskDto, user?: { id: string; displayName: string }) {
    const existing = await this.findOne(id);
    const maxPos = await this.prisma.task.aggregate({
      where: { statusId: dto.statusId },
      _max: { position: true },
    });

    const targetStatus = await this.prisma.status.findUniqueOrThrow({ where: { id: dto.statusId } });
    const sourceStatus = await this.prisma.status.findUnique({ where: { id: existing.statusId } });
    const now = new Date();
    const doneAt = targetStatus.isDone ? now : (sourceStatus?.isDone ? null : undefined);

    const data: any = {
      statusId: dto.statusId,
      position: dto.position ?? (maxPos._max.position ?? -1) + 1,
    };
    if (doneAt !== undefined) data.doneAt = doneAt;

    const task = await this.prisma.task.update({
      where: { id },
      data,
      include: {
        assignee: { select: { id: true, email: true, displayName: true, role: true } },
        labels: { include: { label: true } },
        status: { include: { board: true } },
        board: { select: { identifier: true } },
      },
    });

    const newStatus = await this.prisma.status.findUnique({ where: { id: dto.statusId } });
    const activity = await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: 'moved',
        detail: JSON.stringify({ from: existing.statusId, to: dto.statusId, statusName: newStatus?.name }),
      },
    });
    await this.notifications.dispatchFromActivity(activity);

    this.events.emit('task:moved', task, task.status.boardId);
    return withTaskNumber(task);
  }

  /**
   * Publish / unpublish a task — the toggle behind the public share link.
   *
   * Deliberately NOT part of update(): that method's activity diff uses truthy
   * checks (`if (dto.title && ...)`), so a `false` would be applied but never
   * logged — meaning un-publishing, the one action that must reliably kill
   * access, would vanish from the history. Keeping it separate also keeps
   * `isPublic` out of UpdateTaskDto, so MCP's generic tasks_update can't flip a
   * task public as a side effect of a field write.
   *
   * Idempotent: re-publishing an already-public task is a no-op and writes no
   * activity row, so the log reads as a history of actual state changes.
   */
  async setPublic(id: string, isPublic: boolean, user?: { id: string; displayName: string }) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { isPublic: true },
    });
    if (!existing) throw new NotFoundException('Task not found');

    const taskInclude = {
      assignee: { select: { id: true, email: true, displayName: true, role: true } },
      labels: { include: { label: true } },
      status: { include: { board: true } },
      board: { select: { identifier: true } },
    };

    if (existing.isPublic === isPublic) {
      const unchanged = await this.prisma.task.findUniqueOrThrow({
        where: { id },
        include: taskInclude,
      });
      return withTaskNumber(unchanged);
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: { isPublic },
      include: taskInclude,
    });

    await this.prisma.activity.create({
      data: {
        taskId: id,
        actorId: user?.id ?? null,
        actor: user?.displayName ?? 'system',
        action: isPublic ? 'published' : 'unpublished',
      },
    });

    this.events.emit('task:updated', task, task.status.boardId);
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
    const boardId = task.status.boardId;

    // C6 — orphan promotion: clear parentId on children before deleting.
    const orphans = await this.prisma.task.findMany({ where: { parentId: id } });
    if (orphans.length > 0) {
      await this.prisma.task.updateMany({ where: { parentId: id }, data: { parentId: null } });
      for (const child of orphans) {
        const refreshed = await this.prisma.task.findUnique({
          where: { id: child.id },
          include: {
            assignee: { select: { id: true, email: true, displayName: true, role: true } },
            labels: { include: { label: true } },
            status: { include: { board: true } },
            board: { select: { identifier: true } },
          },
        });
        if (refreshed) this.events.emit('task:updated', withTaskNumber(refreshed), boardId);
      }
    }

    // Relation cleanup: hard-delete relation rows touching this task, emit
    // relation:deleted per row. (Sub-task orphan promotion handled above.)
    await this.relations.cleanupForTask(id);

    await this.prisma.task.delete({ where: { id } });

    this.events.emit('task:deleted', { id }, boardId);
  }

  async attachLabel(taskId: string, labelId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { status: { select: { boardId: true } } },
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
        status: { select: { boardId: true } },
      },
    });

    this.events.emit('task.label.attached', updatedTask, task.status.boardId);
    return taskLabel;
  }

  async detachLabel(taskId: string, labelId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { status: { select: { boardId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.taskLabel.delete({
      where: { taskId_labelId: { taskId, labelId } },
    });

    const updatedTask = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        labels: { include: { label: true } },
        status: { select: { boardId: true } },
      },
    });

    this.events.emit('task.label.detached', updatedTask, task.status.boardId);
  }
}