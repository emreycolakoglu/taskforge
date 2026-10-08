import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { EventsModule } from '../events/events.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [EventsModule, AttachmentsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
