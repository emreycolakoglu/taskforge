import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { EventsModule } from '../events/events.module';
import { LabelsModule } from '../labels/labels.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [EventsModule, LabelsModule, AttachmentsModule],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}
