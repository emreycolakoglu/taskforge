import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { EventsModule } from '../events/events.module';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [EventsModule, MembersModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
