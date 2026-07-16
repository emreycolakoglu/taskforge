import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { BoardsModule } from './boards/boards.module';
import { StatusesModule } from './statuses/statuses.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { LabelsModule } from './labels/labels.module';
import { ActivityModule } from './activity/activity.module';
import { McpModule } from './mcp/mcp.module';
import { RelationsModule } from './relations/relations.module';
import { EventsModule } from './events/events.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule,
    SettingsModule,
    BoardsModule,
    StatusesModule,
    TasksModule,
    CommentsModule,
    LabelsModule,
    ActivityModule,
    McpModule,
    RelationsModule,
    EventsModule,
    SubscriptionsModule,
    NotificationsModule,
    PublicModule,
  ],
})
export class AppModule {}
