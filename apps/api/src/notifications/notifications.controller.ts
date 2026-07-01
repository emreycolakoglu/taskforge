import { Controller, Get, Post, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { NotificationsService } from './notifications.service';

interface AuthedUser {
  id: string;
  displayName: string;
}

@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(@Query('filter') filter: 'unread' | 'all' | undefined, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.listForUser(user.id, filter ?? 'all');
  }

  @Get('unread-count')
  unreadCount(@Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.unreadCount(user.id);
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    await this.service.markRead(id, user.id);
    return { read: true };
  }

  @Post('read-all')
  markAllRead(@Req() req: Request) {
    const user = (req as any).user as AuthedUser;
    return this.service.markAllRead(user.id);
  }
}