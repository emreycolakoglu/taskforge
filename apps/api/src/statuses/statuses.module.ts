import { Module } from '@nestjs/common';
import { StatusesController } from './statuses.controller';
import { StatusesService } from './statuses.service';
import { EventsModule } from '../events/events.module';
import { MembersModule } from '../members/members.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [EventsModule, MembersModule, AttachmentsModule],
  controllers: [StatusesController],
  providers: [StatusesService],
  exports: [StatusesService],
})
export class StatusesModule {}
