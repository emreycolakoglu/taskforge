import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { BoardsModule } from './boards/boards.module';
import { ListsModule } from './lists/lists.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { LabelsModule } from './labels/labels.module';
import { ActivityModule } from './activity/activity.module';
import { McpModule } from './mcp/mcp.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    PrismaModule,
    BoardsModule,
    ListsModule,
    TasksModule,
    CommentsModule,
    LabelsModule,
    ActivityModule,
    McpModule,
    EventsModule,
  ],
})
export class AppModule {}
