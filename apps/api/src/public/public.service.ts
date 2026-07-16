import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PublicService — read-only projection of a task for unauthenticated visitors.
 *
 * This is the only place in the API that serves data without a session, so the
 * shape is built by hand rather than reused from TasksService.findOne(), which
 * returns assignee.email, assignee.role and the whole nested board object.
 *
 * Two rules keep this honest, and both are load-bearing:
 *
 *   1. `select`, never `include`. A new column on Task or User must be opted
 *      into here deliberately; it can never ride along by default. If you are
 *      tempted to switch this to `include`, don't — that is the leak.
 *
 *   2. Nothing that wasn't deliberately published. Activity, sub-tasks, the
 *      parent task and relations are all omitted on purpose: publishing TF-1
 *      must not disclose the titles of tasks nobody published. Comments and the
 *      assignee's display name are in scope by design.
 */
@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  /**
   * Look up a published task by its human-facing identity (e.g. "TF" + 123).
   *
   * Throws NotFoundException both when the task does not exist and when it
   * exists but isn't published — the two cases are deliberately
   * indistinguishable, so a scanner can't map which task numbers are real.
   */
  async findPublicTask(identifier: string, number: number) {
    if (!Number.isInteger(number) || number < 1) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.prisma.task.findFirst({
      where: {
        number,
        isPublic: true,
        board: { identifier },
      },
      select: {
        number: true,
        title: true,
        description: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        board: { select: { identifier: true } },
        status: { select: { name: true, color: true } },
        assignee: { select: { displayName: true } },
        labels: { select: { label: { select: { name: true, color: true } } } },
        comments: {
          select: { author: true, body: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) throw new NotFoundException('Task not found');

    return {
      taskNumber: `${task.board.identifier}-${task.number}`,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      assignee: task.assignee?.displayName ?? null,
      labels: task.labels.map((l) => l.label),
      comments: task.comments,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
