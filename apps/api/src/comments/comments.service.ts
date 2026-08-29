import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MentionsService } from '../mentions/mentions.service';
import { CreateCommentDto } from './dto/comment.dto';
import { groupReactions, isValidReaction, toggleCommentReaction } from './reactions';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private notifications: NotificationsService,
    private mentions: MentionsService,
  ) {}

  /**
   * All comments for a task as a nested tree. Roots are newest-first;
   * replies within a thread are oldest-first (reading order). Replies whose
   * parent is missing from the fetch (defensive — validation keeps parents
   * same-task) surface as roots so no comment is ever dropped.
   */
  async findByTask(taskId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    const byId = new Map<
      string,
      Omit<(typeof comments)[number], 'reactions'> & {
        reactions: ReturnType<typeof groupReactions>;
        replies: any[];
      }
    >();
    for (const c of comments) {
      byId.set(c.id, { ...c, reactions: groupReactions(c.reactions), replies: [] });
    }

    const roots: Array<
      Omit<(typeof comments)[number], 'reactions'> & {
        reactions: ReturnType<typeof groupReactions>;
        replies: any[];
      }
    > = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.replies.push(node);
      else roots.push(node);
    }
    for (const node of byId.values()) {
      node.replies.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return roots;
  }

  async create(dto: CreateCommentDto, user?: { id: string; displayName: string }) {
    if (dto.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: dto.parentId } });
      if (!parent || parent.taskId !== dto.taskId) {
        throw new BadRequestException('Invalid parent comment');
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        taskId: dto.taskId,
        parentId: dto.parentId ?? null,
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

    const mentionActor =
      user ?? (dto.authorId ? { id: dto.authorId, displayName: dto.author ?? '' } : undefined);
    await this.mentions.processMentions(dto.taskId, dto.body, mentionActor);

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

    const childCount = await this.prisma.comment.count({ where: { parentId: id } });
    if (childCount > 0) {
      // Tombstone: keep the row so children's parentId still resolves. The
      // body is blanked and deletedAt set; the UI renders a muted marker.
      await this.prisma.comment.update({
        where: { id },
        data: { deletedAt: new Date(), body: '' },
      });
    } else {
      await this.prisma.comment.delete({ where: { id } });
    }

    // Activity log — content not logged, just the action
    await this.prisma.activity.create({
      data: {
        taskId: comment.taskId,
        actorId: user?.id ?? null,
        actor: user?.id ? 'user' : 'system',
        action: 'deleted_comment',
      },
    });

    this.events.emit('comment:deleted', { id, taskId: comment.taskId }, task?.status?.boardId);
  }

  async update(id: string, body: string, user?: { id: string; displayName: string; role: string }) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted comment');
    }

    if (user) {
      const isAuthor = comment.authorId === user.id;
      const isAdmin = user.role === 'admin';
      if (!isAuthor && !isAdmin) {
        throw new ForbiddenException('You can only edit your own comments');
      }
    } else {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const normalized = await this.prisma.$transaction(async (tx) => {
      await tx.comment.updateMany({
        where: { id, editedAt: null },
        data: { editedAt: new Date() },
      });

      await tx.comment.update({
        where: { id },
        data: { body },
      });

      const updated = await tx.comment.findUniqueOrThrow({
        where: { id },
        include: { reactions: { select: { userId: true, emoji: true } } },
      });
      const normalized = { ...updated, reactions: groupReactions(updated.reactions) };

      await tx.activity.create({
        data: {
          taskId: comment.taskId,
          actorId: user.id,
          actor: user.displayName,
          action: 'comment_edited',
          detail: JSON.stringify({ commentId: comment.id }),
        },
      });

      return normalized;
    });

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { status: { select: { boardId: true } } },
    });

    this.events.emit('comment:updated', normalized, task?.status?.boardId);
    await this.mentions.processMentions(comment.taskId, body, user ?? undefined);
    return normalized;
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

    const reaction = await toggleCommentReaction(this.prisma, commentId, user.id, emoji);

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { status: { select: { boardId: true } } },
    });

    this.events.emit(
      'comment:reaction:toggled',
      { commentId, ...reaction, taskId: comment.taskId },
      task?.status?.boardId,
    );

    return reaction;
  }
}
