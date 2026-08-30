import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { parseMentions } from './mentions';

@Injectable()
export class MentionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Parses `@<DisplayName>` tokens in `text`, auto-subscribes resolved users to
   * the task and notifies the ones who got a NEW subscription. Already-
   * subscribed users are skipped so the normal `commented` activity dispatch
   * covers them and repeated autosaves of unchanged text do not re-notify.
   * The actor is never self-notified.
   */
  async processMentions(
    taskId: string,
    text: string,
    actor?: { id?: string | null; displayName?: string | null },
  ): Promise<void> {
    if (!text || !text.includes('@')) return;

    const users = await this.prisma.user.findMany({ select: { id: true, displayName: true } });
    const mentioned = parseMentions(text, users).filter((u) => u.id !== actor?.id);
    if (mentioned.length === 0) return;

    const existing = await this.prisma.taskSubscription.findMany({
      where: { taskId, userId: { in: mentioned.map((u) => u.id) } },
      select: { userId: true },
    });
    const alreadySubscribed = new Set(existing.map((e) => e.userId));
    const fresh = mentioned.filter((u) => !alreadySubscribed.has(u.id));

    if (fresh.length === 0) return;

    await Promise.all(
      fresh.map((u) =>
        this.prisma.taskSubscription.upsert({
          where: { taskId_userId: { taskId, userId: u.id } },
          update: {},
          create: { taskId, userId: u.id },
        }),
      ),
    );

    const activity = await this.prisma.activity.create({
      data: {
        taskId,
        actorId: actor?.id ?? null,
        actor: actor?.displayName ?? 'system',
        action: 'mentioned',
        detail: JSON.stringify({ mentioned: fresh.map((u) => u.displayName) }),
      },
    });

    await this.notifications.notifyMentions(
      taskId,
      activity.id,
      fresh.map((u) => u.id),
      actor?.displayName ?? 'system',
    );
  }
}
