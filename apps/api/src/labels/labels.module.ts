import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { EventsModule } from '../events/events.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [EventsModule, MembersModule],
  controllers: [LabelsController],
  providers: [LabelsService],
  exports: [LabelsService],
})
export class LabelsModule {}
