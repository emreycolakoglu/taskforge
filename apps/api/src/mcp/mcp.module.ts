import { Module } from '@nestjs/common';
import { McpTransportController } from './mcp-transport.controller';
import { McpService } from './mcp.service';
import { McpServerFactory } from './mcp-server.factory';
import { EventsModule } from '../events/events.module';
import { RelationsModule } from '../relations/relations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { CommentsModule } from '../comments/comments.module';
import { MentionsModule } from '../mentions/mentions.module';
import { MembersModule } from '../members/members.module';
import { LabelsModule } from '../labels/labels.module';
import { StatusesModule } from '../statuses/statuses.module';
import { ViewsModule } from '../views/views.module';

@Module({
  imports: [
    EventsModule,
    RelationsModule,
    SubscriptionsModule,
    NotificationsModule,
    DocumentsModule,
    CommentsModule,
    MentionsModule,
    MembersModule,
    LabelsModule,
    StatusesModule,
    ViewsModule,
  ],
  controllers: [McpTransportController],
  providers: [McpService, McpServerFactory],
  exports: [McpService],
})
export class McpModule {}
