import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

interface ActivityInput {
  id: string;
  taskId: string;
  actorId: string | null;
  actor: string;
  action: string;
  detail: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  private isNotifying(activity: ActivityInput): boolean {
    if (activity.action === 'commented') return true;
    if (activity.action === 'archived') return true;
    if (activity.action === 'updated') {
      try {
        const parsed = JSON.parse(activity.detail ?? '{}') as { changes?: string[] };
        return (parsed.changes ?? []).some((c) => c.startsWith('status:'));
      } catch {
        return false;
      }
    }
    return false;
  }

  async dispatchFromActivity(activity: ActivityInput): Promise<void> {
    if (!this.isNotifying(activity)) return;

    const subscriptions = await this.prisma.taskSubscription.findMany({
      where: { taskId: activity.taskId, userId: { not: activity.actorId ?? '__none__' } },
    });
    if (subscriptions.length === 0) return;

    const task = await this.prisma.task.findUnique({
      where: { id: activity.taskId },
      include: { board: { select: { identifier: true } } },
    });
    if (!task) return;
    const taskNumber = task.board?.identifier ? `${task.board.identifier}-${task.number}` : `#${task.number}`;

    const summary = this.buildSummary(activity.actor, activity.action, taskNumber, task.title, activity.detail);

    const rows = subscriptions.map((s) => ({
      userId: s.userId,
      taskId: activity.taskId,
      activityId: activity.id,
      action: activity.action,
      summary,
    }));

    await this.prisma.notification.createMany({ data: rows });

    for (const row of rows) {
      const created = await this.prisma.notification.findFirst({
        where: { userId: row.userId, activityId: activity.id },
      });
      if (created) {
        this.events.emit('notification:created', created, undefined, { userRoom: row.userId });
      }
    }
  }

  private buildSummary(actor: string, action: string, taskNumber: string, title: string, detail: string | null): string {
    if (action === 'commented') {
      return `${actor} commented on ${taskNumber} "${title}"`;
    }
    if (action === 'archived') {
      return `${actor} archived ${taskNumber} "${title}"`;
    }
    if (action === 'updated') {
      try {
        const parsed = JSON.parse(detail ?? '{}') as { changes?: string[] };
        const statusLine = (parsed.changes ?? []).find((c) => c.startsWith('status:'));
        const newStatus = statusLine?.replace('status:', '').trim();
        return `${actor} changed status of ${taskNumber} to ${newStatus}`;
      } catch {
        return `${actor} updated ${taskNumber} "${title}"`;
      }
    }
    return `${actor} ${action} ${taskNumber} "${title}"`;
  }

  async listForUser(userId: string, filter: 'unread' | 'all' = 'all', limit = 50) {
    const where: any = { userId };
    if (filter === 'unread') where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { task: { select: { id: true, title: true, board: { select: { identifier: true } } } } },
    });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }
}