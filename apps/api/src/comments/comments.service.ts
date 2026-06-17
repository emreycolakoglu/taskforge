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

  async create(dto: CreateCommentDto) {
    const comment = await this.prisma.comment.create({
      data: {
        taskId: dto.taskId,
        author: dto.author,
        body: dto.body,
      },
    });

    await this.prisma.activity.create({
      data: {
        taskId: dto.taskId,
        actor: dto.author,
        action: 'commented',
        detail: JSON.stringify({ commentId: comment.id }),
      },
    });

    this.events.emit('comment:created', comment);
    return comment;
  }

  async remove(id: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    return this.prisma.comment.delete({ where: { id } });
  }
}
