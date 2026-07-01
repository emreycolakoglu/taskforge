import { Controller, Post, Delete, Get, Param, Req } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/tasks')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Post(':taskId/subscription')
  subscribe(@Param('taskId') taskId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.subscribe(taskId, user.id);
  }

  @Delete(':taskId/subscription')
  async unsubscribe(@Param('taskId') taskId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    await this.service.unsubscribe(taskId, user.id);
    return { subscribed: false };
  }

  @Get(':taskId/subscription')
  getSubscription(@Param('taskId') taskId: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.getSubscription(taskId, user.id);
  }
}