import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { EventsModule } from '../events/events.module';
import { RelationsModule } from '../relations/relations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MentionsModule } from '../mentions/mentions.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [
    EventsModule,
    RelationsModule,
    SubscriptionsModule,
    NotificationsModule,
    MentionsModule,
    AttachmentsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
