import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { EventsModule } from '../events/events.module';
import { LabelsModule } from '../labels/labels.module';

@Module({
  imports: [EventsModule, LabelsModule],
  controllers: [BoardsController],
  providers: [BoardsService],
  exports: [BoardsService],
})
export class BoardsModule {}