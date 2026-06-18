import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateCommentDto } from './dto/comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsService,
  ) {}

  async findByTask(taskId: string) {
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });
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

    await this.prisma.activity.create({
      data: {
        taskId: dto.taskId,
        actorId: user?.id ?? dto.authorId ?? null,
        actor: user?.displayName ?? dto.author ?? 'system',
        action: 'commented',
        detail: JSON.stringify({ commentId: comment.id }),
      },
    });

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: { list: { select: { boardId: true } } },
    });

    this.events.emit('comment:created', comment, task?.list?.boardId);
    return comment;
  }

  async remove(id: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');

    const task = await this.prisma.task.findUnique({
      where: { id: comment.taskId },
      include: { list: { select: { boardId: true } } },
    });

    await this.prisma.comment.delete({ where: { id } });
    this.events.emit('comment:deleted', { id }, task?.list?.boardId);
  }
}