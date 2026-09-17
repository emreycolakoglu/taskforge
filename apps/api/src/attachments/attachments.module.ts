import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { EventsModule } from '../events/events.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [EventsModule, MembersModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
