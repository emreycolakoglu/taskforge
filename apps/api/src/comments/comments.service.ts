import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto } from './dto/comment.dto';
import { isValidReaction } from './reactions';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private notifications: NotificationsService,
  ) {}

  async findByTask(taskId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    return comments.map((c) => ({
      ...c,
      reactions: this.groupReactions(c.reactions),
    }));
  }

  private groupReactions(
    rows: { userId: string; emoji: string }[],
  ): { emoji: string; userIds: string[] }[] {
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const list = map.get(r.emoji);
      if (list) list.push(r.userId);
      else map.set(r.emoji, [r.userId]);
    }
    return Array.from(map.entries())
      .map(([emoji, userIds]) => ({ emoji, userIds }))
      .sort((a, b) => (a.emoji < b.emoji ? -1 : a.emoji > b.emoji ? 1 : 0));
  }

  async create(dto: CreateCommentDto, user?: { id: string; displayName: string }) {
    const comment = await this.prisma.comment.create({
      data: {
        taskId: dto.taskId,
        authorId: user?.id ?? dto.authorId ?? null,
        author: user?.displayName ?? dto.author ?? 'system',
        body: dto.body,
      },
    });

    const activity = await this.prisma.activity.create({
      data: {
        taskId: dto.taskId,
        actorId: user?.id ?? dto.authorId ?? null,
        actor: user?.displayName ?? dto.author ?? 'system',
        action: 'commented',
        detail: JSON.stringify({ commentId: comment.id }),
      },
    });
    await this.notifications.dispatchFromActivity(activity);

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { status: { select: { boardId: true } } },
    });

    this.events.emit('comment:created', comment, task?.status?.boardId);
    return comment;
  }

  async remove(id: string, user?: { id: string; role: string }) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');

    // Authorization: author can delete their own; admin can delete any;
    // anonymous comments (authorId null) only admin.
    if (user) {
      const isAuthor = comment.authorId === user.id;
      const isAdmin = user.role === 'admin';
      if (!isAuthor && !isAdmin) {
        throw new ForbiddenException('You can only delete your own comments');
      }
    }

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { status: { select: { boardId: true } } },
    });

    await this.prisma.comment.delete({ where: { id } });

    // Activity log — content not logged, just the action
    await this.prisma.activity.create({
      data: {
        taskId: comment.taskId,
        actorId: user?.id ?? null,
        actor: user?.id ? 'user' : 'system',
        action: 'deleted_comment',
      },
    });

    this.events.emit('comment:deleted', { id }, task?.status?.boardId);
  }

  async update(id: string, body: string, user?: { id: string; displayName: string; role: string }) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');

    if (user) {
      const isAuthor = comment.authorId === user.id;
      const isAdmin = user.role === 'admin';
      if (!isAuthor && !isAdmin) {
        throw new ForbiddenException('You can only edit your own comments');
      }
    } else {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.prisma.comment.update({
      where: { id },
      data: {
        body,
        editedAt: comment.editedAt ?? new Date(),
      },
      include: { reactions: { select: { userId: true, emoji: true } } },
    });

    await this.prisma.activity.create({
      data: {
        taskId: comment.taskId,
        actorId: user.id,
        actor: user.displayName,
        action: 'comment_edited',
        detail: JSON.stringify({ commentId: comment.id }),
      },
    });

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { status: { select: { boardId: true } } },
    });

    this.events.emit('comment:updated', updated, task?.status?.boardId);
    return updated;
  }

  async react(
    commentId: string,
    emoji: string,
    user: { id: string; displayName: string; role: string },
  ) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');

    if (!isValidReaction(emoji)) {
      throw new BadRequestException('Invalid reaction emoji');
    }

    const existing = await this.prisma.commentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId, userId: user.id, emoji } },
    });

    if (existing) {
      await this.prisma.commentReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.commentReaction.create({
        data: { commentId, userId: user.id, emoji },
      });
    }

    const reactions = await this.prisma.commentReaction.findMany({
      where: { commentId, emoji },
      select: { userId: true },
    });

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { status: { select: { boardId: true } } },
    });

    this.events.emit(
      'comment:reaction:toggled',
      { commentId, emoji, userIds: reactions.map((r) => r.userId), taskId: comment.taskId },
      task?.status?.boardId,
    );

    return { emoji, userIds: reactions.map((r) => r.userId) };
  }
}
