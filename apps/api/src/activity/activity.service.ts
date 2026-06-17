import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  async findByTask(taskId: string) {
    return this.prisma.activity.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async findByBoard(boardId: string) {
    return this.prisma.activity.findMany({
      where: { task: { list: { boardId } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { task: { select: { id: true, title: true } } },
    });
  }
}
