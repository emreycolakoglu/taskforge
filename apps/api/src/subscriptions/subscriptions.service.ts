import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async subscribe(taskId: string, userId: string) {
    return this.prisma.taskSubscription.upsert({
      where: { taskId_userId: { taskId, userId } },
      update: {},
      create: { taskId, userId },
    });
  }

  async unsubscribe(taskId: string, userId: string): Promise<void> {
    await this.prisma.taskSubscription.deleteMany({ where: { taskId, userId } });
  }

  async getSubscription(taskId: string, userId: string) {
    const row = await this.prisma.taskSubscription.findUnique({
      where: { taskId_userId: { taskId, userId } },
    });
    return { subscribed: !!row };
  }
}